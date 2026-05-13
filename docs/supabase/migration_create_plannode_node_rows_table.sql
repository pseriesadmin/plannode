-- Migration: 실시간 동기화용 노드 행 테이블 생성
-- 목적: Layer 2 Realtime postgres_changes 이벤트 기반 노드 단위 동기화
-- 플랜 참조: plannode_realtime_sync_redesign_v1.md §2.3
-- 실행 순서: Supabase SQL Editor에서 한 번 실행 → Dashboard에서 Publication 활성화 필수
-- PRD 참조: M5 F5-2 (실시간 동기), F3-2 (Supabase), §11 DB 스키마

-- ============================================================================
-- Table: plannode_node_rows
-- 목적: 노드 단위 저장소 (현행 bundle JSON 보완)
-- 단계: 초기(Step 2)는 plannode_workspace 번들과 이중 쓰기 허용
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.plannode_node_rows (
  -- 기본 식별
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 연결 정보
  project_id text NOT NULL,           -- 프로젝트 ID (Project.id와 동일 타입)
  owner_user_id uuid NOT NULL,        -- 프로젝트 소유자 (auth.users.id 또는 plannode_workspace.user_id)
  node_id text NOT NULL,              -- 파일럿 노드 ID (예: "n507", "p123")
  
  -- 데이터
  data jsonb NOT NULL,                -- Node 객체 직렬화 스냅샷 (배지·메타 포함)
  
  -- 버전 제어 (선택·향후 revision RPC와 병합 가능)
  revision bigint DEFAULT 1,
  
  -- 타임스탐프
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,             -- soft delete 표시 (논리 삭제, Realtime 이벤트 감지용)
  
  -- 제약
  UNIQUE (project_id, node_id),       -- 프로젝트당 노드 ID 단일성
  CONSTRAINT fk_owner CHECK (owner_user_id IS NOT NULL),
  CONSTRAINT fk_project_id CHECK (project_id != '')
);

-- 인덱스 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_plannode_node_rows_project_id 
  ON public.plannode_node_rows (project_id);
CREATE INDEX IF NOT EXISTS idx_plannode_node_rows_owner_user_id 
  ON public.plannode_node_rows (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_plannode_node_rows_updated_at 
  ON public.plannode_node_rows (updated_at DESC);

-- ============================================================================
-- Row Level Security (RLS)
-- 정책: 노드는 프로젝트 소유자 및 ACL 허용자만 접근
-- ============================================================================

ALTER TABLE public.plannode_node_rows ENABLE ROW LEVEL SECURITY;

-- Policy 1: 소유자 (FULL ACCESS)
CREATE POLICY nodes_owner_full
  ON public.plannode_node_rows
  FOR ALL
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

-- Policy 2: 공유 참여자 (SELECT + UPDATE, 소유자 공유 프로젝트)
-- 전제: plannode_project_acl.workspace_source_user_id = owner_user_id와 정합
-- 참고: plannode_project_acl은 email 기반 식별 (user_id 직접 매핑 불가, 추후 user_id 칼럼 추가 시 개선)
CREATE POLICY nodes_shared_write
  ON public.plannode_node_rows
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.plannode_project_acl acl
      JOIN auth.users au ON au.email = acl.email
      WHERE acl.project_id = plannode_node_rows.project_id
        AND acl.workspace_source_user_id = plannode_node_rows.owner_user_id
        AND au.id = auth.uid()
        AND acl.is_owner = false
    )
  );

CREATE POLICY nodes_shared_select
  ON public.plannode_node_rows
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.plannode_project_acl acl
      JOIN auth.users au ON au.email = acl.email
      WHERE acl.project_id = plannode_node_rows.project_id
        AND acl.workspace_source_user_id = plannode_node_rows.owner_user_id
        AND au.id = auth.uid()
    )
  );

-- Policy 3: 공개 프로젝트 (미래 확장, 현재는 불활성화)
-- CREATE POLICY nodes_public_read
--   ON public.plannode_node_rows
--   FOR SELECT
--   USING (is_public = true);

-- ============================================================================
-- Triggers (자동 updated_at 갱신)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_plannode_node_rows_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_plannode_node_rows_updated_at ON public.plannode_node_rows;
CREATE TRIGGER trigger_plannode_node_rows_updated_at
  BEFORE UPDATE ON public.plannode_node_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.update_plannode_node_rows_updated_at();

-- ============================================================================
-- Realtime Publication 설정 (Supabase Dashboard에서 필수 활성화)
-- ============================================================================

-- 이 마이그레이션 후, Supabase Dashboard → Realtime → Publications 에서 
-- "plannode_node_rows" 테이블을 선택해 활성화하면 
-- postgres_changes 이벤트 구독 가능 (클라이언트 측 supabase.channel(...).on('postgres_changes', ...))

-- ALERT: Publication을 수동으로 활성화하지 않으면 
-- postgres_changes 구독이 이벤트를 받지 않습니다!

-- ============================================================================
-- 단계적 마이그레이션 참고
-- ============================================================================

-- Step 2a (초기): plannode_workspace 번들과 병행
--   - 클라이언트: sync.ts uploadWorkspaceToCloud는 기존 경로 유지
--   - 신규: Layer 1 Broadcast 송수신 (plannode_node_rows 미사용)
--   - 신규: postgres_changes 구독 준비 (받기만, 클라이언트 직접 쓰기 미구현)
--
-- Step 2b (안정화): 클라이언트 merge 로직 추가
--   - Broadcast 수신 + postgres_changes 수신 + 기존 bundle pull을 조합
--   - 안전성: persist/hydrate 계열 경로만 사용 (직접 DOM 패치 금지)
--
-- Step 3 (선택·향후): Edge API 추가
--   - POST /api/sync/node-upsert → Layer 3 revision/lock 집중
--
-- Step 4 (장기·제품 결정): bundle 역할 축소
--   - plannode_workspace는 메타·목록만 유지
--   - 노드는 전부 plannode_node_rows로 이전

-- ============================================================================
-- 검증 쿼리 (마이그레이션 후 수동 확인용)
-- ============================================================================

-- 테이블 확인
-- SELECT * FROM information_schema.tables WHERE table_name = 'plannode_node_rows';
--
-- RLS 정책 확인
-- SELECT * FROM pg_policies WHERE tablename = 'plannode_node_rows';
--
-- 인덱스 확인
-- SELECT * FROM pg_indexes WHERE tablename = 'plannode_node_rows';
