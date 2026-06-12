-- DEL-WS-SYNC Phase C — 서버 삭제 기록(plannode_project_deletions) + fetch RPC
-- 선행: 20260612_plannode_workspace_remove_project.sql (remove_project RPC)
-- Supabase SQL Editor 실행 후 NOTIFY.

-- ── 1) 삭제 기록 테이블 (워크스페이스별 project_id 영구 tomb) ──
create table if not exists public.plannode_project_deletions (
  workspace_user_id uuid not null references auth.users(id) on delete cascade,
  project_id        text not null,
  deleted_at        timestamptz not null default now(),
  deleted_by        uuid references auth.users(id) on delete set null,
  deletion_kind     text not null default 'owner_remove'
    check (deletion_kind in ('owner_remove', 'member_ref_remove')),
  primary key (workspace_user_id, project_id)
);

create index if not exists idx_plannode_project_deletions_ws_deleted_at
  on public.plannode_project_deletions (workspace_user_id, deleted_at desc);

comment on table public.plannode_project_deletions is
  'DEL-WS-SYNC Phase C — 워크스페이스 JSON 번들과 별도 삭제 정본. stale projects_json 고스트보다 우선.';

alter table public.plannode_project_deletions enable row level security;

drop policy if exists "project_deletions_select_own" on public.plannode_project_deletions;
create policy "project_deletions_select_own" on public.plannode_project_deletions
  for select using (workspace_user_id = auth.uid());

-- insert/update: SECURITY DEFINER RPC만 (직접 DML 차단)

-- ── 2) 내부: 삭제 기록 upsert ──
create or replace function public.plannode_record_project_deletion(
  p_workspace_user_id uuid,
  p_project_id text,
  p_deleted_by uuid,
  p_deletion_kind text default 'owner_remove'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_workspace_user_id is null or p_project_id is null or length(trim(p_project_id)) = 0 then
    return;
  end if;
  insert into public.plannode_project_deletions (
    workspace_user_id, project_id, deleted_at, deleted_by, deletion_kind
  )
  values (
    p_workspace_user_id,
    trim(p_project_id),
    clock_timestamp(),
    p_deleted_by,
    coalesce(nullif(trim(p_deletion_kind), ''), 'owner_remove')
  )
  on conflict (workspace_user_id, project_id) do update
  set
    deleted_at = excluded.deleted_at,
    deleted_by = excluded.deleted_by,
    deletion_kind = excluded.deletion_kind;
end;
$$;

-- ── 3) fetch RPC — auth.uid() 워크스페이스 삭제 목록 (증분) ──
create or replace function public.plannode_fetch_project_deletions_since(
  p_since timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_since timestamptz := coalesce(p_since, '1970-01-01'::timestamptz);
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;

  return jsonb_build_object(
    'ok', true,
    'deletions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'project_id', d.project_id,
          'deleted_at', d.deleted_at,
          'deletion_kind', d.deletion_kind
        )
        order by d.deleted_at asc
      )
      from (
        select d.project_id, d.deleted_at, d.deletion_kind
        from public.plannode_project_deletions d
        where d.workspace_user_id = uid
          and d.deleted_at >= v_since
        order by d.deleted_at asc
        limit 500
      ) d
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.plannode_fetch_project_deletions_since(timestamptz) is
  'DEL-WS-SYNC Phase C — auth.uid() 워크스페이스 삭제 id 증분 fetch (최대 500).';

grant execute on function public.plannode_fetch_project_deletions_since(timestamptz) to authenticated;

-- ── 2b) 번들 upsert 폴백 — 클라이언트가 제외한 id를 삭제 기록에 반영 ──
create or replace function public.plannode_record_my_project_deletions(
  p_project_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  pid text;
  n int := 0;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  if p_project_ids is null or array_length(p_project_ids, 1) is null then
    return jsonb_build_object('ok', true, 'recorded', 0);
  end if;
  foreach pid in array p_project_ids loop
    if pid is not null and length(trim(pid)) > 0 then
      perform public.plannode_record_project_deletion(uid, trim(pid), uid, 'owner_remove');
      n := n + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'recorded', n);
end;
$$;

comment on function public.plannode_record_my_project_deletions(text[]) is
  'DEL-WS-SYNC Phase C — bundle upsert 폴백 후 skipIds를 서버 deletion 테이블에 기록.';

grant execute on function public.plannode_record_my_project_deletions(text[]) to authenticated;

