-- Plannode: Realtime `postgres_changes` on `plannode_project_workspace_history` (NOW-HIST-APP-05)
-- 선행: docs/supabase/20260514_plannode_project_workspace_history.sql
-- Supabase SQL Editor에서 실행. 이미 publication에 포함된 경우 오류 → 무시해도 됨.

alter publication supabase_realtime add table public.plannode_project_workspace_history;
