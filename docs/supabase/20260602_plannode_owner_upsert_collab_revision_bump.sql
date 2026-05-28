-- PUSH-P2-04 — 소유자 workspace upsert 시 공유 프로젝트 collab_meta.revision++ (hash mismatch 근본)
-- 선행: plannode_project_collab_revision_lock.sql · 20260601_plannode_project_structure_ops.sql
-- Supabase SQL Editor 실행 후 NOTIFY.

-- ── ACL·collab_meta 있는 프로젝트 revision bump (nodes·projects_json 변경 감지) ──
create or replace function public.plannode_bump_owner_collab_revisions_on_bundle_write(
  p_workspace_user_id uuid,
  p_old_nodes jsonb,
  p_new_nodes jsonb,
  p_old_projects jsonb,
  p_new_projects jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid text;
  v_bumped jsonb := '[]'::jsonb;
  v_new_rev bigint;
  v_nodes_changed boolean;
  v_meta_changed boolean;
  v_old_proj jsonb;
  v_new_proj jsonb;
begin
  if p_workspace_user_id is null then
    return jsonb_build_object('bumped', '[]'::jsonb);
  end if;

  for v_pid in
    select distinct k
    from (
      select jsonb_object_keys(coalesce(p_new_nodes, '{}'::jsonb)) as k
      union
      select jsonb_object_keys(coalesce(p_old_nodes, '{}'::jsonb)) as k
      union
      select nullif(trim(e->>'id'), '')
      from jsonb_array_elements(coalesce(p_new_projects, '[]'::jsonb)) e
      union
      select nullif(trim(e->>'id'), '')
      from jsonb_array_elements(coalesce(p_old_projects, '[]'::jsonb)) e
    ) s
    where k is not null and length(k) > 0
  loop
    if not exists (
      select 1
      from public.plannode_project_acl a
      where a.project_id = v_pid
        and a.workspace_source_user_id is not distinct from p_workspace_user_id
    ) then
      continue;
    end if;

    v_nodes_changed :=
      coalesce(p_old_nodes -> v_pid, '[]'::jsonb) is distinct from coalesce(p_new_nodes -> v_pid, '[]'::jsonb);

    v_old_proj := null;
    v_new_proj := null;
    select e into v_old_proj
    from jsonb_array_elements(coalesce(p_old_projects, '[]'::jsonb)) e
    where e->>'id' = v_pid
    limit 1;
    select e into v_new_proj
    from jsonb_array_elements(coalesce(p_new_projects, '[]'::jsonb)) e
    where e->>'id' = v_pid
    limit 1;
    v_meta_changed := coalesce(v_old_proj, '{}'::jsonb) is distinct from coalesce(v_new_proj, '{}'::jsonb);

    if not v_nodes_changed and not v_meta_changed then
      continue;
    end if;

    insert into public.plannode_project_collab_meta (
      workspace_user_id, project_id, revision, last_applied_seq, lock_holder, lock_expires_at
    )
    values (p_workspace_user_id, v_pid, 1, coalesce(
      (select m.last_applied_seq from public.plannode_project_collab_meta m
       where m.workspace_user_id = p_workspace_user_id and m.project_id = v_pid),
      0
    ), null, null)
    on conflict (workspace_user_id, project_id) do update
    set revision = public.plannode_project_collab_meta.revision + 1,
        lock_holder = null,
        lock_expires_at = null
    returning revision into v_new_rev;

    v_bumped := v_bumped || jsonb_build_array(
      jsonb_build_object('project_id', v_pid, 'revision', v_new_rev)
    );
  end loop;

  return jsonb_build_object('bumped', coalesce(v_bumped, '[]'::jsonb));
end;
$$;

comment on function public.plannode_bump_owner_collab_revisions_on_bundle_write(uuid, jsonb, jsonb, jsonb, jsonb) is
  'PUSH-P2-04 — 소유자 bundle write 후 ACL 프로젝트 slice/meta 변경 시 revision++ (Realtime·poll 신호).';

-- 폴백 upsert 경로용 — project id 목록 일괄 bump (변경 비교 없음 · 드문 경로)
create or replace function public.plannode_bump_owner_collab_revisions_for_projects(
  p_project_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pid text;
  v_bumped jsonb := '[]'::jsonb;
  v_new_rev bigint;
begin
  if v_uid is null or p_project_ids is null then
    return jsonb_build_object('bumped', '[]'::jsonb);
  end if;

  foreach v_pid in array p_project_ids
  loop
    if v_pid is null or length(trim(v_pid)) = 0 then
      continue;
    end if;
    if not exists (
      select 1
      from public.plannode_project_acl a
      where a.project_id = v_pid
        and a.workspace_source_user_id is not distinct from v_uid
    ) then
      continue;
    end if;

    insert into public.plannode_project_collab_meta (
      workspace_user_id, project_id, revision, last_applied_seq, lock_holder, lock_expires_at
    )
    values (v_uid, v_pid, 1, coalesce(
      (select m.last_applied_seq from public.plannode_project_collab_meta m
       where m.workspace_user_id = v_uid and m.project_id = v_pid),
      0
    ), null, null)
    on conflict (workspace_user_id, project_id) do update
    set revision = public.plannode_project_collab_meta.revision + 1,
        lock_holder = null,
        lock_expires_at = null
    returning revision into v_new_rev;

    v_bumped := v_bumped || jsonb_build_array(
      jsonb_build_object('project_id', v_pid, 'revision', v_new_rev)
    );
  end loop;

  return jsonb_build_object('bumped', coalesce(v_bumped, '[]'::jsonb));
end;
$$;

grant execute on function public.plannode_bump_owner_collab_revisions_on_bundle_write(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.plannode_bump_owner_collab_revisions_for_projects(text[]) to authenticated;

-- ── upsert RPC: 성공 시 revision bump + bumped 목록 반환 ──
create or replace function public.plannode_workspace_upsert_workspace_bundle(
  p_projects_json jsonb,
  p_nodes_by_project_json jsonb,
  p_expected_server_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cur_ts timestamptz;
  old_nodes jsonb;
  old_projects jsonb;
  new_ts timestamptz := clock_timestamp();
  uid uuid := auth.uid();
  bump_result jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;

  select w.updated_at, w.nodes_by_project_json, w.projects_json
  into cur_ts, old_nodes, old_projects
  from public.plannode_workspace w
  where w.user_id = uid;

  if found then
    if p_expected_server_updated_at is not null and cur_ts is distinct from p_expected_server_updated_at then
      return jsonb_build_object('ok', false, 'reason', 'conflict', 'server_updated_at', cur_ts);
    end if;

    update public.plannode_workspace w
    set
      projects_json = p_projects_json,
      nodes_by_project_json = p_nodes_by_project_json,
      updated_at = new_ts
    where w.user_id = uid;

    bump_result := public.plannode_bump_owner_collab_revisions_on_bundle_write(
      uid,
      coalesce(old_nodes, '{}'::jsonb),
      coalesce(p_nodes_by_project_json, '{}'::jsonb),
      coalesce(old_projects, '[]'::jsonb),
      coalesce(p_projects_json, '[]'::jsonb)
    );

    return jsonb_build_object(
      'ok', true,
      'server_updated_at', new_ts,
      'collab_revision_bumps', coalesce(bump_result -> 'bumped', '[]'::jsonb)
    );
  else
    if p_expected_server_updated_at is not null then
      return jsonb_build_object('ok', false, 'reason', 'conflict', 'server_updated_at', null);
    end if;

    insert into public.plannode_workspace (user_id, projects_json, nodes_by_project_json, updated_at)
    values (uid, p_projects_json, p_nodes_by_project_json, new_ts);

    bump_result := public.plannode_bump_owner_collab_revisions_on_bundle_write(
      uid,
      '{}'::jsonb,
      coalesce(p_nodes_by_project_json, '{}'::jsonb),
      '[]'::jsonb,
      coalesce(p_projects_json, '[]'::jsonb)
    );

    return jsonb_build_object(
      'ok', true,
      'server_updated_at', new_ts,
      'collab_revision_bumps', coalesce(bump_result -> 'bumped', '[]'::jsonb)
    );
  end if;
end;
$$;

comment on function public.plannode_workspace_upsert_workspace_bundle(jsonb, jsonb, timestamptz) is
  '조건부 bundle upsert + PUSH-P2-04 owner collab revision bump on slice/meta change.';

-- ── append_structure_ops: 소유자(workspace_user_id = auth.uid()) ACL 이메일 축 우회 ──
create or replace function public.plannode_append_structure_ops(
  p_workspace_user_id uuid,
  p_project_id text,
  p_ops jsonb,
  p_client_id text default '',
  p_base_revision bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rev bigint;
  v_last_seq bigint;
  v_holder uuid;
  v_exp timestamptz;
  v_projects jsonb;
  v_nodes jsonb;
  v_filtered jsonb;
  v_new_projects jsonb;
  v_proj_nodes jsonb;
  v_op jsonb;
  v_next_seq bigint;
  v_new_rev bigint;
  v_ts timestamptz;
  v_project jsonb;
  v_client_id text := coalesce(nullif(trim(p_client_id), ''), '');
  v_is_owner boolean;
begin
  if v_uid is null then
    raise exception 'auth required';
  end if;
  if p_workspace_user_id is null or p_project_id is null or length(trim(p_project_id)) = 0 then
    raise exception 'invalid arguments';
  end if;
  if p_ops is null or jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) = 0 then
    raise exception 'empty ops';
  end if;

  v_is_owner := p_workspace_user_id is not distinct from v_uid;

  if not v_is_owner and not exists (
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

  if v_is_owner and not exists (
    select 1
    from jsonb_array_elements(
      coalesce(
        (select w.projects_json from public.plannode_workspace w where w.user_id = v_uid),
        '[]'::jsonb
      )
    ) e
    where e->>'id' = p_project_id
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select m.revision, m.last_applied_seq, m.lock_holder, m.lock_expires_at
  into v_rev, v_last_seq, v_holder, v_exp
  from public.plannode_project_collab_meta m
  where m.workspace_user_id = p_workspace_user_id
    and m.project_id = p_project_id;

  if not found then
    v_rev := 0;
    v_last_seq := 0;
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
  v_proj_nodes := coalesce(v_nodes->p_project_id, '[]'::jsonb);

  v_next_seq := coalesce(v_last_seq, 0);

  for v_op in select * from jsonb_array_elements(p_ops)
  loop
    v_next_seq := v_next_seq + 1;
    v_proj_nodes := public.plannode_apply_structure_op_to_nodes(v_proj_nodes, v_op);
    insert into public.plannode_project_structure_ops (
      workspace_user_id, project_id, seq, op, client_id, actor_user_id
    )
    values (
      p_workspace_user_id,
      p_project_id,
      v_next_seq,
      v_op,
      v_client_id,
      v_uid
    );
  end loop;

  select e into v_project
  from jsonb_array_elements(v_projects) e
  where e->>'id' = p_project_id
  limit 1;

  select coalesce(jsonb_agg(e), '[]'::jsonb)
  into v_filtered
  from jsonb_array_elements(v_projects) e
  where e->>'id' is distinct from p_project_id;

  v_new_projects := coalesce(v_filtered, '[]'::jsonb);
  if v_project is not null then
    v_new_projects := v_new_projects || jsonb_build_array(v_project);
  end if;

  v_nodes := jsonb_set(v_nodes, array[p_project_id], v_proj_nodes, true);

  update public.plannode_workspace w
  set
    projects_json = v_new_projects,
    nodes_by_project_json = v_nodes,
    updated_at = now()
  where w.user_id = p_workspace_user_id
  returning w.updated_at into v_ts;

  v_new_rev := coalesce(v_rev, 0) + 1;

  insert into public.plannode_project_collab_meta (
    workspace_user_id, project_id, revision, last_applied_seq, lock_holder, lock_expires_at
  )
  values (p_workspace_user_id, p_project_id, v_new_rev, v_next_seq, null, null)
  on conflict (workspace_user_id, project_id) do update
  set
    revision = v_new_rev,
    last_applied_seq = v_next_seq,
    lock_holder = null,
    lock_expires_at = null;

  return jsonb_build_object(
    'revision', v_new_rev,
    'last_applied_seq', v_next_seq,
    'updated_at', v_ts
  );
end;
$$;

comment on function public.plannode_append_structure_ops(uuid, text, jsonb, text, bigint) is
  'EPIC E + P2-04 — structure ops append; owner(self workspace) 또는 ACL 멤버.';

notify pgrst, 'reload schema';
