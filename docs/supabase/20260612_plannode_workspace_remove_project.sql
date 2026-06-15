-- DEL-WS-SYNC Phase B — 워크스페이스 JSON에서 프로젝트 1건 원자 제거
-- 선행: 20260602_plannode_owner_upsert_collab_revision_bump.sql (plannode_bump_owner_collab_revisions_on_bundle_write)
-- Supabase SQL Editor 실행 후 NOTIFY.

-- ── 소유자: 내 plannode_workspace 행에서 project_id 제거 + revision bump ──
create or replace function public.plannode_workspace_remove_project(
  p_project_id text,
  p_prune_collab_meta boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  old_projects jsonb;
  old_nodes jsonb;
  new_projects jsonb;
  new_nodes jsonb;
  new_ts timestamptz := clock_timestamp();
  bump_result jsonb;
  v_removed boolean := false;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  if p_project_id is null or length(trim(p_project_id)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_project_id');
  end if;

  select w.projects_json, w.nodes_by_project_json
  into old_projects, old_nodes
  from public.plannode_workspace w
  where w.user_id = uid
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_workspace', 'removed', false);
  end if;

  old_projects := coalesce(old_projects, '[]'::jsonb);
  old_nodes := coalesce(old_nodes, '{}'::jsonb);

  if exists (
    select 1
    from jsonb_array_elements(old_projects) e
    where e->>'id' = p_project_id
  ) then
    v_removed := true;
  elsif old_nodes ? p_project_id then
    v_removed := true;
  end if;

  select coalesce(jsonb_agg(e), '[]'::jsonb)
  into new_projects
  from jsonb_array_elements(old_projects) e
  where coalesce(e->>'id', '') is distinct from p_project_id;

  new_nodes := old_nodes - p_project_id;

  update public.plannode_workspace w
  set
    projects_json = new_projects,
    nodes_by_project_json = new_nodes,
    updated_at = new_ts
  where w.user_id = uid;

  bump_result := public.plannode_bump_owner_collab_revisions_on_bundle_write(
    uid,
    old_nodes,
    new_nodes,
    old_projects,
    new_projects
  );

  if coalesce(p_prune_collab_meta, true) and v_removed then
    delete from public.plannode_project_structure_ops o
    where o.project_id = p_project_id;

    delete from public.plannode_project_collab_meta m
    where m.workspace_user_id = uid
      and m.project_id = p_project_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'removed', v_removed,
    'server_updated_at', new_ts,
    'collab_revision_bumps', coalesce(bump_result -> 'bumped', '[]'::jsonb)
  );
end;
$$;

comment on function public.plannode_workspace_remove_project(text, boolean) is
  'DEL-WS-SYNC — auth.uid() 워크스페이스 JSON에서 project_id·노드 슬라이스 제거 · collab revision bump · (선택) ops/meta prune. ACL purge는 클라이언트.';

grant execute on function public.plannode_workspace_remove_project(text, boolean) to authenticated;

-- ── 공유 멤버: 내 번들에서만 공유 프로젝트 ref 제거 (소유자 DB untouched) ──
create or replace function public.plannode_workspace_remove_shared_project_ref(
  p_project_id text,
  p_owner_workspace_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  old_projects jsonb;
  old_nodes jsonb;
  new_projects jsonb;
  new_nodes jsonb;
  new_ts timestamptz := clock_timestamp();
  v_removed boolean := false;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  if p_project_id is null or length(trim(p_project_id)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_project_id');
  end if;

  select w.projects_json, w.nodes_by_project_json
  into old_projects, old_nodes
  from public.plannode_workspace w
  where w.user_id = uid
  for update;

  if not found then
    return jsonb_build_object('ok', true, 'removed', false, 'server_updated_at', new_ts);
  end if;

  old_projects := coalesce(old_projects, '[]'::jsonb);
  old_nodes := coalesce(old_nodes, '{}'::jsonb);

  select coalesce(jsonb_agg(e), '[]'::jsonb)
  into new_projects
  from jsonb_array_elements(old_projects) e
  where not (
    e->>'id' = p_project_id
    and (
      p_owner_workspace_user_id is null
      or coalesce(e->>'cloud_workspace_source_user_id', '') = p_owner_workspace_user_id::text
    )
  );

  if jsonb_array_length(old_projects) is distinct from jsonb_array_length(new_projects)
     or old_nodes ? p_project_id then
    v_removed := true;
  end if;

  new_nodes := old_nodes - p_project_id;

  update public.plannode_workspace w
  set
    projects_json = new_projects,
    nodes_by_project_json = new_nodes,
    updated_at = new_ts
  where w.user_id = uid;

  return jsonb_build_object(
    'ok', true,
    'removed', v_removed,
    'server_updated_at', new_ts
  );
end;
$$;

comment on function public.plannode_workspace_remove_shared_project_ref(text, uuid) is
  'DEL-WS-SYNC — 멤버 워크스페이스에서 공유 프로젝트 ref만 제거. 소유자 plannode_workspace는 변경하지 않음.';

grant execute on function public.plannode_workspace_remove_shared_project_ref(text, uuid) to authenticated;
