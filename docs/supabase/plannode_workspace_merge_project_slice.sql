-- 멤버가 편집한 «한 프로젝트»를 소유자 plannode_workspace JSON에 반영 (양방향 동기화)
-- 선행: plannode_workspace.sql, plannode_workspace_fetch_project_slice.sql, plannode_project_acl.sql
-- ACL: fetch 슬라이스와 동일 — JWT 이메일이 해당 project_id·workspace_source 와 매칭되는 행만 허용

create or replace function public.plannode_workspace_merge_project_slice(
  p_workspace_user_id uuid,
  p_project_id text,
  p_project jsonb,
  p_nodes jsonb
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
begin
  if p_workspace_user_id is null or p_project_id is null or length(trim(p_project_id)) = 0 then
    raise exception 'invalid arguments';
  end if;

  if not exists (
    select 1
    from public.plannode_project_acl a
    where a.project_id = p_project_id
      and a.workspace_source_user_id is not distinct from p_workspace_user_id
      and lower(trim(a.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  ) then
    raise exception 'forbidden' using errcode = '42501';
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

  select coalesce(jsonb_agg(e), '[]'::jsonb)
  into v_filtered
  from jsonb_array_elements(v_projects) as e
  where e->>'id' is distinct from p_project_id;

  v_new_projects := coalesce(v_filtered, '[]'::jsonb) || jsonb_build_array(p_project);
  v_nodes := jsonb_set(v_nodes, array[p_project_id], coalesce(p_nodes, '[]'::jsonb), true);

  update public.plannode_workspace w
  set
    projects_json = v_new_projects,
    nodes_by_project_json = v_nodes,
    updated_at = now()
  where w.user_id = p_workspace_user_id
  returning w.updated_at into v_ts;

  return v_ts;
end;
$$;

revoke all on function public.plannode_workspace_merge_project_slice(uuid, text, jsonb, jsonb) from public;
grant execute on function public.plannode_workspace_merge_project_slice(uuid, text, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
