-- 2026-06-04: 삭제·미사용 프로젝트의 structure_ops / collab_meta 정리
--
-- 목적:
--   - 앱에서 더 이상 쓰지 않는 project_id에 쌓인 op·meta 행 제거
--   - 폴링·storage 노이즈 완화 (노드 본문은 plannode_workspace 번들 축 A가 정본)
--
-- 주의:
--   - 아래 project_id 목록을 실행 전 반드시 확인·수정할 것.
--   - DELETE는 되돌리기 어렵다. PRODUCTION에서 Stephen 확인 후 실행.
--
-- 유지 대상(2026-06-04 기준 — 삭제하지 말 것):
--   crazyshot-re_v1.45, crazyshot-re_v1.46, outline-mpduajyw-9ezawv
--
-- 선행: 20260604_final_collab_functions_fix.sql (선택, RPC 정합)

-- ── 1) 삭제 대상 project_id (필요 시 편집) ──
create temp table if not exists _plannode_deleted_project_ids (project_id text primary key);

truncate _plannode_deleted_project_ids;

insert into _plannode_deleted_project_ids (project_id) values
  ('crazyshot-re_v1.44'),
  ('crazyshot-re_v1.42'),
  ('proj_9ovtw43xt'),
  ('proj_zxilnobt6')
on conflict (project_id) do nothing;

-- ── 2) 삭제 전 집계 (확인용) ──
select 'structure_ops' as tbl, d.project_id, count(*) as row_count
from public.plannode_project_structure_ops o
join _plannode_deleted_project_ids d on d.project_id = o.project_id
group by d.project_id
union all
select 'collab_meta' as tbl, d.project_id, count(*) as row_count
from public.plannode_project_collab_meta m
join _plannode_deleted_project_ids d on d.project_id = m.project_id
group by d.project_id
order by tbl, project_id;

-- ── 3) DELETE (위 집계 확인 후 이 블록만 실행해도 됨) ──
delete from public.plannode_project_structure_ops o
using _plannode_deleted_project_ids d
where o.project_id = d.project_id;

delete from public.plannode_project_collab_meta m
using _plannode_deleted_project_ids d
where m.project_id = d.project_id;

-- ── 4) 삭제 후 잔여 확인 (0건 기대) ──
select
  (select count(*) from public.plannode_project_structure_ops o
   join _plannode_deleted_project_ids d on d.project_id = o.project_id) as ops_remaining,
  (select count(*) from public.plannode_project_collab_meta m
   join _plannode_deleted_project_ids d on d.project_id = m.project_id) as meta_remaining;

drop table if exists _plannode_deleted_project_ids;
