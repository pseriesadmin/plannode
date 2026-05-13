-- 안전한 4인자 오버로드 제거 (DROP은 IF EXISTS로 보호)
-- 단계별 실행: 먼저 위 diagnose_merge_function_state.sql 결과를 확인한 후 이 스크립트를 실행하세요.

-- 스텝 1: 4인자 버전이 존재하면 명시적으로 DROP
DO $$
BEGIN
  DROP FUNCTION IF EXISTS public.plannode_workspace_merge_project_slice(uuid, text, jsonb, jsonb);
  RAISE NOTICE 'Successfully dropped 4-argument function';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Function drop failed: %', SQLERRM;
END;
$$;

-- 스텝 2: 5인자 버전이 존재하는지 확인 (revision 기능)
DO $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' 
      AND p.proname = 'plannode_workspace_merge_project_slice'
      AND (pg_get_function_arguments(p.oid) LIKE '%p_base_revision%' 
           OR pg_get_function_arguments(p.oid) LIKE '%bigint%')
  ) INTO v_exists;
  
  IF v_exists THEN
    RAISE NOTICE '✓ 5-argument (with p_base_revision) function is deployed correctly';
  ELSE
    RAISE WARNING '⚠️  5-argument function NOT found - you must run plannode_project_collab_revision_lock.sql first!';
  END IF;
END;
$$;

-- 스텝 3: 스키마 캐시 리로드
NOTIFY pgrst, 'reload schema';

-- 확인 메시지
SELECT 'Merge function state has been corrected. Check PostgREST logs if needed.' AS "status";
