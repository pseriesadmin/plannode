-- Phase 1C: reorder_siblings passthrough in plannode_apply_structure_op_to_nodes
-- Phase 4:  op_log_complete flag + plannode_bootstrap_structure_ops_from_snapshot RPC
-- 선행: 20260601_plannode_project_structure_ops.sql
--       20260603_fix_structure_ops_acl_forbidden.sql (2-step ACL helpers 필요)

-- ── Phase 1C: reorder_siblings passthrough ──────────────────────────────────
-- client-side replay에서만 처리 — SQL은 op를 소실 없이 통과 (no-op)
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

  -- reorder_siblings: client-side replay에서만 처리 — 순서대로 통과
  if v_type = 'reorder_siblings' then
    return p_nodes;
  end if;

  return p_nodes;
end;
$$;

-- ── Phase 4: op_log_complete 컬럼 추가 ────────────────────────────────────────
alter table public.plannode_project_collab_meta
  add column if not exists op_log_complete boolean not null default false;

comment on column public.plannode_project_collab_meta.op_log_complete is
  'true = 이 프로젝트는 op log가 완전체 — LWW slice merge 영구 비활성화 가능.';

-- ── plannode_fetch_structure_ops_since: op_log_complete 포함 ──────────────────
-- 중요: 20260603_fix_structure_ops_acl_forbidden.sql의 2-step ACL 유지
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
  v_op_log_complete boolean;
begin
  if p_workspace_user_id is null or p_project_id is null or length(trim(p_project_id)) = 0 then
    raise exception 'invalid arguments';
  end if;

  -- Step 1: 호출자가 이 프로젝트에 접근 가능한지 (email 기준)
  if not public.plannode_acl_caller_has_project_access(p_project_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Step 2: p_workspace_user_id 가 이 프로젝트의 실제 소유자 워크스페이스인지
  if not public.plannode_acl_workspace_is_project_owner(p_project_id, p_workspace_user_id) then
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

  select m.revision, m.last_applied_seq, coalesce(m.op_log_complete, false)
  into v_rev, v_last_seq, v_op_log_complete
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
    'nodes', coalesce(v_nodes, '[]'::jsonb),
    'op_log_complete', coalesce(v_op_log_complete, false)
  );
end;
$$;

-- ── Phase 4: bootstrap RPC ────────────────────────────────────────────────────
-- 기존 스냅샷 → add_node ops 일괄 변환 → op_log_complete = true
-- idempotent: op_log_complete가 이미 true면 skip
create or replace function public.plannode_bootstrap_structure_ops_from_snapshot(
  p_workspace_user_id uuid,
  p_project_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nodes jsonb;
  v_node jsonb;
  v_last_seq bigint;
  v_rev bigint;
  v_op_complete boolean;
  v_next_seq bigint;
  v_new_rev bigint;
  v_count int := 0;
begin
  if v_uid is null then
    raise exception 'auth required';
  end if;
  if p_workspace_user_id is null or p_project_id is null or length(trim(p_project_id)) = 0 then
    raise exception 'invalid arguments';
  end if;

  -- 소유자만 bootstrap 가능
  if v_uid is distinct from p_workspace_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 이미 완료된 경우 no-op
  select m.op_log_complete, m.last_applied_seq, m.revision
  into v_op_complete, v_last_seq, v_rev
  from public.plannode_project_collab_meta m
  where m.workspace_user_id = p_workspace_user_id
    and m.project_id = p_project_id;

  if coalesce(v_op_complete, false) then
    return jsonb_build_object('bootstrapped', false, 'reason', 'already_complete');
  end if;

  -- 현재 스냅샷 노드 읽기
  select coalesce(w.nodes_by_project_json->p_project_id, '[]'::jsonb)
  into v_nodes
  from public.plannode_workspace w
  where w.user_id = p_workspace_user_id;

  if v_nodes is null or jsonb_array_length(coalesce(v_nodes, '[]'::jsonb)) = 0 then
    insert into public.plannode_project_collab_meta (
      workspace_user_id, project_id, revision, last_applied_seq, op_log_complete
    )
    values (p_workspace_user_id, p_project_id, 1, 0, true)
    on conflict (workspace_user_id, project_id) do update
    set
      op_log_complete = true,
      revision = plannode_project_collab_meta.revision + 1;
    return jsonb_build_object('bootstrapped', true, 'count', 0);
  end if;

  v_next_seq := coalesce(v_last_seq, 0);

  for v_node in select * from jsonb_array_elements(v_nodes)
  loop
    if v_node->>'id' is null then
      continue;
    end if;
    v_next_seq := v_next_seq + 1;
    insert into public.plannode_project_structure_ops (
      workspace_user_id, project_id, seq, op, client_id, actor_user_id
    )
    values (
      p_workspace_user_id,
      p_project_id,
      v_next_seq,
      jsonb_build_object('type', 'add_node', 'node', v_node),
      'bootstrap',
      v_uid
    )
    on conflict (workspace_user_id, project_id, seq) do nothing;
    v_count := v_count + 1;
  end loop;

  v_new_rev := coalesce(v_rev, 0) + 1;

  insert into public.plannode_project_collab_meta (
    workspace_user_id, project_id, revision, last_applied_seq, op_log_complete
  )
  values (p_workspace_user_id, p_project_id, v_new_rev, v_next_seq, true)
  on conflict (workspace_user_id, project_id) do update
  set
    revision = v_new_rev,
    last_applied_seq = v_next_seq,
    op_log_complete = true;

  return jsonb_build_object('bootstrapped', true, 'count', v_count);
end;
$$;

comment on function public.plannode_bootstrap_structure_ops_from_snapshot(uuid, text) is
  'Phase 4: 기존 스냅샷 → add_node op batch 변환 → op_log_complete = true. 소유자 전용, idempotent.';

-- ── Phase 3: Realtime publication ────────────────────────────────────────────
do $$
begin
  begin
    alter publication supabase_realtime add table public.plannode_project_structure_ops;
  exception when others then
    null;
  end;
end;
$$;

-- RLS: ACL member select 허용 (policy 이미 있으면 skip)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'plannode_project_structure_ops'
      and policyname = 'structure_ops_select_acl'
  ) then
    execute $policy$
      create policy "structure_ops_select_acl" on public.plannode_project_structure_ops
        for select using (
          exists (
            select 1
            from public.plannode_project_acl a
            where a.project_id = plannode_project_structure_ops.project_id
              and (
                lower(trim(a.email)) = lower(trim(coalesce(nullif(trim(auth.jwt() ->> 'email'), ''), '')))
                or public.plannode_acl_email_belongs_to_session(a.email)
              )
              and public.plannode_acl_workspace_is_project_owner(
                plannode_project_structure_ops.project_id,
                plannode_project_structure_ops.workspace_user_id
              )
          )
        )
    $policy$;
  end if;
end;
$$;

notify pgrst, 'reload schema';
