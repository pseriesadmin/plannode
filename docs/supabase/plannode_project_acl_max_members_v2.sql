-- 공유 멤버(is_owner = false) 프로젝트당 최대 4명 제한 (소유자 포함 총 5계정)
-- Supabase SQL Editor에서 plannode_project_acl.sql 적용 후 실행.

create or replace function public.plannode_project_acl_enforce_max_members()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  n int;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;
  if coalesce(new.is_owner, false) = true then
    return new;
  end if;
  select count(*)::int into n
  from public.plannode_project_acl x
  where x.project_id = new.project_id
    and x.is_owner = false;
  if n >= 4 then
    raise exception '공유 멤버는 최대 4명까지 등록할 수 있어. (소유자 포함 총 5계정)'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists plannode_project_acl_max_members_bi on public.plannode_project_acl;

create trigger plannode_project_acl_max_members_bi
  before insert on public.plannode_project_acl
  for each row
  execute function public.plannode_project_acl_enforce_max_members();
