-- RPC 없이 앱이 멤버 workspace_source_user_id 를 고칠 수 있게 하는 UPDATE RLS (소유자·플랫폼 마스터)
-- 404 RPC 오류 시 이 파일만 실행해도 클라이언트 폴백 복구가 동작함.
-- Supabase → SQL Editor → 실행

drop policy if exists "plannode_project_acl_update" on public.plannode_project_acl;

create policy "plannode_project_acl_update"
  on public.plannode_project_acl for update to authenticated
  using (
    public.plannode_acl_current_user_is_owner(project_id)
    or exists (
      select 1 from public.plannode_platform_master m
      where m.id = 1 and m.user_id = auth.uid()
    )
  )
  with check (
    public.plannode_acl_current_user_is_owner(project_id)
    or exists (
      select 1 from public.plannode_platform_master m
      where m.id = 1 and m.user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
