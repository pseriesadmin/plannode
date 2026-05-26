-- 공유 슬라이스 merge: 동시 **서로 다른** 노드 추가 시 prune 로 인한 상대 노드 삭제 방지
-- 증상: A가 먼저 저장 → B가 저장 → A 카드가 서버·양쪽 캔버스에서 사라짐
-- 원인: incoming p_project.updated_at > existing 이면 p_nodes 에 없는 id 를 DB에서 제거(v_prune)
--        B 클라이언트 payload에 A id 가 빠진 채 push 되면 A 노드가 서버에서 삭제됨
--
-- 정책 변경: merge RPC 에서 **id 단위 LWW 병합만** — missing id 자동 prune 끔.
-- 삭제·이동 반영: 클라이언트 registerRecentlyDeleted + pull(mergeNodeListsForCloudByProjectMeta) + 명시적 persist.
-- 선행: 20260519_plannode_merge_nodes_lww_prune_on_newer_project.sql
-- Supabase SQL Editor 실행 후 NOTIFY.

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
      false
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

comment on function public.plannode_workspace_merge_project_slice(uuid, text, jsonb, jsonb, bigint) is
  '공유 슬라이스 merge — id 단위 LWW만(p_prune_missing=false). 동시 서로 다른 노드 추가 보존.';

notify pgrst, 'reload schema';
