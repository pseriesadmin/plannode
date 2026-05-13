# plan-output.md — Plannode Harness Flow
# 경로: `.cursor/harness/plan-output.md`
# 생성: @promptor Step2 | 2026-05-11 KST
# 소스 아젠다: `.cursor/plans/plannode_realtime_sync_redesign_v1.md` 리뷰 → 다중 사용자 동시 작성 시 **로컬·클라우드 실시간 동기화 저장** 재설계를 하네스 작업화
# 역할: 코드·커밋 없음 — GATE A 승인 후 Step3(TASK.md) 진행

---

## 아젠다 요약

1. **플랜 리뷰:** `plannode_realtime_sync_redesign_v1.md`는 폴링·`plannode_workspace` 번들 LWW 한계(A~D)를 정리하고, **Layer 1 Realtime Broadcast**(프리뷰·비보장) / **Layer 2 `postgres_changes`**(DB 확정본·노드 행 전제) / **Layer 3 Vercel Edge(선택)**(ACL·revision 집중) 3계층으로 이원화한다.
2. **하네스 작업화 목표:** 위 플랜을 **PRD 추적 가능한 NOW 스택**으로 쪼갤 수 있게 범위·제외·단계(Step 0~4)·검증 기준을 확정한다.
3. **현행 정본 교차:** `docs/plannode_workspace_sync_overview.md`, `plannode-architecture.mdc` §5·§5.1·§10, `sync.ts`·`cloudBackgroundSync.ts`·`projectPresence.ts` — 번들 경로와 Presence는 **유지·병행 축소** 원칙.
4. **gp-4:** DB 변경은 **신규 마이그레이션 파일만**; 기존 SQL 수정 금지.
5. **플랜 §0.5·정책 1~9 (한 줄):** 노드카드·트리·**배지 파이프라인(M1 F1-3)** → 동기는 `Node` 스냅샷으로 배지 유실 금지 | **2~4** 소유·공유설정·공유계정(편집 전 메뉴 / 공유·프로젝트 삭제 불가·해제 시 접근 불가) → RLS·ACL·UI | **5** `PresenceAvatarButton`·중복편집 인지·목록 카드 **최종시각(년/월/일 시:분)** | **6** 편집 액션마다 로컬↔클라우드 상호체크·최후 확정본 | **7~8** 소유자 삭제 시 캔버스·로컬·클라우드·공유 목록 정합·공유자 저장 차단·경고·강제 로컬 제거 | **9** 우클릭·히스토리·동기 알림바·아바타 **GP-13** 보호 — 전제·추적표는 **`plannode_realtime_sync_redesign_v1.md` §0.5·§0.5.8**.

---

## P-2. 모드 판별

**기본모드**

- Supabase **Realtime·(선택) 신규 테이블·RLS·Publication** 포함 가능 — 플랜 Step 2.
- **다파일 연쇄:** `sync.ts`, `workspacePush.ts` / `cloudBackgroundSync.ts`, `projectPresence.ts`, `+page.svelte`, `projects.ts`, `pilotBridge.ts` / 파일럿 이벤트 경로 등 **4개 이상** 예상.
- **복합 목적:** 인가·저장·UI 프리뷰·오프라인/재접속 정합.
- PRD **M5·F5-2** 및 **F3-2/v2 §11** 방향과 직접 연결(노드 행 모델 시).

> 경량 단축은 **Stephen이 GATE B에서 Step 1만 1차 NOW**로 묶는 경우에 한함(플랜 §5·P-6.5와 조율).

---

## P-3. 범위 정의

**포함 (이번 설계·구현 사이클에서 진행할 수 있는 것 — 우선순위는 GATE B에서 NOW로 확정):**

