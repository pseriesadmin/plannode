-- M1-1: ai_generations — L5 전체 트리 IA( node_id NULL, pipeline 1-stage ) + 노드 단위 생성 결과
-- 선행: PLANNODE_INTEGRATED_GUIDE.md §4.1 — plan_projects, plan_nodes, RLS 배포됨
-- PRD: M3 F3-2, §11 | v4: align-db-l5
-- 적용: Supabase SQL Editor에서 한 번 실행(이미 테이블 있으면 오류 방지용 IF NOT EXISTS 사용)
-- 삭제/ALTER는 기존 파일 수정 대신 신규 마이그레이션으로만.

-- ════════════════════════════════════════
-- public.ai_generations
-- ════════════════════════════════════════
create table if not exists public.ai_generations (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.plan_projects (id) on delete cascade,
  node_id           uuid references public.plan_nodes (id) on delete set null,
  output_intent     text not null,
  pipeline_stage    text not null,
  model_used        text not null default '',

  skeleton_output   text,
  deepened_output   text,
  validated_output  text,
  final_output      text not null,

  context_snapshot  jsonb not null default '{}',
  token_usage       jsonb not null default '{}',
  created_at        timestamptz not null default now()
);

comment on table public.ai_generations is
  'LLM/IA 생성 기록. L5 전체 트리: node_id NULL, pipeline_stage 1-stage, context_snapshot(예: tree)';

comment on column public.ai_generations.node_id is
  'NULL = 프로젝트 전체(트리) 기반 1-stage IA 등; NOT NULL = 노드 scoped 생성';

comment on column public.ai_generations.pipeline_stage is
  '1-stage | 2-stage | 3-stage (v3 GenerationResult / PRD §11)';

-- pipeline_stage 값 제한(확장 시 CHECK 수정은 신규 SQL 파일로)
alter table public.ai_generations
  drop constraint if exists ai_generations_pipeline_stage_check;

alter table public.ai_generations
  add constraint ai_generations_pipeline_stage_check
  check (pipeline_stage in ('1-stage', '2-stage', '3-stage'));

create index if not exists idx_ai_generations_project
  on public.ai_generations (project_id);

create index if not exists idx_ai_generations_project_created
  on public.ai_generations (project_id, created_at desc);

create index if not exists idx_ai_generations_node
  on public.ai_generations (node_id)
  where node_id is not null;

-- ════════════════════════════════════════
-- RLS (plan_nodes 와 동일 권한 모델)
-- ════════════════════════════════════════
alter table public.ai_generations enable row level security;

-- 중복 정책 방지(재실행 시)
drop policy if exists "ai_generations_owner_full" on public.ai_generations;
drop policy if exists "ai_generations_editor_write" on public.ai_generations;
drop policy if exists "ai_generations_viewer_read" on public.ai_generations;
drop policy if exists "ai_generations_public_read" on public.ai_generations;

create policy "ai_generations_owner_full" on public.ai_generations
  for all
  using (
    exists (
      select 1
      from public.plan_projects p
      where p.id = ai_generations.project_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.plan_projects p
      where p.id = ai_generations.project_id
        and p.owner_id = auth.uid()
    )
  );

create policy "ai_generations_editor_write" on public.ai_generations
  for all
  using (
    exists (
      select 1
      from public.plan_collaborators c
      where c.project_id = ai_generations.project_id
        and c.user_id = auth.uid()
        and c.role in ('owner', 'editor')
    )
  )
  with check (
    exists (
      select 1
      from public.plan_collaborators c
      where c.project_id = ai_generations.project_id
        and c.user_id = auth.uid()
        and c.role in ('owner', 'editor')
    )
  );

create policy "ai_generations_viewer_read" on public.ai_generations
  for select
  using (
    exists (
      select 1
      from public.plan_collaborators c
      where c.project_id = ai_generations.project_id
        and c.user_id = auth.uid()
        and c.role = 'viewer'
    )
  );

create policy "ai_generations_public_read" on public.ai_generations
  for select
  using (
    exists (
      select 1
      from public.plan_projects p
      where p.id = ai_generations.project_id
        and p.is_public = true
    )
  );

notify pgrst, 'reload schema';
