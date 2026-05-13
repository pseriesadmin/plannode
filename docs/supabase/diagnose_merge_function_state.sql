-- 진단: plannode_workspace_merge_project_slice 함수 버전 확인
-- Supabase SQL Editor에서 실행 후 결과를 보고하세요.

-- 1단계: 현재 존재하는 모든 plannode_workspace_merge_project_slice 오버로드 확인
SELECT
  p.proname AS "함수명",
  pg_get_function_arguments(p.oid) AS "파라미터",
  pg_get_function_result(p.oid) AS "반환타입"
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'plannode_workspace_merge_project_slice'
ORDER BY p.oid;

-- 2단계: plannode_project_collab_meta 테이블 존재 여부 (revision/lock 기능이 배포됐는지 확인)
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_schema = 'public' 
    AND table_name = 'plannode_project_collab_meta'
) AS "collab_meta_테이블_존재";

-- 3단계: plannode_project_collab_get_revision 함수 존재 여부
SELECT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'plannode_project_collab_get_revision'
) AS "get_revision_함수_존재";