- **Step 0:** 타임스탬프·LWW 비교 정규화, pull/upload 정합(플랜 §5) — 현행 `sync.ts` 등 안정화.
- **Step 1:** Layer 1 — `node-delta` **Realtime Broadcast**(채널: `plannode:project:<id>` 또는 분리 채널 `:edit`); 송신: `onPersist`/스토어 확정 직후 쓰로틀; 수신: echo 제외·안전 적용.
- **Step 2:** Layer 2 — **`plannode_node_rows`(가칭)** 신규 테이블 + RLS + Realtime publication + 클라이언트 `postgres_changes` 구독; 초기 **번들과 이중 쓰기** 허용(플랜 §5).
- **Step 3 (스코프 선택):** Layer 3 — Edge/API 경로 + revision 정책 — **GATE B에서 필수 vs 나중** 결정(플랜 §8 체크리스트).
- **Step 4 (장기):** `plannode_workspace` 역할 축소·마이그레이션 — **제품 결정 후** TASK에 편입.
- 문서·플랜 대비: `plannode_realtime_sync_redesign_v1.md` **§0.5**·§2~§7, §8 결정 항목을 TASK **현재 아젠다** 한 줄과 각 NOW **PRD:**·(필요 시) **정책 1~9** 참조 한 줄에 대응.

**제외 (이번 플랜이 명시 비목표인 것 — 포함으로 끌어들이지 말 것):**

- **CRDT/OT** 수준 문자 동시 편집 — PRD·플랜 §4 비목표.
- **Realtime만 영구 저장** — 하지 않음; 확정본은 DB(Layer 2).
- **기존 `plannode_workspace` 즉시 삭제** — 하지 않음; 단계적 이행.
- PRD **F2-4(IA/와이어)**·**F2-5·§10 LLM 4-레이어** 선제 확장 — 아젠다와 무관(별도 TASK).
- **Layer 3 전면 도입을 전제로 한 설계만** 먼저 고착 — **P-6.5**: 트래픽·남용 필요 시에만 Step 3 포함.

**트리뷰 보호 (GP-13, 필수):**

- 원격 델타 적용은 **파일럿 단일 진실**·`pilotBridge` `hydrateFromStore` / 동일 순서 계약을 깨지 않게 한다. Broadcast가 **간선·미니맵·렌더 타이밍**을 우회하는 직접 DOM 패치를 하지 않도록 설계·검증에 명시한다.
- 부가 뷰 CSS로 `#V-TREE`·`.view.active` 전환을 가리지 않는다.

**참고 파일 (읽기·구현 시):**

- `.cursor/plans/plannode_realtime_sync_redesign_v1.md` — 목표 아키텍처·DDL 초안·다이어그램·**§0.5 정책 1~9**.
- `docs/plannode_workspace_sync_overview.md` — 현행 번들·폴링 정본.
- `src/lib/supabase/sync.ts`, `workspacePush.ts`, `cloudBackgroundSync.ts` — LWW·플러시.
- `src/lib/supabase/projectPresence.ts`, `+page.svelte` — Presence·채널 계약(§5.1, `PRESENCE_PEER_MERGE`).
- `docs/supabase/plannode_project_collab_revision_lock.sql` — 공유 슬라이스·revision 기존 축.
- `.cursor/rules/plannode-architecture.mdc` — §5.1 Presence, §10 노드 CRUD·클라우드 파이프.

---

## P-3.5. v4 보기·출력 정본 동기

**P-3.5 해당 없음** — IA/와이어 뷰·`OutputIntent`·내보내기·그리드와 무관한 **클라우드·Realtime·협업 저장** 축.

---

## P-4. 파일럿 갭 연관성 체크

출처: `docs/PILOT_FUNCTIONAL_SPEC.md` §9·§10

