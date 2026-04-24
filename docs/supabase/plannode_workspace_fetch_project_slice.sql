-- 초대된 사용자가 소유자 워크스페이스에서 «한 프로젝트»만 안전하게 가져오기 (전체 워크스페이스 노출 방지)
-- 선행: plannode_workspace.sql, plannode_project_acl.sql (workspace_source_user_id 컬럼·백필 포함)

create or replace function public.plannode_workspace_fetch_project_slice(
  p_workspace_user_id uuid,
  p_project_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rec record;
  proj_item jsonb;
begin
  if p_workspace_user_id is null or p_project_id is null or length(trim(p_project_id)) = 0 then
    return null;
  end if;

  if not exists (
    select 1
    from public.plannode_project_acl a
    where a.project_id = p_project_id
      and a.workspace_source_user_id is not distinct from p_workspace_user_id
      and lower(trim(a.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  ) then
    return null;
  end if;

  select w.projects_json, w.nodes_by_project_json
  into rec
  from public.plannode_workspace w
  where w.user_id = p_workspace_user_id;

  if rec.projects_json is null then
    return null;
  end if;

  select j.elem into proj_item
  from lateral jsonb_array_elements(rec.projects_json) as j(elem)
  where j.elem->>'id' = p_project_id
  limit 1;

  if proj_item is null then
    return null;
  end if;

  return jsonb_build_object(
    'project', proj_item,
    'nodes', coalesce(rec.nodes_by_project_json->p_project_id, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.plannode_workspace_fetch_project_slice(uuid, text) from public;
grant execute on function public.plannode_workspace_fetch_project_slice(uuid, text) to authenticated;

notify pgrst, 'reload schema';
