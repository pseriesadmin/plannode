-- 공유 프로젝트: 소유자 워크스페이스 슬라이스에 대한 서버 단 revision + 짧은 TTL 편집 락
-- CRDT: 전 트리 JSON CRDT는 이 스크립트에 포함하지 않음(비용·스키마). revision+락으로 선형화 후,
--       필요 시 노드 필드 단위(Yjs 등)는 별 마이그레이션으로 설계.
-- 선행: plannode_workspace.sql, plannode_project_acl.sql,
--       plannode_workspace_merge_project_slice_acl_jwt_fix.sql (ACL·merge 본문)
-- 효과: merge RPC 시그니처가 (…, p_base_revision bigint default null) 로 교체됨 — 구 4인자 오버로드는 DROP.
-- Supabase SQL Editor에서 실행 후 NOTIFY.

-- ── 메타 테이블(직접 SELECT 금지: RLS만 켜 두고 정책 없음 → RPC·SECURITY DEFINER만 접근) ──
create table if not exists public.plannode_project_collab_meta (
  workspace_user_id uuid not null references auth.users (id) on delete cascade,
  project_id text not null,
  revision bigint not null default 0,
  lock_holder uuid references auth.users (id) on delete set null,
  lock_expires_at timestamptz,
  primary key (workspace_user_id, project_id)
);

comment on table public.plannode_project_collab_meta is
  '공유 슬라이스 병합용 서버 revision 및 짧은 편집 락(협업 선형화).';

alter table public.plannode_project_collab_meta enable row level security;

-- ── ACL: merge/fetch 슬라이스와 동일 축 (JWT 이메일 + plannode_acl_email_belongs_to_session) ──
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
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select m.revision into v_rev
  from public.plannode_project_collab_meta m
  where m.workspace_user_id = p_workspace_user_id
    and m.project_id = p_project_id;

  return coalesce(v_rev, 0::bigint);
end;
$$;

