-- 공유 슬라이스 저장 경로 RPC 통합: get_revision + try_acquire_lock + merge + release_lock → 1트랜잭션
-- 효과: 클라이언트 4회 순차 왕복 → 1회 왕복으로 감소 → 공유 저장 체감 지연 대폭 감소
-- 하위 호환: 기존 4개 RPC는 유지. 클라이언트가 plannode_project_collab_merge_atomic 호출 성공 시
--           try_acquire_lock / release_lock 호출 불필요.
-- 선행: plannode_project_collab_revision_lock.sql, plannode_workspace_merge_project_slice.sql
-- Supabase SQL Editor에서 실행 후 NOTIFY.

-- ── 풀 슬라이스 통합 RPC ──────────────────────────────────────────────────────────────
create or replace function public.plannode_project_collab_merge_atomic(
  p_workspace_user_id uuid,
  p_project_id        text,
  p_project           jsonb,
  p_nodes             jsonb,
  p_base_revision     bigint  default null,
  p_lock_ttl_seconds  int     default 60,   -- 트랜잭션 내 락; 성공 시 즉시 해제
  p_use_delta         boolean default false  -- true: p_nodes를 delta(변경 노드만)로 처리
)
returns jsonb   -- { ok, revision, updated_at, error? }
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_rev        bigint;
  v_holder     uuid;
  v_exp        timestamptz;
  v_projects   jsonb;
  v_nodes_cur  jsonb;
  v_filtered   jsonb;
  v_merged     jsonb;
  v_ts         timestamptz;
  v_new_exp    timestamptz := now() + make_interval(secs => greatest(10, least(coalesce(p_lock_ttl_seconds, 60), 600)));
begin
  -- ── 인증 ──────────────────────────────────────────────────────────────────────────
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth');
  end if;
  if p_workspace_user_id is null or p_project_id is null or length(trim(p_project_id)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_arguments');
  end if;

  -- ── ACL 검증 ──────────────────────────────────────────────────────────────────────
  if not exists (
    select 1
    from public.plannode_project_acl a
    where a.project_id = p_project_id
      and a.workspace_source_user_id is not distinct from p_workspace_user_id
      and (
        lower(trim(a.email)) = lower(trim(coalesce(nullif(trim(auth.jwt() ->> 'email'), ''), '')))
        or public.plannode_acl_email_belongs_to_session(a.email)
      )
  ) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- ── revision + 락 상태 조회 (SELECT FOR UPDATE — 행 레벨 직렬화) ──────────────────
  select m.revision, m.lock_holder, m.lock_expires_at
  into v_rev, v_holder, v_exp
  from public.plannode_project_collab_meta m
  where m.workspace_user_id = p_workspace_user_id
    and m.project_id = p_project_id
  for update;

  if not found then
    -- 메타 행 없으면 초기화
    insert into public.plannode_project_collab_meta
      (workspace_user_id, project_id, revision, lock_holder, lock_expires_at)
    values
      (p_workspace_user_id, p_project_id, 0, null, null);
    v_rev    := 0;
    v_holder := null;
    v_exp    := null;
  end if;

  -- ── 타인 락 검사 ──────────────────────────────────────────────────────────────────
  if v_holder is not null and v_exp is not null and v_exp > now() and v_holder is distinct from v_uid then
    return jsonb_build_object('ok', false, 'error', 'merge_locked', 'lock_expires_at', v_exp);
  end if;

  -- ── revision 검증 ─────────────────────────────────────────────────────────────────
  if p_base_revision is not null and p_base_revision is distinct from v_rev then
    return jsonb_build_object('ok', false, 'error', 'revision_stale', 'revision', v_rev);
  end if;

  -- ── 락 획득 (본인 or 만료 락 교체) ───────────────────────────────────────────────
  update public.plannode_project_collab_meta m
  set lock_holder = v_uid, lock_expires_at = v_new_exp
  where m.workspace_user_id = p_workspace_user_id
    and m.project_id = p_project_id;

  -- ── 워크스페이스 번들 읽기 ────────────────────────────────────────────────────────
  select w.projects_json, w.nodes_by_project_json
  into v_projects, v_nodes_cur
  from public.plannode_workspace w
  where w.user_id = p_workspace_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'workspace_not_found');
  end if;

  v_projects   := coalesce(v_projects, '[]'::jsonb);
  v_nodes_cur  := coalesce(v_nodes_cur, '{}'::jsonb);

  -- ── 노드 병합 ─────────────────────────────────────────────────────────────────────
  if p_use_delta then
    -- delta 모드: 기존 노드에서 변경 노드만 LWW 교체 (누락 id는 prune 없음)
    declare
      v_existing jsonb := coalesce(v_nodes_cur -> p_project_id, '[]'::jsonb);
      v_delta_ids text[];
      v_elem jsonb;
    begin
      select array_agg(e->>'id')
      into v_delta_ids
      from jsonb_array_elements(coalesce(p_nodes, '[]'::jsonb)) as e;

      -- delta id가 없는 기존 노드 유지
      select coalesce(jsonb_agg(e), '[]'::jsonb)
      into v_merged
      from jsonb_array_elements(v_existing) as e
      where not (e->>'id' = any(v_delta_ids));

      v_merged := coalesce(v_merged, '[]'::jsonb) || coalesce(p_nodes, '[]'::jsonb);
    end;
  else
    -- 풀 스냅샷 모드: 해당 프로젝트 키 통째 교체
    v_merged := coalesce(p_nodes, '[]'::jsonb);
  end if;

  -- ── 프로젝트 메타 교체 ────────────────────────────────────────────────────────────
  select coalesce(jsonb_agg(e), '[]'::jsonb)
  into v_filtered
  from jsonb_array_elements(v_projects) as e
  where e->>'id' is distinct from p_project_id;

  -- ── 번들 업데이트 ─────────────────────────────────────────────────────────────────
  update public.plannode_workspace w
  set
    projects_json        = coalesce(v_filtered, '[]'::jsonb) || jsonb_build_array(p_project),
    nodes_by_project_json = jsonb_set(v_nodes_cur, array[p_project_id], v_merged, true),
    updated_at           = now()
  where w.user_id = p_workspace_user_id
  returning w.updated_at into v_ts;

  -- ── revision 증가 + 락 즉시 해제 ─────────────────────────────────────────────────
  update public.plannode_project_collab_meta m
  set
    revision       = revision + 1,
    lock_holder    = null,
    lock_expires_at = null
  where m.workspace_user_id = p_workspace_user_id
    and m.project_id         = p_project_id;

  return jsonb_build_object(
    'ok',         true,
    'revision',   v_rev + 1,
    'updated_at', v_ts
  );
end;
$$;

revoke all  on function public.plannode_project_collab_merge_atomic(uuid, text, jsonb, jsonb, bigint, int, boolean) from public;
grant execute on function public.plannode_project_collab_merge_atomic(uuid, text, jsonb, jsonb, bigint, int, boolean) to authenticated;

notify pgrst, 'reload schema';
