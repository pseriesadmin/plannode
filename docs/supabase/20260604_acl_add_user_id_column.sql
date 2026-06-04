-- plannode_project_acl 에 user_id 컬럼 추가 + 기존 데이터 backfill + INSERT 트리거
-- 목적: ACL 행에 auth.users.id를 저장해 UI·향후 RLS/조회에서 email 의존 완화
--
-- 적용 순서 (이 파일만 §1~3):
--   1) 이 파일 실행
--   2) docs/supabase/20260604_final_collab_functions_fix.sql (협업 RPC — 별도 정본)
--   3) 브라우저 하드 리프레시
--
-- 주의: 이 파일에 collab RPC(plannode_project_collab_get_revision 등)를 넣지 말 것.
--   구버전(stable + ACL EXISTS) 재정의 시 403·400 회귀. RPC는 final_collab_functions_fix만.

-- ── 1) user_id 컬럼 추가 ──
alter table public.plannode_project_acl
  add column if not exists user_id uuid references auth.users(id) on delete set null;

comment on column public.plannode_project_acl.user_id is
  '이 ACL 행의 실제 사용자 auth.uid() — email 매칭 없이 uid로 ACL 확인용.';

-- ── 2) 기존 행 backfill: auth.users.email → user_id ──
update public.plannode_project_acl a
set user_id = u.id
from auth.users u
where lower(trim(u.email)) = lower(trim(a.email))
  and a.user_id is null;

-- ── 3) INSERT 시 user_id 자동 설정 트리거 ──
create or replace function public.plannode_acl_set_user_id()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.user_id is null and new.email is not null then
    select u.id into new.user_id
    from auth.users u
    where lower(trim(u.email)) = lower(trim(new.email))
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists plannode_acl_set_user_id_trigger on public.plannode_project_acl;
create trigger plannode_acl_set_user_id_trigger
  before insert or update of email
  on public.plannode_project_acl
  for each row execute function public.plannode_acl_set_user_id();

notify pgrst, 'reload schema';
