-- 조건부 워크스페이스 번들 갱신(동시 편집 완화용)
-- 서버 updated_at이 클라이언트가 기대하는 값과 같을 때만 전체 JSON을 덮어씀.
-- 불일치 시 ok=false, reason=conflict, server_updated_at 반환 → 클라이언트가 병합 후 재시도.
-- Supabase SQL Editor에서 실행 후 NOTIFY 권장.

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
  new_ts timestamptz := clock_timestamp();
  uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;

  select w.updated_at into cur_ts
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

    return jsonb_build_object('ok', true, 'server_updated_at', new_ts);
  else
    if p_expected_server_updated_at is not null then
      return jsonb_build_object('ok', false, 'reason', 'conflict', 'server_updated_at', null);
    end if;

    insert into public.plannode_workspace (user_id, projects_json, nodes_by_project_json, updated_at)
    values (uid, p_projects_json, p_nodes_by_project_json, new_ts);

    return jsonb_build_object('ok', true, 'server_updated_at', new_ts);
  end if;
end;
$$;

comment on function public.plannode_workspace_upsert_workspace_bundle(jsonb, jsonb, timestamptz) is
  '내 plannode_workspace 행만 조건부 갱신(기대 updated_at 일치 시). 동시 upsert 완화.';

grant execute on function public.plannode_workspace_upsert_workspace_bundle(jsonb, jsonb, timestamptz) to authenticated;

notify pgrst, 'reload schema';
