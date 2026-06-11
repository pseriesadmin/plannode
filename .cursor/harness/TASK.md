단축 경로: step2·GATE A 생략

# TASK.md — Plannode 하네스

**현재 아젠다:** EPIC **COLLAB-SYNC-RISK-FIX (CSR)** — COLLAB-PERF·Phase-4(merge_atomic) 검수 **4건 리스크** 수정 · 공유 프로젝트 동기화 **GATE C 재검증**

**선행 플랜:** [Collab Sync Risk Fix](../../.cursor/plans/collab_sync_risk_fix_8cc88c37.plan.md) · plan-output 생략(경량 경로)

**문서 정본:** `.cursor/rules/plannode-architecture.mdc` **§10** (동기·협업) · 성능 측정 이력 **§10.12** · `GSD_LOG.md`

**SQL (GP-4 · Stephen):** [`docs/supabase/20260531_plannode_collab_merge_atomic.sql`](../../docs/supabase/20260531_plannode_collab_merge_atomic.sql) — **기존 SQL 파일 수정 금지** · P0-3 배포 전제

**보호 계약 (변경 금지):** 파일럿 SSoT · `#V-TREE`/`#CV`/`#EG` DOM id · `pilotBridge` hydrate defer · `MODAL_EDIT_HYDRATE_DEFER` · GP-13 · 전역 CSS · `+page.svelte` 무관 수정 · OT/CRDT · 번들 Realtime 스트리밍 (GP-7)

**GATE B (CSR):** ☑ Stephen 승인 (2026-05-31) — `@harness-executor` NOW-CSR-P0-AB~

**NOW 실행 순:** P0 ☑ → FIX-8~12 ☑ → GATE-C ☑ → **GATE-D ☑** → **@qa ☑** → **GATE E** ← 현재

---

## NOW

**현재 NOW:** *(없음 — EPIC CSR 코딩·GATE D 완료)* → **GATE E** (git commit · Stephen)

### CSR — 설계 요지 (플랜 반영)

| ID | 리스크 | 요지 |
|----|--------|------|
| **P0-1** | delta-only payload | `useDeltaOnly` 시 atomic `p_nodes: null` → SQL coalesce → **노드 delta 0건** · legacy는 `p_node_deltas: pushNodes` 정상 |
| **P0-2** | `_mergeAtomicUnsupported` 오판 | `startsWith('PGRST')`가 권한·RLS까지 포함 → 세션 **영구 legacy downgrade** |
| **P1** | revision 캐시 | atomic `res.ok` 후 `setCachedCollabRevision` 없음 → 불필요 pull·stale 재시도 |
| **P2** | prod debug | `repairOwnedProjectsAclWorkspaceSources` `console.debug` · GP-12 |
| **P0-3** | SQL 미배포 | atomic 404 + legacy 4-RPC · Phase-4 이득 미실현 → **👤 Stephen** |

**하지 않을 것 (CSR · GP-12):** OT/CRDT · saveMs <1s 재개 · overview §6.12 문서 대규모 갱신(Stephen 승인 시만) · 신규 `lib/collab/*`

**GATE C 수용 기준 (플랜 §3·§5):** 2프로필 §6.8 #1·#4 · 30s 내 상대 캔버스(모달 defer 제외) · 400/`revision_stale` 폭주 없음 · idle 60s RPC **<50/분** · `fetch_project_slice` **<5/분** · **#8~11 트리·교차 layout 회귀 Pass**

### GATE-C 보완·회귀 요지 (Stephen 2026-05-31)

