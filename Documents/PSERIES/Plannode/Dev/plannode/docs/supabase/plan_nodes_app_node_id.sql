-- NEXT-7: 로컬 Plannode 노드 id(비-UUID 문자열)를 plan_nodes와 맞추기 위한 열
-- 선행: PLANNODE_INTEGRATED_GUIDE.md §4.1 (plan_nodes 테이블·RLS) 적용됨
-- Supabase → SQL Editor에서 한 번만 실행(이미 있으면 스킵)

alter table if exists public.plan_nodes
  add column if not exists app_node_id text;

comment on column public.plan_nodes.app_node_id is
  'Plannode 앱의 노드 id (예: n12, proj_abc-r) — project_id + app_node_id 로 upsert';

-- PostgreSQL: NULL app_node_id 는 서로 다르게 취급(여행 NULL 로우 허용)
create unique index if not exists plan_nodes_project_app_node_unique
  on public.plan_nodes (project_id, app_node_id);

notify pgrst, 'reload schema';
