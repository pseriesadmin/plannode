-- 멤버 행의 workspace_source_user_id 가 NULL인 경우(초대 계정이 프로젝트를 못 불러옴) 소유자가 한 번에 복구.
-- 선행: plannode_project_acl.sql
-- Supabase → SQL Editor → 실행 후 NOTIFY (또는 파일 끝 NOTIFY)

create or replace function public.plannode_project_acl_repair_project_sources(p_project_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_ws uuid;
  n int := 0;
begin
  if p_project_id is null or length(trim(p_project_id)) = 0 then
    return 0;
  end if;

  if not exists (
    select 1
    from public.plannode_project_acl o
    where o.project_id = p_project_id
      and o.is_owner = true
      and lower(trim(o.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  ) then
    raise exception 'not project owner' using errcode = '42501';
  end if;

  select workspace_source_user_id into v_owner_ws
  from public.plannode_project_acl
  where project_id = p_project_id
    and is_owner = true
  limit 1;

  if v_owner_ws is null then
    v_owner_ws := auth.uid();
    update public.plannode_project_acl
    set workspace_source_user_id = v_owner_ws
    where project_id = p_project_id
      and is_owner = true
      and workspace_source_user_id is null;
  end if;

  update public.plannode_project_acl
  set workspace_source_user_id = v_owner_ws
  where project_id = p_project_id
    and is_owner = false
    and (
      workspace_source_user_id is null
      or workspace_source_user_id is distinct from v_owner_ws
    );

  get diagnostics n = row_count;
  return coalesce(n, 0);
end;
$$;

revoke all on function public.plannode_project_acl_repair_project_sources(text) from public;
grant execute on function public.plannode_project_acl_repair_project_sources(text) to authenticated;

notify pgrst, 'reload schema';
