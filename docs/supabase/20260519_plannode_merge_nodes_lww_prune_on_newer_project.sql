-- 공유 merge: p_project.updated_at 이 소유자 워크스페이스에 저장된 값보다 새로우면
-- p_nodes 에 없는 기존 노드 id 를 LWW 맵에서 제거(삭제·이동 반영). 필드 단위 OT 없음.
-- 선행: 20260518_plannode_workspace_merge_project_slice_per_node_lww.sql
-- Supabase SQL Editor 실행 후 NOTIFY.

drop function if exists public.plannode_merge_nodes_jsonb_lww(jsonb, jsonb);

create or replace function public.plannode_merge_nodes_jsonb_lww(
  p_existing_nodes jsonb,
  p_incoming_nodes jsonb,
  p_prune_missing boolean default false
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_map jsonb := '{}'::jsonb;
  e jsonb;
  v_id text;
  v_ts_ex timestamptz;
  v_ts_in timestamptz;
  v_out jsonb := '[]'::jsonb;
  seen jsonb := '{}'::jsonb;
  rec record;
  v_incoming_ids jsonb := '{}'::jsonb;
begin
  for e in select * from jsonb_array_elements(coalesce(p_existing_nodes, '[]'::jsonb))
  loop
    v_id := nullif(trim(e->>'id'), '');
    continue when v_id is null;
    v_map := v_map || jsonb_build_object(v_id, e);
  end loop;

  for e in select * from jsonb_array_elements(coalesce(p_incoming_nodes, '[]'::jsonb))
  loop
    v_id := nullif(trim(e->>'id'), '');
    continue when v_id is null;
    v_incoming_ids := v_incoming_ids || jsonb_build_object(v_id, '1'::jsonb);
    v_ts_in := coalesce(
      case
        when nullif(trim(e->>'updated_at'), '') is null then null::timestamptz
        else (e->>'updated_at')::timestamptz
      end,
      'epoch'::timestamptz
    );
    if not (v_map ? v_id) then
      v_map := v_map || jsonb_build_object(v_id, e);
    else
      v_ts_ex := coalesce(
        case
          when nullif(trim((v_map->v_id)->>'updated_at'), '') is null then null::timestamptz
          else ((v_map->v_id)->>'updated_at')::timestamptz
        end,
        'epoch'::timestamptz
      );
      if v_ts_in > v_ts_ex then
        v_map := v_map || jsonb_build_object(v_id, e);
      end if;
    end if;
  end loop;

  if p_prune_missing then
    for v_id in select key from jsonb_object_keys(v_map) as key
    loop
      if not (v_incoming_ids ? v_id) then
        v_map := v_map - v_id;
      end if;
    end loop;
  end if;

  for rec in
    select s.id
    from (
      select nullif(trim(elem->>'id'), '') as id, ord
      from jsonb_array_elements(coalesce(p_incoming_nodes, '[]'::jsonb)) with ordinality as t(elem, ord)
    ) s
    where s.id is not null
    group by s.id
    order by min(s.ord)
  loop
    if (v_map ? rec.id) and not (seen ? rec.id) then
      v_out := v_out || jsonb_build_array(v_map->rec.id);
      seen := seen || jsonb_build_object(rec.id, '1'::jsonb);
    end if;
  end loop;

  for e in select * from jsonb_array_elements(coalesce(p_existing_nodes, '[]'::jsonb))
  loop
    v_id := nullif(trim(e->>'id'), '');
    continue when v_id is null;
    if not (seen ? v_id) and (v_map ? v_id) then
      v_out := v_out || jsonb_build_array(v_map->v_id);
      seen := seen || jsonb_build_object(v_id, '1'::jsonb);
    end if;
  end loop;

  return v_out;
end;
$$;

comment on function public.plannode_merge_nodes_jsonb_lww(jsonb, jsonb, boolean) is
  'id 단위 updated_at LWW. p_prune_missing=true 이면 incoming 에 없는 id 는 맵에서 제거(merge RPC·프로젝트 메타가 더 새로울 때).';

revoke all on function public.plannode_merge_nodes_jsonb_lww(jsonb, jsonb, boolean) from public;
grant execute on function public.plannode_merge_nodes_jsonb_lww(jsonb, jsonb, boolean) to authenticated;

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
  v_existing_project jsonb;
  v_existing_proj_ts timestamptz;
  v_incoming_proj_ts timestamptz;
  v_prune boolean := false;
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

  select e into v_existing_project
  from jsonb_array_elements(v_projects) as e
  where e->>'id' = p_project_id
  limit 1;

  v_incoming_proj_ts := coalesce(
    case
      when nullif(trim(p_project->>'updated_at'), '') is null then null::timestamptz
      else (p_project->>'updated_at')::timestamptz
    end,
    'epoch'::timestamptz
  );

  v_existing_proj_ts := coalesce(
    case
      when v_existing_project is null or nullif(trim(v_existing_project->>'updated_at'), '') is null then null::timestamptz
      else (v_existing_project->>'updated_at')::timestamptz
    end,
    'epoch'::timestamptz
  );

  v_prune := v_incoming_proj_ts > v_existing_proj_ts;

  select coalesce(jsonb_agg(e), '[]'::jsonb)
  into v_filtered
  from jsonb_array_elements(v_projects) as e
  where e->>'id' is distinct from p_project_id;

  v_new_projects := coalesce(v_filtered, '[]'::jsonb) || jsonb_build_array(p_project);
  v_nodes := jsonb_set(
    v_nodes,
    array[p_project_id],
    public.plannode_merge_nodes_jsonb_lww(
      coalesce(v_nodes->p_project_id, '[]'::jsonb),
      coalesce(p_nodes, '[]'::jsonb),
      v_prune
    ),
    true
  );

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

notify pgrst, 'reload schema';