```
관련 갭 항목:
□ [스토어·노드 계약 / 협업] — 파일럿: `nodes`·`onPersist`가 SSoT | SvelteKit: `projects.ts`·`pilotBridge`·`persistNodesFromPilot` | 리스크: 원격 델타가 스토어·파일럿 순서를 어기면 §9 빈 노드/부모 id 클래스 버그와 **중첩** 가능 → 적용 함수는 기존 persist/hydrate 경로만 사용
□ [§10 체크리스트] — 협업·클라우드 반영 직후에도 **루트 1개·트리↔탭 동기** 유지 여부를 GATE C에 명시

직접 비대상: §9 표의 transform 범위·Canvas `addNodeChild` 등 — 동기화 작업이 해당 파일만 건드리지 않으면 "회귀 시 확인" 수준
```

---

## P-4.5. PRD 연계 (plannode-prd.mdc)

| 매핑 | 설명 |
|------|------|
| **M1 · F1-3** | 노드카드·**배지 파이프라인** — 동기화는 `Node` 직렬화에 배지·메타 포함 시 손실 없이 전파; 제품 정책 **1**·플랜 **§0.5.1**. |
| **M5** | 협업 — **F5-1** 공유, **F5-2** 실시간 + LWW; 본 아젠다는 F5-2 **체감 품질**(저지연 프리뷰 + DB 확정본 일치)으로 PRD 방향을 구체화. |
| **F3-2** | Supabase — 현행 번들 + (Step 2) 노드 행 저장 **병행**; PRD **§11** `plan_nodes`·`path`·`metadata`와 컬럼 정합은 **플랜 §8·마이그레이션 설계 시** 결정(GATE B 조건). |
| **§4 비기능** | RLS, 동시 편집 한계(OT/CRDT 아님) — 플랜 §4·PRD와 정합 유지. |
| **§6 Phase** | **Phase 2** — F5-2·실시간 강화 구간; MVP 단일 번들만 고수 시 Step 1~2를 **부분 편입**으로 쪼갠다. |

**IA vs LLM:** 본 작업은 **F2-4 정보 구조(IA)·F2-5·§10 LLM**과 무관. 혼동 금지.

**편집·저장 귀속:** 노드 편집 SSoT는 **파일럿·스토어·브리지** 유지. Layer 1은 **프리뷰**, Layer 2는 **클라우드 확정본**; 최종 일치는 풀·`postgres_changes`·재접속 경로로 확보. PRD **§11 `ai_generations`** 스냅샷은 본 동기화 NOW에 포함하지 않음.

**충돌·정합:** PRD §11 **노드 정규 테이블(`plan_nodes`)** 명칭과 플랜 **`plannode_node_rows`(가칭)** 는 **실제 스키마·마이그레이션에서 단일화** — GATE B 전 `§8` 체크리스트·DB 문서에서 명명 합의 권장. 파일럿·`PILOT_FUNCTIONAL_SPEC`과 충돌 시 **브리지·스토어 순서** 우선.

---

## P-5. 핵심 위험 요소

| # | 위험 | 수준 | 대응 |
|---|------|------|------|
| 1 | Broadcast 스톰·대형 트리에서 패킷 폭주 | 🟠 | 쓰로틀·변경 노드만·배치(플랜 §7) |
| 2 | 번들 vs 노드 행 **이중 쓰기 불일치** | 🔴 | feature flag·단일 소스 전환 일정·Step 2 설계에 명시 |
| 3 | Broadcast-only **인가 약화**·악용 | 🟠 | ACL·Layer 2·기존 Presence 허용 목록 정합; 신뢰 UI 범위 문서화 |
| 4 | `updated_at`/타임존 문자열 LWW **오판 루프** | 🟠 | Step 0 정규화·플랜 §1.2 C |
| 5 | 원격 데이트가 파일럿 **render()·간선** 타이밍 깸 | 🔴 | GP-13·적용 경로를 persist/hydrate 계열만으로 제한, GATE C 트리 시나리오 |
| 6 | RLS·Publication 오설정으로 Realtime 누락/과노출 | 🔴 | 스테이징 ACL 매트릭스·진단 SQL(플랜 §7) |

---

