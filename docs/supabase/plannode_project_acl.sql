-- 프로젝트별 이메일 접근 제어
-- ★ 선행: docs/supabase/plannode_platform_master.sql 을 먼저 실행한 뒤 이 파일을 실행할 것.
-- 초대 동료가 «클라우드에서 프로젝트 한 개»만 불러오려면 이어서 docs/supabase/plannode_workspace_fetch_project_slice.sql 실행.
-- Authentication → Email provider 활성화.

create table if not exists public.plannode_project_acl (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  email text not null,
  is_owner boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists plannode_project_acl_project_email_uid
  on public.plannode_project_acl (project_id, lower(trim(email)));

-- 클라우드에서 «이 user_id의 plannode_workspace» 에서 프로젝트 슬라이스를 가져올 수 있게 연결(초대 동료용)
alter table public.plannode_project_acl
  add column if not exists workspace_source_user_id uuid references auth.users (id) on delete set null;

comment on column public.plannode_project_acl.workspace_source_user_id is '이 프로젝트 데이터가 담긴 plannode_workspace.user_id (보통 소유자).';

comment on table public.plannode_project_acl is 'Plannode 프로젝트별 허용 이메일(소유자·멤버). JWT email 과 매칭.';

alter table public.plannode_project_acl enable row level security;

-- RLS 정책 안에서 같은 테이블을 SELECT 하면 무한 재귀 → PostgREST 500.
-- SECURITY DEFINER + 테이블 소유자 컨텍스트로 ACL 테이블만 안전하게 읽는다.
create or replace function public.plannode_acl_project_has_rows(p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.plannode_project_acl x
    where x.project_id = p_project_id
  );
$$;

-- 삽입된 이메일이 현재 세션(auth.uid())의 auth.users 이메일과 같으면 true (JWT에 email 클레임이 없을 때 대비)
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

-- 소유자 행 존재 여부(멤버만 있는 비정상 상태에서도 첫 소유자 INSERT 허용)
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

revoke all on function public.plannode_acl_project_has_rows(text) from public;
grant execute on function public.plannode_acl_project_has_rows(text) to authenticated;

revoke all on function public.plannode_acl_email_belongs_to_session(text) from public;
grant execute on function public.plannode_acl_email_belongs_to_session(text) to authenticated;

revoke all on function public.plannode_acl_project_has_owner_row(text) from public;
grant execute on function public.plannode_acl_project_has_owner_row(text) to authenticated;

revoke all on function public.plannode_acl_current_user_is_owner(text) from public;
grant execute on function public.plannode_acl_current_user_is_owner(text) to authenticated;

-- INSERT 시 workspace_source_user_id 자동 설정(소유자=auth.uid(), 멤버=같은 프로젝트 소유자 행에서 복사)
create or replace function public.plannode_project_acl_set_workspace_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  src uuid;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;
  if new.workspace_source_user_id is not null then
    return new;
  end if;
  if new.is_owner = true then
    new.workspace_source_user_id := auth.uid();
    return new;
  end if;
  select o.workspace_source_user_id into src
  from public.plannode_project_acl o
  where o.project_id = new.project_id
    and o.is_owner = true
  limit 1;
  new.workspace_source_user_id := src;
  return new;
end;
$$;

drop trigger if exists plannode_project_acl_workspace_source_bi on public.plannode_project_acl;
create trigger plannode_project_acl_workspace_source_bi
  before insert on public.plannode_project_acl
  for each row
  execute function public.plannode_project_acl_set_workspace_source();

revoke all on function public.plannode_project_acl_set_workspace_source() from public;

-- 기존 행 백필(한 번 실행되면 무방): 소유자 이메일 → auth.users.id, 멤버 → 동일 project 소유자 소스
update public.plannode_project_acl a
set workspace_source_user_id = u.id
from auth.users u
where a.is_owner = true
  and a.workspace_source_user_id is null
  and lower(trim(a.email)) = lower(trim(u.email::text));

update public.plannode_project_acl m
set workspace_source_user_id = o.workspace_source_user_id
from public.plannode_project_acl o
where m.project_id = o.project_id
  and o.is_owner = true
  and o.workspace_source_user_id is not null
  and m.workspace_source_user_id is null;

-- 기존 정책 재실행 시
drop policy if exists "plannode_project_acl_select" on public.plannode_project_acl;
drop policy if exists "plannode_project_acl_insert" on public.plannode_project_acl;
drop policy if exists "plannode_project_acl_delete" on public.plannode_project_acl;

-- 본인 행 | 프로젝트 소유자로 등록된 이메일의 전체 행 | 플랫폼 마스터는 전부 조회
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

-- (1) 이 프로젝트에 소유자 행 없음 + 본인 소유자 등록(JWT 또는 auth.users 이메일 일치)
-- (2) 프로젝트 소유자가 멤버 추가
-- (3) 플랫폼 마스터가 임의 프로젝트에 멤버 추가(is_owner = false)
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

-- 프로젝트 소유자 또는 플랫폼 마스터만 삭제
create policy "plannode_project_acl_delete"
  on public.plannode_project_acl for delete to authenticated
  using (
    public.plannode_acl_current_user_is_owner(project_id)
    or exists (
      select 1 from public.plannode_platform_master m
      where m.id = 1 and m.user_id = auth.uid()
    )
  );

-- 소유자(또는 플랫폼 마스터): 멤버·소유자 행의 workspace_source_user_id 등 메타 수정(RPC 없이 앱 폴백)
drop policy if exists "plannode_project_acl_update" on public.plannode_project_acl;
create policy "plannode_project_acl_update"
  on public.plannode_project_acl for update to authenticated
  using (
    public.plannode_acl_current_user_is_owner(project_id)
    or exists (
      select 1 from public.plannode_platform_master m
      where m.id = 1 and m.user_id = auth.uid()
    )
  )
  with check (
    public.plannode_acl_current_user_is_owner(project_id)
    or exists (
      select 1 from public.plannode_platform_master m
      where m.id = 1 and m.user_id = auth.uid()
    )
  );

-- PostgREST 스키마 캐시 갱신(마이그레이션 직후 "schema cache" 오류 방지). 한 번 실행 후 앱 새로고침.
NOTIFY pgrst, 'reload schema';
