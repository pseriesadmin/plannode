-- v1: 멤버 본인이 자신의 비소유 ACL 행만 삭제 가능 (죽은 초대·소유자가 워크스페이스에서 삭제한 뒤 남은 행 정리)
-- 선행: docs/supabase/plannode_project_acl.sql (기존 테이블·함수)
-- 적용: Supabase SQL Editor에서 본 파일 전체 실행 후 NOTIFY 포함. 앱은 자동 prune 시 DELETE 호출.
-- GP-4: 기존 plannode_project_acl.sql 본문 수정 금지 — 정책 교체는 본 신규 파일로만 수행.

DROP POLICY IF EXISTS "plannode_project_acl_delete" ON public.plannode_project_acl;

CREATE POLICY "plannode_project_acl_delete"
  ON public.plannode_project_acl FOR DELETE TO authenticated
  USING (
    public.plannode_acl_current_user_is_owner(project_id)
    OR EXISTS (
      SELECT 1 FROM public.plannode_platform_master m
      WHERE m.id = 1 AND m.user_id = auth.uid()
    )
    OR (
      is_owner = false
      AND (
        lower(trim(email)) = lower(trim(coalesce(nullif(trim(auth.jwt() ->> 'email'), ''), '')))
        OR public.plannode_acl_email_belongs_to_session(email)
      )
    )
  );

NOTIFY pgrst, 'reload schema';
