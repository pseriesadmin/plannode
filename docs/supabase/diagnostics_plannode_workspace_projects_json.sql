-- plannode_workspace.projects_json 진단 — 소유·공유 슬라이스 merge 경로
-- plan_projects 테이블이 비어 있어도 워크스페이스 JSON에 프로젝트가 있음(현행 Plannode).
-- Supabase SQL Editor에서 실행. postgres 역할.

-- ── 1) 워크스페이스 행 수·최근 갱신
select user_id, updated_at, jsonb_array_length(projects_json) as project_count
from public.plannode_workspace
order by updated_at desc;

-- ── 2) 각 사용자 번들 내 프로젝트별 소유·클라우드 소스 필드 (상위 200개 프로젝트 엔트리)
--    cloud_workspace_source_user_id / owner_user_id 가 비면 공유자 merge RPC가 스킵·실패할 수 있음.
with expanded as (
  select
    w.user_id as workspace_user_id,
    w.updated_at as workspace_updated_at,
    e.elem
  from public.plannode_workspace w,
       jsonb_array_elements(w.projects_json) as e(elem)
)
select
  workspace_user_id,
  workspace_updated_at,
  elem->>'id' as project_id,
  elem->>'name' as project_name,
  elem->>'owner_user_id' as owner_user_id,
  elem->>'cloud_workspace_source_user_id' as cloud_workspace_source_user_id,
  case
    when elem->>'cloud_workspace_source_user_id' is null
         or btrim(elem->>'cloud_workspace_source_user_id') = '' then '⚠ cw_src 비어있음'
    else 'ok'
  end as cw_src_status
from expanded
order by workspace_updated_at desc, project_name
limit 200;

-- ── 3) ACL과 대조: 내가 멤버(비소유)인데 번들 JSON에 cw_src 없음
--    (실제 점검할 project_id·user_id 는 환경에 맞게 좁혀 실행)
with acl_member as (
  select project_id, email, workspace_source_user_id, is_owner
  from public.plannode_project_acl
  where coalesce(is_owner, false) = false
),
expanded as (
  select
    w.user_id as workspace_user_id,
    e.elem->>'id' as project_id,
    e.elem->>'cloud_workspace_source_user_id' as cw_src
  from public.plannode_workspace w,
       jsonb_array_elements(w.projects_json) as e(elem)
)
select
  m.project_id,
  m.email,
  m.workspace_source_user_id as acl_workspace_source,
  x.workspace_user_id as bundle_owner_user_id,
  x.cw_src as json_cw_src,
  case
    when x.cw_src is null or btrim(x.cw_src) = '' then '🔴 merge 시 src 보강 필요'
    when btrim(x.cw_src) is not distinct from m.workspace_source_user_id::text then '✅ ACL과 일치'
    else '⚠ JSON cw_src ≠ ACL workspace_source'
  end as check_result
from acl_member m
join expanded x on x.project_id = m.project_id and x.workspace_user_id <> m.workspace_source_user_id
where x.cw_src is null or btrim(x.cw_src) = ''
order by m.project_id;

-- 스키마 재로드는 불필요(읽기 전용 진단).