create or replace function public.plannode_project_collab_try_acquire_lock(
  p_workspace_user_id uuid,
  p_project_id text,
  p_ttl_seconds int default 180
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_holder uuid;
  v_exp timestamptz;
  v_new_exp timestamptz := now() + make_interval(secs => greatest(10, least(coalesce(p_ttl_seconds, 180), 600)));
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;

  if p_workspace_user_id is null or p_project_id is null or length(trim(p_project_id)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_arguments');
  end if;

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
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select m.lock_holder, m.lock_expires_at
  into v_holder, v_exp
  from public.plannode_project_collab_meta m
  where m.workspace_user_id = p_workspace_user_id
    and m.project_id = p_project_id;

  if found then
    if v_holder is not null and v_exp is not null and v_exp > now() and v_holder is distinct from v_uid then
      return jsonb_build_object('ok', false, 'reason', 'locked_by_other', 'lock_expires_at', v_exp);
    end if;

    update public.plannode_project_collab_meta m
    set lock_holder = v_uid, lock_expires_at = v_new_exp
    where m.workspace_user_id = p_workspace_user_id
      and m.project_id = p_project_id;
  else
    insert into public.plannode_project_collab_meta (
      workspace_user_id, project_id, revision, lock_holder, lock_expires_at
    )
    values (p_workspace_user_id, p_project_id, 0, v_uid, v_new_exp);
  end if;

  return jsonb_build_object('ok', true, 'lock_expires_at', v_new_exp);
end;
$$;

create or replace function public.plannode_project_collab_release_lock(
  p_workspace_user_id uuid,
  p_project_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  if p_workspace_user_id is null or p_project_id is null or length(trim(p_project_id)) = 0 then
    return;
  end if;

  update public.plannode_project_collab_meta m
  set lock_holder = null, lock_expires_at = null
  where m.workspace_user_id = p_workspace_user_id
    and m.project_id = p_project_id
    and m.lock_holder is not distinct from v_uid;
end;
$$;

-- ── merge: revision 검증 + 타인 락 거부 + 성공 시 revision++ 및 본인 락 해제 ──
drop function if exists public.plannode_workspace_merge_project_slice(uuid, text, jsonb, jsonb);

create or replace function public.plannode_workspace_merge_project_slice(
  p_workspace_user_id uuid,
  p_project_id text,
  p_project jsonb,
  p_nodes jsonb,
  p_base_revision bigint default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_projects jsonb;
  v_nodes jsonb;
  v_filtered jsonb;
  v_new_projects jsonb;
  v_ts timestamptz;
  v_uid uuid := auth.uid();
  v_rev bigint;
  v_holder uuid;
  v_exp timestamptz;
begin
  if p_workspace_user_id is null or p_project_id is null or length(trim(p_project_id)) = 0 then
    raise exception 'invalid arguments';
  end if;

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
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select m.revision, m.lock_holder, m.lock_expires_at
  into v_rev, v_holder, v_exp
  from public.plannode_project_collab_meta m
  where m.workspace_user_id = p_workspace_user_id
    and m.project_id = p_project_id;

  if not found then
    v_rev := 0;
    v_holder := null;
    v_exp := null;
  end if;

  if v_holder is not null and v_exp is not null and v_exp > now() and v_holder is distinct from v_uid then
    raise exception 'merge_locked' using errcode = 'P0001';
  end if;

  if p_base_revision is not null and p_base_revision is distinct from v_rev then
    raise exception 'revision_stale' using errcode = 'P0001', detail = v_rev::text;
  end if;

  select w.projects_json, w.nodes_by_project_json
  into v_projects, v_nodes
  from public.plannode_workspace w
  where w.user_id = p_workspace_user_id;

  if not found then
    raise exception 'workspace_not_found' using errcode = 'P0002';
  end if;

  v_projects := coalesce(v_projects, '[]'::jsonb);
  v_nodes := coalesce(v_nodes, '{}'::jsonb);

  select coalesce(jsonb_agg(e), '[]'::jsonb)
  into v_filtered
  from jsonb_array_elements(v_projects) as e
  where e->>'id' is distinct from p_project_id;

  v_new_projects := coalesce(v_filtered, '[]'::jsonb) || jsonb_build_array(p_project);
  v_nodes := jsonb_set(v_nodes, array[p_project_id], coalesce(p_nodes, '[]'::jsonb), true);

  update public.plannode_workspace w
  set
    projects_json = v_new_projects,
    nodes_by_project_json = v_nodes,
    updated_at = now()
  where w.user_id = p_workspace_user_id
  returning w.updated_at into v_ts;

  insert into public.plannode_project_collab_meta (
    workspace_user_id, project_id, revision, lock_holder, lock_expires_at
  )
  values (p_workspace_user_id, p_project_id, 1, null, null)
  on conflict (workspace_user_id, project_id) do update
  set
    revision = public.plannode_project_collab_meta.revision + 1,
    lock_holder = null,
    lock_expires_at = null;

  return v_ts;
end;
$$;

revoke all on function public.plannode_project_collab_get_revision(uuid, text) from public;
grant execute on function public.plannode_project_collab_get_revision(uuid, text) to authenticated;

revoke all on function public.plannode_project_collab_try_acquire_lock(uuid, text, int) from public;
grant execute on function public.plannode_project_collab_try_acquire_lock(uuid, text, int) to authenticated;

revoke all on function public.plannode_project_collab_release_lock(uuid, text) from public;
grant execute on function public.plannode_project_collab_release_lock(uuid, text) to authenticated;

revoke all on function public.plannode_workspace_merge_project_slice(uuid, text, jsonb, jsonb, bigint) from public;
grant execute on function public.plannode_workspace_merge_project_slice(uuid, text, jsonb, jsonb, bigint) to authenticated;

notify pgrst, 'reload schema';
