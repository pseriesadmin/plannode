-- 시스템 최초 가입자(플랫폼 마스터) — 한 명만 저장
-- plannode_project_acl.sql 보다 먼저 실행할 것.

create table if not exists public.plannode_platform_master (
  id smallint primary key default 1 check (id = 1),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.plannode_platform_master is 'Plannode 최초 가입 계정(단일). 모든 프로젝트 ACL·접근 관리에 사용.';

alter table public.plannode_platform_master enable row level security;

drop policy if exists "plannode_platform_master_select" on public.plannode_platform_master;
create policy "plannode_platform_master_select"
  on public.plannode_platform_master for select to authenticated
  using (true);

drop policy if exists "plannode_platform_master_insert_first" on public.plannode_platform_master;
create policy "plannode_platform_master_insert_first"
  on public.plannode_platform_master for insert to authenticated
  with check (
    id = 1
    and user_id = auth.uid()
    and not exists (select 1 from public.plannode_platform_master)
  );

-- PostgREST 스키마 캐시 갱신(위 마이그레이션 직후 권장)
NOTIFY pgrst, 'reload schema';
