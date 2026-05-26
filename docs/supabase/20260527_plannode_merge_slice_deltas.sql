-- Tier 0 T0-2: owner slice fetch 실패·partial payload 시 **변경 노드만** LWW merge (전체 스냅샷 대체).
-- missing id auto-prune 없음 — 20260526 정책과 동일.
-- 선행: 20260526_plannode_merge_slice_disable_prune_on_collab.sql
-- Supabase SQL Editor 실행 후 NOTIFY.

create or replace function public.plannode_workspace_merge_project_slice_deltas(
  p_workspace_user_id uuid,
  p_project_id text,
  p_project jsonb,
  p_node_deltas jsonb,
  p_base_revision bigint default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_projects jsonb;
  v_nodes jsonb;
  v_filtered jsonb;
  v_new_projects jsonb;
  v_ts timestamptz;
  v_uid uuid := auth.uid();
  v_rev bigint;
  v_holder uuid;
  v_exp timestamptz;
  v_merged_nodes jsonb;
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

  select m.revision, m.lock_holder, m.lock_expires_at
  into v_rev, v_holder, v_exp
  from public.plannode_project_collab_meta m
  where m.workspace_user_id = p_workspace_user_id
    and m.project_id = p_project_id;

  if not found then
    v_rev := 0;
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

  v_merged_nodes := public.plannode_merge_nodes_jsonb_lww(
    coalesce(v_nodes->p_project_id, '[]'::jsonb),
    coalesce(p_node_deltas, '[]'::jsonb),
    false
  );

  select coalesce(jsonb_agg(e), '[]'::jsonb)
  into v_filtered
  from jsonb_array_elements(v_projects) as e
  where e->>'id' is distinct from p_project_id;

  v_new_projects := coalesce(v_filtered, '[]'::jsonb) || jsonb_build_array(p_project);
  v_nodes := jsonb_set(v_nodes, array[p_project_id], v_merged_nodes, true);

  update public.plannode_workspace w
  set
    projects_json = v_new_projects,
    nodes_by_project_json = v_nodes,
    updated_at = now()
  where w.user_id = p_workspace_user_id
  returning w.updated_at into v_ts;

  insert into public.plannode_project_collab_meta (
    workspace_user_id, project_id, revision, lock_holder, lock_expires_at
  )
  values (p_workspace_user_id, p_project_id, 1, null, null)
  on conflict (workspace_user_id, project_id) do update
  set
    revision = public.plannode_project_collab_meta.revision + 1,
    lock_holder = null,
    lock_expires_at = null;

  return v_ts;
end;
$$;

comment on function public.plannode_workspace_merge_project_slice_deltas(uuid, text, jsonb, jsonb, bigint) is
  '공유 슬라이스 delta merge — p_node_deltas id 단위 LWW만. fetch 실패·partial push용.';

notify pgrst, 'reload schema';
