# [ARCHIVED] Realtime node_rows · redesign 초안

**상태:** 폐기(아카이브) · **갱신:** 2026-06-04  
**이유:** 협업·노드 동기화 **정본**은 `.cursor/rules/plannode-architecture.mdc` **§10** (워크스페이스 번들 · structure_ops · revision · Presence). `plannode_node_rows` + `subscribeToNodeRowChanges` 경로는 **미이행** — `src/`에 구독 코드 없음.

**대체 참조**

| 주제 | 문서 |
|------|------|
| 협업·pull·ops·모달 | `plannode-architecture.mdc` §10 · §10.10~§10.11 |
| SQL·RPC | `docs/supabase/20260604_final_collab_functions_fix.sql` 등 |
| 하네스 이력 | `.cursor/harness/GSD_LOG.md` · `TASK.md` (CSR 등) |

**로드맵:** [plannode_integrated_milestone_v3.md](../plannode_integrated_milestone_v3.md) — M5 협업은 §10 정본 유지, 본 아카이브를 NOW에 넣지 않음.

*구 `plannode_realtime_sync_redesign_v2..md` · `realtime_node_row_구현_*.plan.md` 통합 보완 초안 — 실행 문서로 사용 금지.*