| # | 증상 | 정상 기대 | 의심 경로 |
|---|------|-----------|-----------|
| **8** | **뎁스 7** 형제 노드 **연속 추가** 시 카드 **겹침** | 동일 부모 형제가 `bld()`/`gp()` 기준 **겹치지 않음** | `plannodePilot.js` `bld()` 형제 `num` sort · `clearSiblingManualLayout` · mixed mx/my · CSP-L-5 잔여 |
| **9** | **B** add → B 정상 · **A** 형제 **맨 앞/엉뚱한 좌표**(❌) | **맨 뒤 append** · A도 **bld 자동배치** · B 픽셀 mx/my **미전파** | `sendAddNodeStructureOp` · `layout_auto` · `applyRemoteAddNodeFromStructureOp` · `insertFlatAfterLastSibling` · `replayStructureOpsOnNodes` |
| **9b** | 겹침 해소 후 **위치만** 틀림 — **add_node 디테일 부족** | op=`layout_auto`+메타만 · 수신 **mx/my=null** · 형제 subtree 뒤 삽입 | 위와 동일(2026-05-31 FIX-9B) |
| **10** | **우측분포** 자식 간선 출발점이 **펼침/접힘 아이콘 상단** 부근(❌) | **노드카드 중앙** 에서 출발 | `drawEdges` · `nodeCenterY` · `#EG` |
| **11** | **A 하위 · B 우측** · 형제 연속 생성 시 B **상단 쏠림** | 계정별 `bld`/`bldTopDown` · mx/my 혼재 없음 | FIX-11 · §FIX-11 |
| **12** | **우측분포** 형제 · 배지 많을 때 **겹침/gap 불균** | **36px gap** · DOM 실측 2pass · 겹침 없음 | FIX-12R · `reflowRightLayoutAfterDomMeasure` |

### FIX-12 — 우측분포 형제 나열 (2026-05-31)

**하위 vs 우측 (레이아웃 특성 — FIX-12R 검증):**

| | **하위분포** | **우측분포** |
|---|-------------|-------------|
| 형제 배치 | **가로(col)** 분기 · 동일 depth(row) | **세로(row)** 적층 · 동일 col |
| 배지→카드 높이 증가 | 형제 **옆** 열 — **Y 겹침 없음** | 형제 **아래** 노드 — **reserved 높이 < 실측**이면 **겹침** |
| FIX-12 1pass만 | estimate로도 col 간격 `layoutColW()` 고정 | estimate만으면 `.nm-clamp`·설명 wrap·제목 2행 등 **실측 > 추정** 위험 |

**FIX-12 1pass 한계(Stephen 지적 ☑):** `estimateNodeCardHeightPx`만으로 fractional row 누적 → 배지 다수 형제에서 **겹침·gap 불균** 가능.

**FIX-12R (2pass · 우측 전용):** ① estimate `bld` → DOM 생성 ② `reflowRightLayoutAfterDomMeasure()` — `nodeHeightForRightLayout`(`.nd` **offsetHeight** 우선)로 lm 재계산 · `.nw` reposition · **drawEdges 전**.

**수정:** `rightLayoutRowAdvanceForNode` · `nodeHeightForRightLayout` · `reflowRightLayoutAfterDomMeasure` · `nodeBottomY`(우측 실측).


### FIX-11 근본분석 — 교차 보기모드(우측↔하위) 형제 정렬 불균일

**증상 재진술:** A=하위분포에서 형제 2~3개 추가 시 균일 간격 ✓ · B=우측분포에서는 형제가 **열(row) 피치 없이 상단에 붙고** 간선 출발점도 **카드 중앙이 아닌 상단/아이콘 쪽**으로 쏠림.

**1) 두 축이 섞여 있음 (설계)**

| 축 | 저장 위치 | 협업 동기 |
|----|-----------|-----------|
| **보기모드** `right` \| `topdown` | `localStorage` `plannode.nodeMapLayout.v1` **프로젝트 id별 · 계정별** | **동기 안 됨** (의도: UI 선호) |
| **노드 좌표** `mx`/`my` | `plannode_nodes_v3_*` · 워크스페이스 번들 · structure op | **동기 됨** |

→ A가 하위분포로 본 **픽셀 좌표**가 번들/slice에 남으면, B는 우측분포인데도 `gp(n)`이 **A 기준 픽셀**을 쓸 수 있음 (`mx/my` 있으면 `bld()` **무시**).

**2) 우측분포만 더 티어지는 이유**

