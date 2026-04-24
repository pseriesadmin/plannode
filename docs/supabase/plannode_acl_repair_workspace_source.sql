-- plannode_project_acl.workspace_source_user_id 가 비어 있으면
-- 초대 계정에서「클라우드에서 불러오기」가 비활성되거나 RPC가 빈 결과를 돌려줌.
-- 선행: plannode_project_acl.sql 이 한 번은 실행된 상태여야 함.
-- Supabase → SQL Editor → 한 번 실행 후 앱 새로고침.

update public.plannode_project_acl a
set workspace_source_user_id = u.id
from auth.users u
where a.is_owner = true
  and a.workspace_source_user_id is null
  and lower(trim(a.email)) = lower(trim(u.email::text));

update public.plannode_project_acl m
set workspace_source_user_id = o.workspace_source_user_id
from public.plannode_project_acl o
where m.project_id = o.project_id
  and o.is_owner = true
  and o.workspace_source_user_id is not null
  and m.workspace_source_user_id is null;

notify pgrst, 'reload schema';
