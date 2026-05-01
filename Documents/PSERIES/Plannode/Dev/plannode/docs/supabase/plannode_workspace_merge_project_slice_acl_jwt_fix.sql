-- merge_project_slice ACL 검증을 SELECT 정책과 동일 축으로 맞춤
-- revision·락·5번째 인자(p_base_revision)까지 한 번에 쓰려면 docs/supabase/plannode_project_collab_revision_lock.sql 실행(이 파일의 merge 정의를 대체함).
-- 증상: POST .../rpc/plannode_workspace_merge_project_slice 403 · 메시지 forbidden
-- 원인: auth.jwt() ->> 'email' 이 비어 있거나(일부 세션) auth.users 이메일과만 일치하는 경우,
--       기존 RPC는 JWT 문자열만 비교해 ACL 행을 못 찾음 → raise forbidden
-- 조치: plannode_acl_email_belongs_to_session(a.email) OR 분기 추가 (기존 plannode_project_acl.sql §164~169 와 정합)
-- Supabase SQL Editor에서 실행 후 NOTIFY.

create or replace function public.plannode_workspace_merge_project_slice(
  p_workspace_user_id uuid,
  p_project_id text,
  p_project jsonb,
  p_nodes jsonb
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

  return v_ts;
end;
$$;

revoke all on function public.plannode_workspace_merge_project_slice(uuid, text, jsonb, jsonb) from public;
grant execute on function public.plannode_workspace_merge_project_slice(uuid, text, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
