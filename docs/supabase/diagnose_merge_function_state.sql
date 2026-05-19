-- 진단: plannode_workspace_merge_project_slice · LWW·prune(20260519) 배포 확인
-- Supabase SQL Editor에서 실행 후 결과를 보고하세요.

-- 1단계: merge_project_slice 오버로드(5인자·p_base_revision)
SELECT
  p.proname AS "함수명",
  pg_get_function_arguments(p.oid) AS "파라미터",
  pg_get_function_result(p.oid) AS "반환타입"
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'plannode_workspace_merge_project_slice'
ORDER BY p.oid;

-- 2단계: plannode_project_collab_meta 테이블 존재
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'plannode_project_collab_meta'
) AS "collab_meta_테이블_존재";

-- 3단계: plannode_project_collab_get_revision 함수 존재
SELECT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'plannode_project_collab_get_revision'
) AS "get_revision_함수_존재";

-- 4단계: plannode_merge_nodes_jsonb_lww — 3인자(p_prune_missing) 단일 오버로드
SELECT
  count(*)::int AS "lww_오버로드_개수",
  bool_or(pg_get_function_arguments(p.oid) LIKE '%p_prune_missing%') AS "prune_인자_있음"
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'plannode_merge_nodes_jsonb_lww';

-- 5단계: merge_project_slice 본문이 per-node LWW + v_prune(20260519) 사용
SELECT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'plannode_workspace_merge_project_slice'
    AND pg_get_functiondef(p.oid) LIKE '%plannode_merge_nodes_jsonb_lww%'
    AND pg_get_functiondef(p.oid) LIKE '%v_prune%'
) AS "merge_slice_LWW+prune";

-- 6단계(참고): 구버전 오판 방지 — 본문에 p_prune_missing 문자열은 LWW 헬퍼에만 있음(슬라이스는 v_prune)
SELECT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'plannode_workspace_merge_project_slice'
    AND pg_get_functiondef(p.oid) LIKE '%p_prune_missing%'
) AS "merge_slice에_p_prune_missing_문자열_있음_기대_false";
