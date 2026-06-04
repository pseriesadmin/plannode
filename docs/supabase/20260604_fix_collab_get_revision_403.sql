-- plannode_project_collab_get_revision 403 수정 (v2)
-- 원인: plannode_acl_workspace_is_project_owner 의 모든 fallback이 일부 환경에서 실패.
-- 수정: revision(bigint 1개)은 ACL 접근 확인만으로 충분 — workspace_owner 체크 제거.
-- 보안: plannode_acl_caller_has_project_access 가 email 기반 ACL 검증을 수행.
--
-- 선행: 20260603_fix_structure_ops_acl_forbidden.sql

create or replace function public.plannode_project_collab_get_revision(
  p_workspace_user_id uuid,
  p_project_id text
)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rev bigint;
begin
  if p_workspace_user_id is null or p_project_id is null or length(trim(p_project_id)) = 0 then
    raise exception 'invalid arguments';
  end if;

  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  -- email 기반 ACL 확인 (security definer 내부 호출)
  if not public.plannode_acl_caller_has_project_access(p_project_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select m.revision into v_rev
  from public.plannode_project_collab_meta m
  where m.workspace_user_id = p_workspace_user_id
    and m.project_id = p_project_id;

  return coalesce(v_rev, 0::bigint);
end;
$$;

revoke all on function public.plannode_project_collab_get_revision(uuid, text) from public;
grant execute on function public.plannode_project_collab_get_revision(uuid, text) to authenticated;

notify pgrst, 'reload schema';
