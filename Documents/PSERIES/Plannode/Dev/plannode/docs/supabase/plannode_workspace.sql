-- Plannode 클라우드 동기용 테이블 (NEXT-3)
-- Supabase 대시보드 → SQL Editor에서 한 번 실행.
-- 선행: Authentication → Email provider 활성화(앱은 이메일 로그인만 사용).

create table if not exists public.plannode_workspace (
  user_id uuid primary key references auth.users (id) on delete cascade,
  projects_json jsonb not null default '[]'::jsonb,
  nodes_by_project_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.plannode_workspace is 'Plannode 로컬 워크스페이스(프로젝트 목록 + 프로젝트별 노드) 클라우드 백업';

alter table public.plannode_workspace enable row level security;

create policy "plannode_workspace_select_own"
  on public.plannode_workspace for select
  using (auth.uid() = user_id);

create policy "plannode_workspace_insert_own"
  on public.plannode_workspace for insert
  with check (auth.uid() = user_id);

create policy "plannode_workspace_update_own"
  on public.plannode_workspace for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "plannode_workspace_delete_own"
  on public.plannode_workspace for delete
  using (auth.uid() = user_id);

-- PostgREST 스키마 캐시 갱신(생성 직후 "Could not find the table ... plannode_workspace" 방지)
notify pgrst, 'reload schema';
