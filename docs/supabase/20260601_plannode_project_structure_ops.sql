-- EPIC E Tier 1: structure op log + 서버 권위 apply (Broadcast 수렴 정본).
-- 선행: plannode_project_collab_revision_lock.sql · 20260526_plannode_merge_slice_disable_prune_on_collab.sql
-- Supabase SQL Editor 실행 후 NOTIFY.

alter table public.plannode_project_collab_meta
  add column if not exists last_applied_seq bigint not null default 0;

comment on column public.plannode_project_collab_meta.last_applied_seq is
  'structure ops append-only seq — fetch since 이후 pull용.';

create table if not exists public.plannode_project_structure_ops (
  workspace_user_id uuid not null references auth.users (id) on delete cascade,
  project_id text not null,
  seq bigint not null,
  op jsonb not null,
  client_id text not null default '',
  actor_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (workspace_user_id, project_id, seq)
);

create index if not exists plannode_project_structure_ops_project_seq_idx
  on public.plannode_project_structure_ops (workspace_user_id, project_id, seq);

comment on table public.plannode_project_structure_ops is
  '공유 프로젝트 structure ops append-only log (add/delete/move/update).';

alter table public.plannode_project_structure_ops enable row level security;

-- ── 서버: subtree id 수집 (delete_node) ──
create or replace function public.plannode_collect_subtree_node_ids(
  p_nodes jsonb,
  p_root_id text
)
returns text[]
language plpgsql
stable
set search_path = public
as $$
declare
  v_ids text[] := array[]::text[];
  v_queue text[] := array[p_root_id];
  v_cur text;
  v_child text;
begin
  if p_root_id is null or length(trim(p_root_id)) = 0 then
    return v_ids;
  end if;
  while array_length(v_queue, 1) is not null loop
    v_cur := v_queue[1];
    v_queue := v_queue[2:array_length(v_queue, 1)];
    if v_cur = any(v_ids) then
      continue;
    end if;
    v_ids := array_append(v_ids, v_cur);
    for v_child in
      select nullif(trim(e->>'id'), '')
      from jsonb_array_elements(coalesce(p_nodes, '[]'::jsonb)) e
      where nullif(trim(e->>'parent_id'), '') = v_cur
    loop
      if v_child is not null then
        v_queue := array_append(v_queue, v_child);
      end if;
    end loop;
  end loop;
  return v_ids;
end;
$$;

