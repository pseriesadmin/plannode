-- 2026-06-04: 협업 revision·structure_ops RPC 최종본 (Dashboard 적용 내용 파일화)
--
-- 배경:
--   - security definer RPC 내부에서 plannode_project_acl EXISTS + RLS(email qual) → 항상 forbidden(42501)
--   - stable 함수에 SET LOCAL search_path → 400 (0A000)
--   - p_workspace_user_id 비-UUID → PostgREST 400
--
-- 정책 (유지):
--   - revision·ops fetch는 로그인(auth.uid())만 검사. 노드 본문·쓰기 권한은 merge·번들·ACL UI.
--   - VOLATILE + set search_path = public, auth (함수 헤더; SET LOCAL 사용 안 함)
--
-- 선행(미적용 시):
--   docs/supabase/20260604_acl_add_user_id_column.sql  (plannode_project_acl.user_id)
--
-- 이후(선택):
--   docs/supabase/20260604_cleanup_deleted_project_ops.sql
--
-- 아키텍처: .cursor/rules/plannode-architecture.mdc §10.11
-- 개요: .cursor/rules/plannode-architecture.mdc §10.11.3

-- ── plannode_project_acl: security definer가 SELECT 할 수 있도록 ──
alter table public.plannode_project_acl no force row level security;

-- Dashboard 실험용 정책이 있으면 제거 (postgres 전용 SELECT)
drop policy if exists plannode_project_acl_service_select on public.plannode_project_acl;

-- ── plannode_project_collab_get_revision ──
drop function if exists public.plannode_project_collab_get_revision(uuid, text);

create function public.plannode_project_collab_get_revision(
  p_workspace_user_id uuid,
  p_project_id text
)
returns bigint
language plpgsql
volatile
security definer
set search_path = public, auth
as $func$
declare
  v_rev bigint;
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  if p_project_id is null or length(trim(p_project_id)) = 0 then
    raise exception 'invalid arguments';
  end if;

  select m.revision into v_rev
  from public.plannode_project_collab_meta m
  where m.project_id = p_project_id
    and (p_workspace_user_id is null or m.workspace_user_id = p_workspace_user_id)
  order by m.revision desc
  limit 1;

  return coalesce(v_rev, 0::bigint);
end;
$func$;

comment on function public.plannode_project_collab_get_revision(uuid, text) is
  '협업 revision 조회. 로그인만 검사. ACL은 merge·번들·UI 경로. 20260604_final_collab_functions_fix.';

grant execute on function public.plannode_project_collab_get_revision(uuid, text) to authenticated;

-- ── plannode_fetch_structure_ops_since ──
drop function if exists public.plannode_fetch_structure_ops_since(uuid, text, bigint);

create function public.plannode_fetch_structure_ops_since(
  p_workspace_user_id uuid,
  p_project_id text,
  p_since_seq bigint default 0
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $func$
declare
  v_ops jsonb;
  v_rev bigint;
  v_last_seq bigint;
  v_nodes jsonb;
  v_op_log_complete boolean;
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  if p_workspace_user_id is null or p_project_id is null or length(trim(p_project_id)) = 0 then
    raise exception 'invalid arguments';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'seq', o.seq,
      'op', o.op,
      'client_id', o.client_id,
      'created_at', o.created_at
    ) order by o.seq
  ), '[]'::jsonb)
  into v_ops
  from public.plannode_project_structure_ops o
  where o.workspace_user_id = p_workspace_user_id
    and o.project_id = p_project_id
    and o.seq > greatest(coalesce(p_since_seq, 0), 0);

  select m.revision, m.last_applied_seq, coalesce(m.op_log_complete, false)
  into v_rev, v_last_seq, v_op_log_complete
  from public.plannode_project_collab_meta m
  where m.workspace_user_id = p_workspace_user_id
    and m.project_id = p_project_id;

  select w.nodes_by_project_json->p_project_id
  into v_nodes
  from public.plannode_workspace w
  where w.user_id = p_workspace_user_id;

  return jsonb_build_object(
    'ops', coalesce(v_ops, '[]'::jsonb),
    'revision', coalesce(v_rev, 0),
    'last_applied_seq', coalesce(v_last_seq, 0),
    'nodes', coalesce(v_nodes, '[]'::jsonb),
    'op_log_complete', coalesce(v_op_log_complete, false)
  );
end;
$func$;

comment on function public.plannode_fetch_structure_ops_since(uuid, text, bigint) is
  'structure_ops 증분 pull. 로그인만 검사. 반환 키 nodes는 projectStructureOps.ts 계약. 20260604_final_collab_functions_fix.';

grant execute on function public.plannode_fetch_structure_ops_since(uuid, text, bigint) to authenticated;
