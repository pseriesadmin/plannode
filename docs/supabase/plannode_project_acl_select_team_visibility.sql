-- 멤버가 «같은 project_id»에 본인 ACL 행이 있으면, 그 프로젝트의 **전체** ACL 행을 SELECT 할 수 있게 함.
-- 목적: 공유 프로젝트 편집 시 `fetchProjectAcl`로 소유자·다른 멤버 이메일을 읽어 Presence allowlist에 넣기.
-- 앱 수정 없이 Supabase만 반영해도 동작 개선됨(앱은 `projectPresence`에 alwaysShowUserIds 보조도 적용).
--
-- 보안: 다른 project_id 행은 여전히 RLS로 막힘. EXISTS는 «내 이메일이 속한 project_id»로만 확장.

drop policy if exists "plannode_project_acl_select" on public.plannode_project_acl;

create policy "plannode_project_acl_select"
  on public.plannode_project_acl for select to authenticated
  using (
    lower(trim(email)) = lower(trim(coalesce(nullif(trim(auth.jwt() ->> 'email'), ''), '')))
    or public.plannode_acl_email_belongs_to_session(email)
    or public.plannode_acl_current_user_is_owner(project_id)
    or exists (
      select 1 from public.plannode_platform_master m
      where m.id = 1 and m.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.plannode_project_acl me
      where me.project_id = plannode_project_acl.project_id
        and (
          lower(trim(me.email)) = lower(trim(coalesce(nullif(trim(auth.jwt() ->> 'email'), ''), '')))
          or public.plannode_acl_email_belongs_to_session(me.email)
        )
    )
  );

notify pgrst, 'reload schema';
