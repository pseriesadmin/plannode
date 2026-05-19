-- Plannode: plannode_project_collab_meta SELECT RLS + Realtime publication (revision 신호)
-- OT/CRDT·문자 단위 실시간 병합 없음. revision 은 merge RPC 성공 시 증가하는 신호이며,
-- 노드 본문 정본은 기존 plannode_workspace_merge_project_slice · fetch_project_slice RPC 경로.
--
-- 선행: plannode_project_collab_revision_lock.sql, plannode_project_acl.sql,
--       20260518_plannode_workspace_merge_project_slice_per_node_lww.sql,
--       20260519_plannode_merge_nodes_lww_prune_on_newer_project.sql
-- Supabase SQL Editor에서 실행 후 NOTIFY. 이미 publication·정책이 있으면 해당 DROP/ADD 오류는 무시 가능.

-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT RLS — merge/get_revision RPC 와 동일 ACL 축 (JWT email + session helper)
-- 소유자: workspace_user_id = auth.uid()
-- 공유 멤버: plannode_project_acl (project_id + workspace_source_user_id 일치)
-- INSERT/UPDATE/DELETE 정책 없음 → authenticated 직접 쓰기 거부, SECURITY DEFINER RPC 유지
-- ═══════════════════════════════════════════════════════════════════════════
drop policy if exists "plannode_collab_meta_select" on public.plannode_project_collab_meta;

create policy "plannode_collab_meta_select"
  on public.plannode_project_collab_meta
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.plannode_platform_master m
      where m.id = 1
        and m.user_id = auth.uid()
    )
    or workspace_user_id = auth.uid()
    or exists (
      select 1
      from public.plannode_project_acl a
      where a.project_id = plannode_project_collab_meta.project_id
        and a.workspace_source_user_id is not distinct from plannode_project_collab_meta.workspace_user_id
        and (
          lower(trim(a.email)) = lower(trim(coalesce(nullif(trim(auth.jwt() ->> 'email'), ''), '')))
          or public.plannode_acl_email_belongs_to_session(a.email)
        )
    )
  );

comment on column public.plannode_project_collab_meta.revision is
  '협업 pull 신호용 카운터(Realtime postgres_changes). 본문은 슬라이스 RPC가 정본. OT/CRDT 아님.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Realtime: revision 변경 시 클라이언트 debounce pull (plannode_workspace 번들 전 구독 아님)
-- ═══════════════════════════════════════════════════════════════════════════
alter publication supabase_realtime add table public.plannode_project_collab_meta;
