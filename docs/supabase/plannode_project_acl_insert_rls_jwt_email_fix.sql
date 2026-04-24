-- plannode_project_acl INSERT 403 (RLS) 완화 패치
-- 증상: "new row violates row-level security policy" — JWT에 `email` 클레임이 비어 있거나 auth.users와 불일치할 때 첫 소유자 INSERT가 막힘.
-- 적용: Supabase → SQL Editor → 전체 실행 → 앱 새로고침
--
-- 선행: public.plannode_project_acl 테이블·기존 트리거·plannode_acl_project_has_rows 가 이미 있어야 함.

create or replace function public.plannode_acl_email_belongs_to_session(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and coalesce(nullif(trim(u.email::text), ''), null) is not null
      and lower(trim(u.email::text)) = lower(trim(coalesce(p_email, '')))
  );
$$;

create or replace function public.plannode_acl_project_has_owner_row(p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.plannode_project_acl x
    where x.project_id = p_project_id
      and x.is_owner = true
  );
$$;

create or replace function public.plannode_acl_current_user_is_owner(p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.plannode_project_acl o
    where o.project_id = p_project_id
      and o.is_owner = true
      and (
        lower(trim(o.email)) = lower(trim(coalesce(nullif(trim(auth.jwt() ->> 'email'), ''), '')))
        or public.plannode_acl_email_belongs_to_session(o.email)
      )
  );
$$;

revoke all on function public.plannode_acl_email_belongs_to_session(text) from public;
grant execute on function public.plannode_acl_email_belongs_to_session(text) to authenticated;

revoke all on function public.plannode_acl_project_has_owner_row(text) from public;
grant execute on function public.plannode_acl_project_has_owner_row(text) to authenticated;

revoke all on function public.plannode_acl_current_user_is_owner(text) from public;
grant execute on function public.plannode_acl_current_user_is_owner(text) to authenticated;

drop policy if exists "plannode_project_acl_select" on public.plannode_project_acl;
create policy "plannode_project_acl_select"
  on public.plannode_project_acl for select to authenticated
  using (
    lower(trim(email)) = lower(trim(coalesce(nullif(trim(auth.jwt() ->> 'email'), ''), '')))
    or public.plannode_acl_email_belongs_to_session(email)
    or public.plannode_acl_current_user_is_owner(project_id)
    or exists (
      select 1 from public.plannode_platform_master m
      where m.id = 1 and m.user_id = auth.uid()
    )
  );

drop policy if exists "plannode_project_acl_insert" on public.plannode_project_acl;
create policy "plannode_project_acl_insert"
  on public.plannode_project_acl for insert to authenticated
  with check (
    (
      not public.plannode_acl_project_has_owner_row(project_id)
      and is_owner = true
      and (
        lower(trim(email)) = lower(trim(coalesce(nullif(trim(auth.jwt() ->> 'email'), ''), '')))
        or public.plannode_acl_email_belongs_to_session(email)
      )
    )
    or (
      public.plannode_acl_current_user_is_owner(project_id)
      and is_owner = false
    )
    or (
      exists (
        select 1 from public.plannode_platform_master m
        where m.id = 1 and m.user_id = auth.uid()
      )
      and is_owner = false
    )
  );

notify pgrst, 'reload schema';