-- ── 4) remove_project — JSON 제거 + 삭제 기록 (Phase C) ──
create or replace function public.plannode_workspace_remove_project(
  p_project_id text,
  p_prune_collab_meta boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  old_projects jsonb;
  old_nodes jsonb;
  new_projects jsonb;
  new_nodes jsonb;
  new_ts timestamptz := clock_timestamp();
  bump_result jsonb;
  v_removed boolean := false;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  if p_project_id is null or length(trim(p_project_id)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_project_id');
  end if;

  select w.projects_json, w.nodes_by_project_json
  into old_projects, old_nodes
  from public.plannode_workspace w
  where w.user_id = uid
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_workspace', 'removed', false);
  end if;

  old_projects := coalesce(old_projects, '[]'::jsonb);
  old_nodes := coalesce(old_nodes, '{}'::jsonb);

  if exists (
    select 1 from jsonb_array_elements(old_projects) e where e->>'id' = p_project_id
  ) or old_nodes ? p_project_id then
    v_removed := true;
  end if;

  select coalesce(jsonb_agg(e), '[]'::jsonb)
  into new_projects
  from jsonb_array_elements(old_projects) e
  where coalesce(e->>'id', '') is distinct from p_project_id;

  new_nodes := old_nodes - p_project_id;

  update public.plannode_workspace w
  set projects_json = new_projects, nodes_by_project_json = new_nodes, updated_at = new_ts
  where w.user_id = uid;

  bump_result := public.plannode_bump_owner_collab_revisions_on_bundle_write(
    uid, old_nodes, new_nodes, old_projects, new_projects
  );

  if coalesce(p_prune_collab_meta, true) and v_removed then
    delete from public.plannode_project_structure_ops o where o.project_id = p_project_id;
    delete from public.plannode_project_collab_meta m
    where m.workspace_user_id = uid and m.project_id = p_project_id;
  end if;

  if v_removed then
    perform public.plannode_record_project_deletion(uid, p_project_id, uid, 'owner_remove');
  end if;

  return jsonb_build_object(
    'ok', true,
    'removed', v_removed,
    'server_updated_at', new_ts,
    'collab_revision_bumps', coalesce(bump_result -> 'bumped', '[]'::jsonb),
    'deletion_recorded', v_removed
  );
end;
$$;

-- ── 5) member ref remove — JSON 제거 + 멤버 워크스페이스 삭제 기록 ──
create or replace function public.plannode_workspace_remove_shared_project_ref(
  p_project_id text,
  p_owner_workspace_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  old_projects jsonb;
  old_nodes jsonb;
  new_projects jsonb;
  new_nodes jsonb;
  new_ts timestamptz := clock_timestamp();
  v_removed boolean := false;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  if p_project_id is null or length(trim(p_project_id)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_project_id');
  end if;

  select w.projects_json, w.nodes_by_project_json
  into old_projects, old_nodes
  from public.plannode_workspace w
  where w.user_id = uid
  for update;

  if not found then
    return jsonb_build_object('ok', true, 'removed', false, 'server_updated_at', new_ts);
  end if;

  old_projects := coalesce(old_projects, '[]'::jsonb);
  old_nodes := coalesce(old_nodes, '{}'::jsonb);

  select coalesce(jsonb_agg(e), '[]'::jsonb)
  into new_projects
  from jsonb_array_elements(old_projects) e
  where not (
    e->>'id' = p_project_id
    and (
      p_owner_workspace_user_id is null
      or coalesce(e->>'cloud_workspace_source_user_id', '') = p_owner_workspace_user_id::text
    )
  );

  if jsonb_array_length(old_projects) is distinct from jsonb_array_length(new_projects)
     or old_nodes ? p_project_id then
    v_removed := true;
  end if;

  new_nodes := old_nodes - p_project_id;

  update public.plannode_workspace w
  set projects_json = new_projects, nodes_by_project_json = new_nodes, updated_at = new_ts
  where w.user_id = uid;

  if v_removed then
    perform public.plannode_record_project_deletion(uid, p_project_id, uid, 'member_ref_remove');
  end if;

  return jsonb_build_object(
    'ok', true,
    'removed', v_removed,
    'server_updated_at', new_ts,
    'deletion_recorded', v_removed
  );
end;
$$;

-- record 함수는 SECURITY DEFINER RPC 내부 전용 — authenticated 직접 grant 없음
