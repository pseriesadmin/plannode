-- Migration: projects_json의 각 project 객체에 owner_user_id, cloud_workspace_source_user_id 추가
-- 목적: sync.ts의 RPC 호출 시 p_workspace_user_id를 올바르게 결정하기 위한 필드 보충
-- 실행 순서: Supabase SQL Editor에서 한 번 실행

-- Step 1: owner_user_id 필드 추가 (각 project 객체에)
-- ACL 테이블에서 owner 찾기 → projects_json의 각 프로젝트에 owner_user_id 설정
UPDATE public.plannode_workspace w
SET projects_json = (
  SELECT jsonb_agg(
    CASE 
      WHEN p->>'owner_user_id' IS NOT NULL THEN p
      ELSE p || jsonb_build_object(
        'owner_user_id',
        (
          SELECT a.workspace_source_user_id
          FROM public.plannode_project_acl a
          WHERE a.project_id::text = p->>'id'
            AND a.is_owner = true
          LIMIT 1
        )
      )
    END
  )
  FROM jsonb_array_elements(w.projects_json) p
)
WHERE projects_json IS NOT NULL
  AND projects_json != '[]'::jsonb;

-- Step 2: cloud_workspace_source_user_id 필드 추가 (owner_user_id 또는 null로 초기화)
-- 공유자가 처음 sync할 때 채워짐 (sync.ts에서 처리)
UPDATE public.plannode_workspace w
SET projects_json = (
  SELECT jsonb_agg(
    CASE 
      WHEN p->>'cloud_workspace_source_user_id' IS NOT NULL THEN p
      ELSE p || jsonb_build_object(
        'cloud_workspace_source_user_id',
        p->>'owner_user_id'
      )
    END
  )
  FROM jsonb_array_elements(w.projects_json) p
)
WHERE projects_json IS NOT NULL
  AND projects_json != '[]'::jsonb;

-- 검증: 마이그레이션 후 owner_user_id, cloud_workspace_source_user_id 확인
SELECT 
  w.user_id,
  COUNT(*) as total_projects,
  SUM(CASE WHEN (p->>'owner_user_id')::text != '' THEN 1 ELSE 0 END) as with_owner_id,
  SUM(CASE WHEN (p->>'cloud_workspace_source_user_id')::text != '' THEN 1 ELSE 0 END) as with_source_id
FROM public.plannode_workspace w,
  jsonb_array_elements(w.projects_json) p
GROUP BY w.user_id
ORDER BY w.user_id;
