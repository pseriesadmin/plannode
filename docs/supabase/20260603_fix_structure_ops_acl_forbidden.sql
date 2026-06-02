-- 멤버 ACL row의 workspace_source_user_id = NULL 상태에서 발생하는
-- plannode_project_collab_get_revision / plannode_fetch_structure_ops_since 403 수정.
--
-- 원인: plannode_project_acl_repair_project_sources는 소유자만 호출 가능 →
--   멤버 row의 workspace_source_user_id가 null인 채로 남으면 ACL 검증 실패 → 403.
-- 증상: fetchCollabRevision/fetchStructureOpsSince가 6초마다 403 →
--   ops-first 경로 완전 실패 → LWW 스냅샷 병합 강제 실행 → B 작성 노드 누락.
--
-- 수정 전략: workspace_source_user_id = null 상태의 멤버 row에 대해서도
--   소유자(is_owner=true) row의 workspace_source_user_id 가 p_workspace_user_id 와
--   일치하면 허용 (2-step ACL lookup).
--
-- 선행: plannode_project_collab_revision_lock.sql · 20260601_plannode_project_structure_ops.sql

-- ── 헬퍼: 호출자 이메일이 해당 프로젝트 ACL에 존재하는지 확인 ──
-- (workspace_source_user_id 없이 email+project 만으로 체크)
create or replace function public.plannode_acl_caller_has_project_access(p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.plannode_project_acl a
    where a.project_id = p_project_id
      and (
        lower(trim(a.email)) = lower(trim(coalesce(nullif(trim(auth.jwt() ->> 'email'), ''), '')))
        or public.plannode_acl_email_belongs_to_session(a.email)
      )
  );
$$;

-- ── 헬퍼: p_workspace_user_id 가 해당 프로젝트의 실제 소유자 워크스페이스인지 검증 ──
-- 소유자 ACL row의 workspace_source_user_id 또는 소유자가 직접 호출하는 경우 허용.
create or replace function public.plannode_acl_workspace_is_project_owner(
  p_project_id text,
  p_workspace_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.plannode_project_acl o
    where o.project_id = p_project_id
      and o.is_owner = true
      and (
        -- 소유자 row에 workspace_source_user_id 가 설정된 경우 (repair 완료)
        o.workspace_source_user_id = p_workspace_user_id
        -- 또는 소유자가 본인 워크스페이스를 직접 조회하는 경우
        or (o.workspace_source_user_id is null and auth.uid() = p_workspace_user_id)
      )
  )
  -- 소유자 row에도 workspace_source_user_id 가 없을 경우 최후 fallback:
  -- plannode_workspace.user_id 로 실제 소유자 검증
  or exists (
    select 1
    from public.plannode_workspace w
    where w.user_id = p_workspace_user_id
      and (
        w.projects_json @> jsonb_build_array(jsonb_build_object('id', p_project_id))
      )
  );
$$;

-- ── plannode_project_collab_get_revision 재정의 ──
create or replace function public.plannode_project_collab_get_revision(
  p_workspace_user_id uuid,
  p_project_id text
)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rev bigint;
begin
  if p_workspace_user_id is null or p_project_id is null or length(trim(p_project_id)) = 0 then
    raise exception 'invalid arguments';
  end if;

  -- Step 1: 호출자가 이 프로젝트에 접근 가능한지 (email 기준)
  if not public.plannode_acl_caller_has_project_access(p_project_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Step 2: p_workspace_user_id 가 이 프로젝트의 실제 소유자 워크스페이스인지
  --   (workspace_source_user_id 가 null 인 경우도 소유자 row 및 plannode_workspace 로 검증)
  if not public.plannode_acl_workspace_is_project_owner(p_project_id, p_workspace_user_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select m.revision into v_rev
  from public.plannode_project_collab_meta m
  where m.workspace_user_id = p_workspace_user_id
    and m.project_id = p_project_id;

  return coalesce(v_rev, 0::bigint);
end;
$$;

-- ── plannode_fetch_structure_ops_since 재정의 ──
create or replace function public.plannode_fetch_structure_ops_since(
  p_workspace_user_id uuid,
  p_project_id text,
  p_since_seq bigint default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ops jsonb;
  v_rev bigint;
  v_last_seq bigint;
  v_nodes jsonb;
begin
  if p_workspace_user_id is null or p_project_id is null or length(trim(p_project_id)) = 0 then
    raise exception 'invalid arguments';
  end if;

  -- Step 1: 호출자 프로젝트 접근 권한
  if not public.plannode_acl_caller_has_project_access(p_project_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Step 2: p_workspace_user_id 가 실제 소유자 워크스페이스인지
  if not public.plannode_acl_workspace_is_project_owner(p_project_id, p_workspace_user_id) then
    raise exception 'forbidden' using errcode = '42501';
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

  select m.revision, m.last_applied_seq
  into v_rev, v_last_seq
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
    'nodes', coalesce(v_nodes, '[]'::jsonb)
  );
end;
$$;

-- ── 권한 설정 ──
revoke all on function public.plannode_acl_caller_has_project_access(text) from public;
grant execute on function public.plannode_acl_caller_has_project_access(text) to authenticated;

revoke all on function public.plannode_acl_workspace_is_project_owner(text, uuid) from public;
grant execute on function public.plannode_acl_workspace_is_project_owner(text, uuid) to authenticated;

notify pgrst, 'reload schema';