- **하위분포:** `row`≈깊이(0,1,2…) · 형제는 `col`만 분기 → `mx/my` 오염이 있어도 Y가 깊이에 묶여 **덜 눈에 띔**.
- **우측분포:** 형제는 **fractional row 픽셀 누적**(FIX-12) · `mx/my` 혼재 시 여전히 `gp()` 왜곡 → FIX-11

**3) 오염 경로 (코드)**

| # | 경로 | 메커니즘 |
|---|------|----------|
| A | `add_node` **FIX-9B 이전** | B의 `gp()` 픽셀이 op에 실림 → A/B 좌표계 불일치 |
| B | **`preserveManualCoordsOnCloudMergeWinner`** | 원격 `mx/my` **명시 null**인데도 local non-null **유지** → layout_auto add 후 pull이 옛 좌표 복원 |
| C | **`mergeStoreNodesIntoPilotBeforePersist` · hydrate** | `sn.mx ?? prev.mx` — **`null`이 `??`로 local 픽셀 승격** (FIX-11 핵심 버그) |
| D | **`update_node` / 번들 LWW** | A 하위분포에서 materialize·저장된 `mx/my`가 B에 그대로 승리 |
| E | **`clearSiblingManualLayout`만** | add 직후 정리해도 **이후 pull·merge·모달 저장 merge**가 (B)(C)로 **되돌림** |

**4) FIX-11 수용 (구현 · GATE C #11)**

| 항목 | 내용 |
|------|------|
| **F11-1** | `preserveManualCoordsOnCloudMergeWinner` — remote **`mx===null && my===null`** → local 픽셀 **미보존** (`projects.ts` · CSP-L-2 선행) |
| **F11-2** | `mergePilotCoordFromStore` — store `null` ≠ `??` fallback (`plannodePilot.js` merge·hydrate) |
| **F11-3** | `reconcileMixedSiblingAutoLayout` — 동일 부모 **manual+auto 혼재** 시 subtree `mx/my` null · hydrate·원격 add 후 |
| **F11-4 (잔여·BACKLOG)** | A측 **전부 manual** 픽셀(하위분포 찍힌 값)이 B 우측에 그대로 올 때 → CSP-L-4 `node_map_layout` 또는 **공유 시 move_node 외 mx/my 번들 금지** — FIX-11 범위 밖 |

**5) GATE C #11 수동 시나리오**

1. A **하위분포** · B **우측분포** · 동일 공유 프로젝트  
2. B가 동일 부모 아래 형제 **3개** 연속 추가 → B **row 피치 균일** · 간선 **카드 세로 중앙**  
3. A 화면에서도 **3개 맨 뒤·겹침 없음** (하위분포 col 균일)  
4. A가 형제 2개 추가 → B 우측에서 **상단 쏠림 없음**  
5. Console `window.__pnLayoutAudit()` → 해당 부모 **`mixedParentGroups: 0`** (혼재 없음)

### NOW-CSR-GATE-C 실행 체크리스트 (👤 Stephen · 공유 프로젝트 2계정)

**사전:** `npm run build` ✓ · P0-3 SQL ☑ · 동일 `projectId` 소유자(A)+멤버(B)

**CSR 동기 (1~7):**

| # | 시나리오 | Pass |
|---|----------|------|
| 1 | 멤버 저장 → Network **`merge_atomic` 1회** · lock RPC 0회 | ☑ |
| 2 | (선택) slice fetch 차단 시 owner JSON에 멤버 노드 id | ☑ |
| 3 | 양쪽 동시 저장 → toast **≤1** · 데이터 손실 없음 | ☑ |
| 4 | A 모달 열림 · B 추가 → A 모달 중 B 카드 **안 보임** · A 저장 후 **보임** | ☑ |
| 5 | A 드래그 중 B 변경 → A pointerup 후 1회 반영 · 깜빡임 없음 | ☑ |
| 6 | `__pnDiagStart()` → 60s idle → `__pnDiagStop()` · RPC/분 **<50** · slice/분 **<5** | ☑ |
| 7 | 프로젝트 전환 · PRD↔트리 · 루트 `{id}-r` 회귀 | ☑ |

