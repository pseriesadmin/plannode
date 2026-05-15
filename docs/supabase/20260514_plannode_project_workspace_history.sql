-- 공유 프로젝트 워크스페이스 히스토리(append-only)
-- 선행: docs/supabase/plannode_project_acl.sql (plannode_project_acl · 이메일·JWT 정합)
-- TASK: `.cursor/harness/TASK.md` §6.2 · 플랜 `히스토리_모달_저장_로직_b2f0c9fb.plan.md` §6
-- GP-4: 기존 SQL 파일 본문 수정 금지 — 본 신규 파일로만 적용.
--
-- 목적: plannode_workspace JSON의 historyEntries와 별도로, project_id 단위로
--       ACL에 속한 계정이 동일 서버 타임라인을 SELECT할 수 있는 저장소(1단계).
-- 정책: INSERT/SELECT만 (UPDATE·DELETE RLS 없음 = append-only).

-- ═══════════════════════════════════════════════════════════════════════════
-- public.plannode_project_workspace_history
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.plannode_project_workspace_history (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  occurred_at timestamptz not null default now(),
  reason text,
  source text not null default 'client',
  actor_user_id uuid,
  actor_email text,
  payload jsonb not null default '{}'::jsonb
);

comment on table public.plannode_project_workspace_history is
  '프로젝트별 워크스페이스 스냅/이벤트 append-only 로그. project_id는 plannode_project_acl과 동일 text 축.';

comment on column public.plannode_project_workspace_history.payload is
  '클라이언트 HistoryEntry 등 JSON. 용량 상한은 앱·RPC에서 가드(권장 ≤ ~1.5MB/행).';

comment on column public.plannode_project_workspace_history.source is
  '예: client | persist | pre_pull | merge | rpc — 앱·RPC에서 합의.';

create index if not exists idx_plannode_pwh_project_occurred
  on public.plannode_project_workspace_history (project_id, occurred_at desc);

create index if not exists idx_plannode_pwh_actor
  on public.plannode_project_workspace_history (actor_user_id, occurred_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- BEFORE INSERT: 항상 현재 세션 사용자로 액터 고정(스푸핑 방지)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.plannode_project_workspace_history_bi_set_actor()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'plannode_pwh_bi_no_session' using errcode = '42501';
  end if;
  new.actor_user_id := auth.uid();
  if new.actor_email is null or length(trim(new.actor_email)) = 0 then
    select u.email::text into new.actor_email
    from auth.users u
    where u.id = auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists plannode_project_workspace_history_bi_actor
  on public.plannode_project_workspace_history;
create trigger plannode_project_workspace_history_bi_actor
  before insert on public.plannode_project_workspace_history
  for each row
  execute function public.plannode_project_workspace_history_bi_set_actor();

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS: ACL 팀 가시성(plannode_project_acl_select_team_visibility 와 동일 축)
--      — 본인 이메일이 해당 project_id 행에 있으면 그 프로젝트의 히스토리 전체 읽기.
-- INSERT: 동일 조건 + actor는 트리거로 auth.uid() 고정.
-- UPDATE/DELETE: 정책 없음 → authenticated 에게 거부(append-only).
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.plannode_project_workspace_history enable row level security;

drop policy if exists "plannode_pwh_select_team" on public.plannode_project_workspace_history;
drop policy if exists "plannode_pwh_insert_team" on public.plannode_project_workspace_history;

create policy "plannode_pwh_select_team"
  on public.plannode_project_workspace_history
  for select
  to authenticated
  using (
    exists (
      select 1 from public.plannode_platform_master m
      where m.id = 1 and m.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.plannode_project_acl me
      where me.project_id = plannode_project_workspace_history.project_id
        and (
          lower(trim(me.email)) = lower(trim(coalesce(nullif(trim(auth.jwt() ->> 'email'), ''), '')))
          or public.plannode_acl_email_belongs_to_session(me.email)
        )
    )
    or public.plannode_acl_current_user_is_owner(plannode_project_workspace_history.project_id)
  );

create policy "plannode_pwh_insert_team"
  on public.plannode_project_workspace_history
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.plannode_platform_master m
      where m.id = 1 and m.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.plannode_project_acl me
      where me.project_id = plannode_project_workspace_history.project_id
        and (
          lower(trim(me.email)) = lower(trim(coalesce(nullif(trim(auth.jwt() ->> 'email'), ''), '')))
          or public.plannode_acl_email_belongs_to_session(me.email)
        )
    )
    or public.plannode_acl_current_user_is_owner(plannode_project_workspace_history.project_id)
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 선택: SECURITY DEFINER append RPC (클라이언트는 이 RPC만 호출하도록 이행 가능)
-- payload 길이 소프트 가드(문자열 길이 기준, UTF-8 바이트는 근사).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.plannode_append_project_workspace_history(
  p_project_id text,
  p_reason text,
  p_source text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_len int;
begin
  if p_project_id is null or length(trim(p_project_id)) = 0 then
    raise exception 'invalid_project_id' using errcode = '22023';
  end if;

  if not (
    exists (
      select 1 from public.plannode_platform_master m
      where m.id = 1 and m.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.plannode_project_acl me
      where me.project_id = p_project_id
        and (
          lower(trim(me.email)) = lower(trim(coalesce(nullif(trim(auth.jwt() ->> 'email'), ''), '')))
          or public.plannode_acl_email_belongs_to_session(me.email)
        )
    )
    or public.plannode_acl_current_user_is_owner(p_project_id)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_len := length(coalesce(p_payload::text, '{}'));
  if v_len > 1800000 then
    raise exception 'payload_too_large' using errcode = '22023';
  end if;

  insert into public.plannode_project_workspace_history (
    project_id,
    reason,
    source,
    payload
  )
  values (
    trim(p_project_id),
    nullif(trim(p_reason), ''),
    coalesce(nullif(trim(coalesce(p_source, '')), ''), 'client'),
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.plannode_append_project_workspace_history(text, text, text, jsonb) from public;
grant execute on function public.plannode_append_project_workspace_history(text, text, text, jsonb) to authenticated;

grant select, insert on public.plannode_project_workspace_history to authenticated;

notify pgrst, 'reload schema';