-- ── 단일 structure op → nodes jsonb ──
create or replace function public.plannode_apply_structure_op_to_nodes(
  p_nodes jsonb,
  p_op jsonb
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_type text := coalesce(p_op->>'type', '');
  v_node jsonb;
  v_id text;
  v_ids text[];
  v_out jsonb;
begin
  p_nodes := coalesce(p_nodes, '[]'::jsonb);

  if v_type = 'add_node' then
    v_node := p_op->'node';
    if v_node is null or v_node = 'null'::jsonb then
      return p_nodes;
    end if;
    return public.plannode_merge_nodes_jsonb_lww(p_nodes, jsonb_build_array(v_node), false);
  end if;

  if v_type = 'update_node' then
    v_node := p_op->'node';
    if v_node is null or v_node = 'null'::jsonb then
      return p_nodes;
    end if;
    return public.plannode_merge_nodes_jsonb_lww(p_nodes, jsonb_build_array(v_node), false);
  end if;

  if v_type = 'move_node' then
    v_id := nullif(trim(p_op->>'node_id'), '');
    if v_id is null then
      return p_nodes;
    end if;
    select e into v_node
    from jsonb_array_elements(p_nodes) e
    where e->>'id' = v_id
    limit 1;
    if v_node is null then
      return p_nodes;
    end if;
    v_node := v_node
      || jsonb_build_object(
        'parent_id', coalesce(p_op->>'parent_id', v_node->>'parent_id'),
        'mx', coalesce((p_op->>'mx')::numeric, (v_node->>'mx')::numeric),
        'my', coalesce((p_op->>'my')::numeric, (v_node->>'my')::numeric)
      );
    if p_op ? 'num' and nullif(trim(p_op->>'num'), '') is not null then
      v_node := v_node || jsonb_build_object('num', p_op->>'num');
    end if;
    return public.plannode_merge_nodes_jsonb_lww(p_nodes, jsonb_build_array(v_node), false);
  end if;

  if v_type = 'delete_node' then
    v_id := nullif(trim(p_op->>'node_id'), '');
    if v_id is null then
      return p_nodes;
    end if;
    v_ids := public.plannode_collect_subtree_node_ids(p_nodes, v_id);
    select coalesce(jsonb_agg(e), '[]'::jsonb)
    into v_out
    from jsonb_array_elements(p_nodes) e
    where not (e->>'id' = any(v_ids));
    return coalesce(v_out, '[]'::jsonb);
  end if;

  return p_nodes;
end;
$$;

-- ── append ops batch ──
create or replace function public.plannode_append_structure_ops(
  p_workspace_user_id uuid,
  p_project_id text,
  p_ops jsonb,
  p_client_id text default '',
  p_base_revision bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rev bigint;
  v_last_seq bigint;
  v_holder uuid;
  v_exp timestamptz;
  v_projects jsonb;
  v_nodes jsonb;
  v_filtered jsonb;
  v_new_projects jsonb;
  v_proj_nodes jsonb;
  v_op jsonb;
  v_next_seq bigint;
  v_new_rev bigint;
  v_ts timestamptz;
  v_project jsonb;
  v_client_id text := coalesce(nullif(trim(p_client_id), ''), '');
begin
  if v_uid is null then
    raise exception 'auth required';
  end if;
  if p_workspace_user_id is null or p_project_id is null or length(trim(p_project_id)) = 0 then
    raise exception 'invalid arguments';
  end if;
  if p_ops is null or jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) = 0 then
    raise exception 'empty ops';
  end if;

  if not exists (
    select 1
    from public.plannode_project_acl a
    where a.project_id = p_project_id
      and a.workspace_source_user_id is not distinct from p_workspace_user_id
      and (
        lower(trim(a.email)) = lower(trim(coalesce(nullif(trim(auth.jwt() ->> 'email'), ''), '')))
        or public.plannode_acl_email_belongs_to_session(a.email)
      )
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select m.revision, m.last_applied_seq, m.lock_holder, m.lock_expires_at
  into v_rev, v_last_seq, v_holder, v_exp
  from public.plannode_project_collab_meta m
  where m.workspace_user_id = p_workspace_user_id
    and m.project_id = p_project_id;

  if not found then
    v_rev := 0;
    v_last_seq := 0;
    v_holder := null;
    v_exp := null;
  end if;

  if v_holder is not null and v_exp is not null and v_exp > now() and v_holder is distinct from v_uid then
    raise exception 'merge_locked' using errcode = 'P0001';
  end if;

  if p_base_revision is not null and p_base_revision is distinct from v_rev then
    raise exception 'revision_stale' using errcode = 'P0001', detail = v_rev::text;
  end if;

  select w.projects_json, w.nodes_by_project_json
  into v_projects, v_nodes
  from public.plannode_workspace w
  where w.user_id = p_workspace_user_id;

  if not found then
    raise exception 'workspace_not_found' using errcode = 'P0002';
  end if;

  v_projects := coalesce(v_projects, '[]'::jsonb);
  v_nodes := coalesce(v_nodes, '{}'::jsonb);
  v_proj_nodes := coalesce(v_nodes->p_project_id, '[]'::jsonb);

  v_next_seq := coalesce(v_last_seq, 0);

  for v_op in select * from jsonb_array_elements(p_ops)
  loop
    v_next_seq := v_next_seq + 1;
    v_proj_nodes := public.plannode_apply_structure_op_to_nodes(v_proj_nodes, v_op);
    insert into public.plannode_project_structure_ops (
      workspace_user_id, project_id, seq, op, client_id, actor_user_id
    )
    values (
      p_workspace_user_id,
      p_project_id,
      v_next_seq,
      v_op,
      v_client_id,
      v_uid
    );
  end loop;

  select e into v_project
  from jsonb_array_elements(v_projects) e
  where e->>'id' = p_project_id
  limit 1;

  select coalesce(jsonb_agg(e), '[]'::jsonb)
  into v_filtered
  from jsonb_array_elements(v_projects) e
  where e->>'id' is distinct from p_project_id;

  v_new_projects := coalesce(v_filtered, '[]'::jsonb);
  if v_project is not null then
    v_new_projects := v_new_projects || jsonb_build_array(v_project);
  end if;

  v_nodes := jsonb_set(v_nodes, array[p_project_id], v_proj_nodes, true);

  update public.plannode_workspace w
  set
    projects_json = v_new_projects,
    nodes_by_project_json = v_nodes,
    updated_at = now()
  where w.user_id = p_workspace_user_id
  returning w.updated_at into v_ts;

  v_new_rev := coalesce(v_rev, 0) + 1;

  insert into public.plannode_project_collab_meta (
    workspace_user_id, project_id, revision, last_applied_seq, lock_holder, lock_expires_at
  )
  values (p_workspace_user_id, p_project_id, v_new_rev, v_next_seq, null, null)
  on conflict (workspace_user_id, project_id) do update
  set
    revision = v_new_rev,
    last_applied_seq = v_next_seq,
    lock_holder = null,
    lock_expires_at = null;

  return jsonb_build_object(
    'revision', v_new_rev,
    'last_applied_seq', v_next_seq,
    'updated_at', v_ts
  );
end;
$$;

-- ── fetch ops since seq ──
create or replace function public.plannode_fetch_structure_ops_since(
  p_workspace_user_id uuid,
  p_project_id text,
  p_since_seq bigint default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ops jsonb;
  v_rev bigint;
  v_last_seq bigint;
  v_nodes jsonb;
begin
  if p_workspace_user_id is null or p_project_id is null or length(trim(p_project_id)) = 0 then
    raise exception 'invalid arguments';
  end if;

  if not exists (
    select 1
    from public.plannode_project_acl a
    where a.project_id = p_project_id
      and a.workspace_source_user_id is not distinct from p_workspace_user_id
      and (
        lower(trim(a.email)) = lower(trim(coalesce(nullif(trim(auth.jwt() ->> 'email'), ''), '')))
        or public.plannode_acl_email_belongs_to_session(a.email)
      )
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'seq', o.seq,
      'op', o.op,
      'client_id', o.client_id,
      'created_at', o.created_at
    ) order by o.seq
  ), '[]'::jsonb)
  into v_ops
  from public.plannode_project_structure_ops o
  where o.workspace_user_id = p_workspace_user_id
    and o.project_id = p_project_id
    and o.seq > greatest(coalesce(p_since_seq, 0), 0);

  select m.revision, m.last_applied_seq
  into v_rev, v_last_seq
  from public.plannode_project_collab_meta m
  where m.workspace_user_id = p_workspace_user_id
    and m.project_id = p_project_id;

  select w.nodes_by_project_json->p_project_id
  into v_nodes
  from public.plannode_workspace w
  where w.user_id = p_workspace_user_id;

  return jsonb_build_object(
    'ops', coalesce(v_ops, '[]'::jsonb),
    'revision', coalesce(v_rev, 0),
    'last_applied_seq', coalesce(v_last_seq, 0),
    'nodes', coalesce(v_nodes, '[]'::jsonb)
  );
end;
$$;

comment on function public.plannode_append_structure_ops(uuid, text, jsonb, text, bigint) is
  'EPIC E — structure ops batch append + materialize nodes slice + revision++.';

comment on function public.plannode_fetch_structure_ops_since(uuid, text, bigint) is
  'EPIC E — pull ops since seq + current nodes snapshot.';

notify pgrst, 'reload schema';