## P-6. Step3 지침 (Plan Mode / TASK.md용)

```
태스크 크기: GP-5 — Step 0·1은 30분~한 파일 우선 가능; Step 2+ 는 DB·다파일이면 NOW 분할
PRD 추적: TASK.md `현재 아젠다` + 각 NOW에 M1 F1-3 M5 F5-1 F5-2 F3-2 (및 Step 2 시 PRD §11 조정 한 줄); **플랜 §0.5 정책** 해당 시 정책 번호 1~9 중 관련 항목 1줄
주의 영역: sync.ts LWW·merge RPC·Presence §5.1·파일럿 onPersist·GP-4 마이그레이션 신규만
파일럿 갭: §9 스토어 계약·§10 협업 후 루트/동기 — 각 NOW 끝에 회귀 한 줄
의존 순서: 플랜 §5 권장 — Step 0 검증 → Step 1(체감 실시간) → Step 2(확정본) → Step 3(선택) → Step 4(장기)
PRD v2: 노드 행 도입 시 path·metadata·트리거(§11)와 **중복 스키마 방지** — 설계 단계에서 한 표로 정리
```

**디자인 시스템:** UI 대규모 변경이 아젠다에 없으면 **plannode-ui-identity.mdc** 는 동기화 **배지·토스트** 수준만 참조(필수 아님). Presence 아바타 영역 침범 금지는 `plannode-architecture.mdc` §5.1.

---

## P-6.5. 오버 엔지니어링·기술부채 지양

- **Layer 3(Edge)** 를 Step 1과 동시에 강제하지 않음 — 트래픽·보안 필요 시 GATE B 포함.
- **CRDT/새 추상 저장소·불필요한 `lib/` 래퍼** 금지 — 기존 `sync.ts`·채널 구독 확장 우선.
- PRD **§10 파이프라인·§11 ai_generations** 선제 구현 **포함 금지**.
- 프로덕션 잡음 로그·무근거 `any`·승인 없는 신규 npm 패키지 금지.

---

## P-7. GATE A 출력 블록

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚦 GATE A — 👤 Stephen 계획 승인 대기
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
저장 파일:
  📄 .cursor/harness/plan-output.md

확인 항목:
[ ] 분석 결과가 아젠다(plannode_realtime_sync_redesign_v1 + 작업화) 의도와 일치하는가?
[ ] 모드 판별(기본모드)이 올바른가?
[ ] 제외(CRDT/OT, workspace 즉시 폐기, Layer 3 선제 강제, F2-4/F2-5)에 동의하는가?
[ ] 파일럿 갭 §9·§10 연관(스토어·hydrate·협업 후 루트)이 식별됐는가?
[ ] PRD 연계(M1 F1-3, M5 F5-1 F5-2, F3-2, §4, §6 Phase 2, §11 조정)·**플랜 §0.5 정책 1~9(아젠다 요약 5)** 가 채워졌는가? IA/LLM 혼동 없음?
[ ] P-6.5(YAGNI·Layer 3 선택·§10·§11 선제 금지)가 반영됐는가?
[ ] P-3.5 해당 없음이 맞는가?
[ ] 핵심 위험(P-5, 특히 이중 쓰기·인가·render 타이밍) 대응에 동의하는가?
[ ] plannode §8 결정 체크리스트(Step 1 우선?, node_rows 채택?, Edge 시점?, 번들 축소)를 GATE B 전에 합의할 것인가?

→ 승인: GATE A 승인. Step3(Plan Mode) → TASK.md에 Step 0~4 NOW 분해·PRD 한 줄씩.
→ 수정: GATE A 수정 요청 → plan-output 갱신.
→ 반려: Step2부터 아젠다·플랜 §8 재정의.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

*@promptor 역할: 코드·커밋 없음 | 본 문서만 갱신 | 소스 플랜: `.cursor/plans/plannode_realtime_sync_redesign_v1.md`*
