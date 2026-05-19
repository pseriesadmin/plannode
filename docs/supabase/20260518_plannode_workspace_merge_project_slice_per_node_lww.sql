-- 공유 슬라이스 merge: nodes_by_project_json[project_id] 를 p_nodes 로 통째 교체(jsonb_set)하지 않고
-- 노드 id 단위로 updated_at LWW 병합(필드 단위 머지 없음 — 승자 행 전체 교체).
-- 클라이언트 mergeNodeListsForCloud(..., false) 와 같은 축: 동일 id는 incoming.updated_at > existing 일 때만 incoming 행,
-- incoming 에만 있는 id는 추가, existing 에만 있는 id는 유지(삭제 전파는 별 톰스톤·풀 경로 한계와 동일).
--
-- 선행: plannode_workspace.sql, plannode_project_acl.sql, plannode_project_collab_revision_lock.sql
--       (5인자 plannode_workspace_merge_project_slice + collab_meta 가 이미 배포된 상태에서 이 파일만 추가 실행)
-- Supabase SQL Editor에서 실행 후 NOTIFY.

create or replace function public.plannode_merge_nodes_jsonb_lww(
  p_existing_nodes jsonb,
  p_incoming_nodes jsonb
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

comment on function public.plannode_merge_nodes_jsonb_lww(jsonb, jsonb) is
  'plannode_workspace_merge_project_slice: 기존 노드 배열과 p_nodes 를 id 단위 updated_at LWW 로 합침(필드 단위 머지 없음).';

revoke all on function public.plannode_merge_nodes_jsonb_lww(jsonb, jsonb) from public;
grant execute on function public.plannode_merge_nodes_jsonb_lww(jsonb, jsonb) to authenticated;

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
  v_nodes := jsonb_set(
    v_nodes,
    array[p_project_id],
    public.plannode_merge_nodes_jsonb_lww(
      coalesce(v_nodes->p_project_id, '[]'::jsonb),
      coalesce(p_nodes, '[]'::jsonb)
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

revoke all on function public.plannode_workspace_merge_project_slice(uuid, text, jsonb, jsonb, bigint) from public;
grant execute on function public.plannode_workspace_merge_project_slice(uuid, text, jsonb, jsonb, bigint) to authenticated;

notify pgrst, 'reload schema';
