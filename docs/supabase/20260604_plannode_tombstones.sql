-- Phase 2: node tombstone 소프트 삭제 테이블
-- 선행: 20260604_plannode_op_log_complete_bootstrap.sql

create table if not exists public.plannode_node_tombstones (
  workspace_user_id uuid not null references auth.users(id) on delete cascade,
  project_id        text not null,
  node_id           text not null,
  deleted_at        timestamptz not null default now(),
  deleted_by        uuid references auth.users(id) on delete set null,
  op_seq            bigint not null default 0,
  primary key (workspace_user_id, project_id, node_id)
);

comment on table public.plannode_node_tombstones is
  'Phase 2: delete_node op 소프트 삭제 레코드. 30일 후 하드 삭제.';

alter table public.plannode_node_tombstones enable row level security;

-- RLS: owner 및 ACL member select
create policy "tombstones_select_acl" on public.plannode_node_tombstones
  for select using (
    workspace_user_id = auth.uid()
    or exists (
      select 1
      from public.plannode_project_acl a
      where a.project_id = plannode_node_tombstones.project_id
        and a.workspace_source_user_id is not distinct from plannode_node_tombstones.workspace_user_id
        and (
          lower(trim(a.email)) = lower(trim(coalesce(nullif(trim(auth.jwt() ->> 'email'), ''), '')))
          or public.plannode_acl_email_belongs_to_session(a.email)
        )
    )
  );

-- insert/delete: security definer RPC에서만 허용 (직접 DML 차단)

-- tombstone fetch RPC: member가 최근 삭제 목록 확인용
create or replace function public.plannode_fetch_tombstones(
  p_workspace_user_id uuid,
  p_project_id text,
  p_since timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_workspace_user_id is null or p_project_id is null then
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

  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'node_id', t.node_id,
        'deleted_at', t.deleted_at,
        'op_seq', t.op_seq
      )
    ), '[]'::jsonb)
    from public.plannode_node_tombstones t
    where t.workspace_user_id = p_workspace_user_id
      and t.project_id = p_project_id
      and (p_since is null or t.deleted_at >= p_since)
  );
end;
$$;

notify pgrst, 'reload schema';