**트리 레이아웃·동기 보완 (8~10 · GP-13):**

| # | 시나리오 | Pass |
|---|----------|------|
| 8 | 뎁스 **7** 동일 부모에서 형제 **2건+** 추가 · A·B 모두 **겹침 없음** | ☑ |
| 9 | B 형제 추가 → B·A **맨 뒤** · A **bld 열**에 정렬(엉뚱한 좌표 없음) | ☑ |
| 10 | **우측분포** · 부모→자식 간선 출발 **카드 세로 중앙** · 펼침 아이콘 **상단 쏠림 없음** | ☑ |
| 11 | **A 하위 · B 우측** (교차 보기) · 형제 3+ **균일 배치** · `__pnLayoutAudit` **mixed 0** | ☑ |
| 12 | **우측분포** · 형제 3+ · **배지 4~8개** 섞어 추가 · **겹침 없음** · gap·간선 균일 | ☑ |

**GATE C Pass:** ☑ Stephen (2026-05-31) · **1~12** 전항

---

- [x] **NOW-CSR-P0-AB** — **P0-1:** `useDeltaOnly`여도 `p_nodes: pushNodes` · **P0-2:** `isAtomicMissing` → `isCollabRevisionRpcMissing` only | `sync.ts` | GSD+ | PRD: M5 F5-1 · M5 F5-2 · M3 F3-2 · arch §10 | build ✓ | GATE C:☑ Stephen | 2026-05-31
- [x] **NOW-CSR-P1P2-BUILD** — **P1:** `setCachedCollabRevision` on atomic ok · **P2:** ACL repair `console.debug` DEV 가드 · build ✓ | `sync.ts` · `projectAcl.ts` | GSD+ | PRD: M5 F5-2 · M3 F3-2 | GATE C:☑ Stephen | 2026-05-31
- [x] **NOW-CSR-P0-3** — Supabase `merge_atomic` SQL · MCP migration + pg_proc 확인 · Network `merge_atomic` 1회·legacy lock 0회 | Supabase | PRD: M5 F5-1 · Phase-1 | GATE C-배포:☑ Stephen | 2026-05-31
- [x] **NOW-CSR-GC-FIX-8** — `rightLayoutRowSpanForNode` Math.ceil · `compareSiblingNodesForLayout` · 원격 add `clearSiblingManualLayout` | `plannodePilot.js` | GSD+ | PRD: M1 F1-2 · M5 F5-2 | build ✓ | GATE C:👤 Stephen · #8~10 | 2026-05-31
- [x] **NOW-CSR-GC-FIX-9B** — `add_node` **`layout_auto`** · 송신 gp() 픽셀 제거 · 수신 mx/my=null · `insertFlatAfterLastSibling` · replay null | `plannodePilot.js` · `projectStructureOps.ts` · `projects.ts` | GSD+ | PRD: M5 F5-2 · arch §10.10 | build ✓ · vitest | GATE C:👤 Stephen · #9·#9b | 2026-05-31
- [x] **NOW-CSR-GC-FIX-11** — 교차 보기모드 · `preserveManualCoords` null · `mergePilotCoordFromStore` · `reconcileMixedSiblingAutoLayout` | `projects.ts` · `plannodePilot.js` | GSD+ | PRD: M1 F1-2 · M5 F5-2 · CSP-L-2 | build ✓ · vitest | GATE C:👤 Stephen · **#11** | 2026-05-31
- [x] **NOW-CSR-GC-FIX-12** — 우측 fractional row · **FIX-12R** DOM 2pass 실측 reflow | `plannodePilot.js` | GSD+ | PRD: M1 F1-2 · GP-13 | build ✓ | GATE C:☑ Stephen · **#12** | 2026-05-31
- [x] **NOW-CSR-GATE-C** — 체크리스트 **1~12** 수동 Pass | DevTools · 2프로필 | GSD+ | PRD: M5 F5-2 | GATE C:☑ Stephen | 2026-05-31
- [x] **NOW-CSR-GATE-D** — EPIC CSR 전체 검토 · build/vitest · @qa | GSD+ | PRD: M5 · arch §10 | GATE D:☑ Stephen | @qa CONDITIONAL | 2026-05-31

**ID 동기 (플랜 ↔ TASK):**

| 순서 | plan todo id | TASK |
|------|--------------|------|
| 1 | p0-1-delta-payload · p0-2-atomic-missing | NOW-CSR-P0-AB ☑ |
| 2 | p1-revision-cache · p2-dev-log | NOW-CSR-P1P2-BUILD ☑ |
| 3 | p0-3-sql-deploy | NOW-CSR-P0-3 ☑ |
| 4 | gate-c-verify · FIX-8~12 | NOW-CSR-GATE-C ☑ |
| 5 | gate-d · @qa | NOW-CSR-GATE-D ☑ · **GATE E** ← 현재 |

**Stephen · GP-1:** GATE E ☑ → git commit (**CSR+모달로딩** 권장 · zoom-trace·문서 diff 제외)

---

## BACKLOG (CSR 밖 · GP-12)

### EPIC COLLAB-SYNC-LAYOUT (CSP-LAYOUT) — 일시 중단 · CSR 후 재개

- **NOW-CSP-L-1a** — `reset_manual_layout` op 타입 · parse · replay | `projectStructureOps.ts` · `projects.ts`
- **NOW-CSP-L-1b** — `#BAR` → op Broadcast · remote 수신 mx/my null
- **NOW-CSP-L-2** — `preserveManualCoordsOnCloudMergeWinner` remote null clear
- **NOW-CSP-L-3** — `applyRemoteMoveNodeFromStructureOp` sibling clear
- **NOW-CSP-L-4a** · **NOW-CSP-L-4b** — `node_map_layout` 번들 동기
- **NOW-GATE-D-CSP-L** — 2브라우저 layout audit
- 플랜: [노드트리 정렬 동기화](../../.cursor/plans/노드트리_정렬_동기화_0eab4307.plan.md)

### 기타

- **NOW-GATE-C-CSP** — CSP 1차 2브라우저 mx/my (`__pnGateCsp`)
- **overview §6.12 Phase-4 hotfix** 3~5줄 — Stephen 승인 시만
- **relink / copy-relink** · **col/row 레이아웃** · **render() 증분화** · **E14 git commit** — 👤 Stephen (GP-1)

---

## DONE (EPIC COLLAB-SYNC-RISK-FIX · CSR)

- [x] **NOW-CSR-P0-AB** — delta `p_nodes` + `isAtomicMissing` 좁히기 | `sync.ts` | GSD+ | PRD: M5 F5-1 · M5 F5-2 · M3 F3-2 | GATE C:☑ Stephen | 2026-05-31
- [x] **NOW-CSR-P1P2-BUILD** — revision 캐시 + ACL repair DEV 가드 | `sync.ts` · `projectAcl.ts` | GSD+ | PRD: M5 F5-2 · M3 F3-2 | build ✓ | GATE C:☑ Stephen | 2026-05-31
- [x] **NOW-CSR-P0-3** — `merge_atomic` SQL 배포 | Supabase | PRD: M5 F5-1 | GATE C-배포:☑ Stephen | 2026-05-31
- [x] **NOW-CSR-GC-FIX-8~10** — 형제 row ceil · append 정렬 · 간선 Y 실측 | `plannodePilot.js` | GSD+ | build ✓ | 2026-05-31
- [x] **NOW-CSR-GC-FIX-9B** — add_node layout_auto · 원격 좌표 미전파 | `plannodePilot.js` · `projectStructureOps.ts` · `projects.ts` | GSD+ | GATE C:👤 Stephen | 2026-05-31
- [x] **NOW-CSR-GC-FIX-11** — 교차 보기모드 mx/my 혼재 · merge null · reconcileMixed | `projects.ts` · `plannodePilot.js` | GSD+ | GATE C:👤 Stephen · #11 | 2026-05-31
- [x] **NOW-CSR-GC-FIX-12** — 우측 bld + FIX-12R DOM reflow | `plannodePilot.js` | GSD+ | GATE C:☑ Stephen · #12 | 2026-05-31
- [x] **NOW-CSR-GATE-C** — 2프로필 체크리스트 1~12 | — | GSD+ | GATE C:☑ Stephen | 2026-05-31
- [x] **NOW-CSR-GATE-D** — build/vitest · @qa CONDITIONAL PASS | — | GSD+ | GATE D:☑ Stephen | 2026-05-31

---

## DONE (EPIC COLLAB-SYNC-LAYOUT · CSP-LAYOUT · 부분)

- [x] **NOW-CSP-L-0** — `window.__pnLayoutAudit(projectId?)` | `plannodePilot.js` | GSD | PRD: M1 F1-2 · M5 F5-2 | GATE C:❌ Stephen (진단 전용) | 2026-05-29
- [x] **NOW-CSP-L-5** — 우측분포 `bld()` 형제 `num` numeric sort | `plannodePilot.js` | GSD+ | PRD: M1 F1-2 | GATE C:👤 Stephen | 2026-05-29

---

## DONE (EPIC COLLAB-SYNC-POSITION · CSP 1차)

- [x] **NOW-P0-DEL-WS-06** — 삭제 프로젝트 고스트 일괄 복원 방어 | `projects.ts` · `sync.ts` · `projects.workspaceDeletion.test.ts` | GSD+ | PRD: M3 F3-2 · M6 | GATE C:☑ Stephen | 2026-05-29
- [x] **NOW-CSP-4** — `preserveManualCoordsOnCloudMergeWinner` | `projects.ts` | GSD+ | PRD: M3 F3-2 · M5 F5-2 | GATE C:☑ Stephen | 2026-05-29
- [x] **NOW-CSP-3** — `addChild` materialize → skeleton persist / structure op | `plannodePilot.js` | GSD+ | PRD: M1 F1-1 · M5 F5-2 | GATE C:☑ Stephen | 2026-05-29
- [x] **NOW-CSP-2** — `sDrag` pointerup materialize → move ops | `plannodePilot.js` | GSD+ | PRD: M1 F1-2 · M5 F5-2 | GATE C:☑ Stephen | 2026-05-29
- [x] **NOW-CSP-1** — `materializeDisplayCoordsForNodes` · drag `{ changedOrder, affectedParentIds }` | `plannodePilot.js` | GSD+ | PRD: M1 F1-1 · M5 F5-2 | GATE C:👤 Stephen | 2026-05-28

---

## DONE (EPIC COLLAB-PERF-2 · GATE E · ☑ 2026-05-28)

- [x] **GATE E (@qa)** — CONDITIONAL PASS · QA_REPORT.md · → git commit 👤 Stephen

## DONE (EPIC COLLAB-PERF-2 · 압축)

- [x] **NOW-GATE-D-05** · **NOW-E14-1~4** · **NOW-E13** · **NOW-E12** · **NOW-E11** · **NOW-E10** · **NOW-E9-1~2** · **NOW-GATE-D-03** · **NOW-E8-1~3** · **NOW-GATE-D-02** · **NOW-E0~E7** · **NOW-GATE-D-01** · **NOW-GATE-D-04** — 상세 [`GSD_LOG.md`](GSD_LOG.md)

## DONE (EPIC COLLAB-PERF · ☑ GATE E 2026-05-26)

> Phase A~D · PARITY · 배포 · @qa **PASS** — [`GSD_LOG.md`](GSD_LOG.md)

---

## DONE / CLOSED (압축)

EPIC COLLAB-SYNC-HARDEN · COLLAB-MODAL-SYNC · COLLAB-ARCH-TIER · [`GSD_LOG.md`](GSD_LOG.md)
