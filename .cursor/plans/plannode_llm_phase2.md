# Phase 2 — IA·와이어·LLM 정본 (통합)

**로컬 파일명:** `plannode_llm_phase2.md` (구 `plannode_llm_보완플랜.md`)

> **로드맵:** [`plannode_integrated_milestone_v3.md`](./plannode_integrated_milestone_v3.md) — M1 IA/LLM ☑ · **M3** = Part V **P2-B2** · 협업은 **architecture §10** (본 문서 Part VI).

**상태:** 정본 문서 · **갱신:** 2026-06-04  
**완료 EPIC:** P2-A (F2-4·F4-3/4-4) ☑ · P2-B (F2-5·§10 LAYER1~2) ☑  
**다음 EPIC(예정):** **P2-B2** — §10 LAYER3~4 · §11 DB · 재사용 UX (본 문서 §11)  
**하네스:** [`plan-output.md`](../.cursor/harness/plan-output.md) §P-10 · §P-11 · [`TASK.md`](../.cursor/harness/TASK.md)  
**PRD:** M2 F2-4 / **F2-5** · M4 F4-3 / F4-4 · §10 · Phase 2  
**IA·와이어(F2-4):** [`docs/plannode_llm_f25_context.md`](../../docs/plannode_llm_f25_context.md) Part II (구 `plannode_ia_wire_export.md` 삭제)

---

## 문서 지도

| Part | PRD·EPIC | 내용 |
|------|----------|------|
| **I** | 공통 | IA ≠ LLM · SSoT · 뷰·파일명 |
| **II** | P2-A ☑ F2-4 | 트랙 A/B · 템플릿 MD · GATE C (IA) |
| **III** | P2-B ☑ F2-5 | LAYER1~2 · AI 탭 · 호출 경로 · GATE C (LLM) |
| **IV** | — | IA 탭 ↔ LLM 경로 교차표 |
| **V** | **P2-B2 예정** | LLM 고도화·구현 목록·착수 조건 |
| **VI** | — | 제외·병행 금지 |

---

# Part I — 공통 (IA ≠ LLM)

## 1. 용어

| 용어 | 의미 | Plannode UI |
|------|------|-------------|
| **IA** | *Information Architecture* — **정보 구조** (계층·내비·라벨·이동 경로) — **LLM 없이** 템플릿 재현 | 「정보 구조(IA)」·`#V-IA` · **F2-4** |
| **와이어(뼈대)** | 화면별 저충실 블록/섹션 — **트리→템플릿** | IA 탭 · `{slug}-wireframes.md` · **F4-4** |
| **LLM / AI 분석** | 기획문서·분석 **품질** — **구조 맥락**을 API에 실어 보냄 | 「AI 분석」·`#V-AI` · **F2-5** |

**혼동 금지**

- IA 탭 **「구조보내기」** = 트리→MD **정본** (네트워크 없음) — Part II 트랙 A.
- IA 탭 **「AI 초안」** / AI 탭 5버튼 = **LLM 보조** — 골격은 트리·IA 템플릿 우선 (PRD §10.4).
- AI 탭 **「와이어·화면 (LLM)」** ≠ IA 탭 와이어 **뼈대 MD** — LLM은 문장·블록 **설명 보강**만.

## 2. 데이터 단일 진실 (SSoT)

| 데이터 | 저장 | 트랙 A (템플릿) | 트랙 B / LLM |
|--------|------|-----------------|--------------|
| 계층·번호·이름·설명 | `nodes[]` · `parent_id` · `num` · `name` · `description` | ✓ | ✓ (`buildTreeText`·L1) |
| IA 그리드 | `metadata.iaGrid` | ✓ (표·경로) | ✓ (`buildIaGridPromptSupplement`) |
| 기능명세 열 | `metadata.functionalSpec` | ✗ (IA 탭 범위 밖) | `FUNCTIONAL_SPEC` (명세 뷰) |

**금지:** IA·LLM 산출을 파일럿 `treeText` 또는 **둘째 저장소**에 이중 기록하지 않음 (`plannode-architecture.mdc` · GP-13).

**파일럿:** 캔버스·`#V-TREE` · `render()` — IA/LLM은 Svelte 뷰·`triggerAI`만 (GP-13).

## 3. 산출물·파일명 (M4)

슬러그: `slugExportName(project.name)` — `src/lib/ai/iaGridCsvExport.ts`.

| PRD | 파일명 | 정본 경로 | LLM 보조 |
|-----|--------|-----------|----------|
| **F4-3** | `{slug}-ia.md` | `buildIaStructureMarkdownFromTree` | `IA_STRUCTURE` (IAExportMenu) |
| **F4-4** | `{slug}-wireframes.md` | `buildWireframesMarkdownFromTree` | `WIREFRAME_SPEC` / `SCREEN_LIST` (용도 구분) |

**F2-4 성공 기준:** 동일 `Node[]` → 트랙 A → **동일 MD 바이트** (재현 가능).

---

# Part II — IA·와이어 (EPIC P2-A ☑)

## 4. 이중 트랙 (F2-4 제품 계약)

| 트랙 | PRD | 입력 | 출력 | 네트워크 |
|------|-----|------|------|----------|
| **A. 구조보내기** | F2-4 · F4-3/4-4 | `nodes` 스토어 | `*-ia.md` · `*-wireframes.md` | **없음** |
| **B. AI 초안** | L5 · F2-5 보조 | 동일 트리 + L1·L2 | 모달 MD · 클립보드 | `POST /api/ai/messages` |

트랙 B는 P2-B 이후 **L1 필수** (`buildPrompt` · `runPlannodeIAExport`) — Part III.

## 5. 구현 맵 (P2-A · 유지)

| 경로 | 역할 |
|------|------|
| `src/lib/ai/iaExporter.ts` | `buildIaStructureMarkdownFromTree` · `buildWireframesMarkdownFromTree` · **`buildPrompt` (L1, P2-B)** |
| `src/lib/ai/iaExporter.test.ts` | 템플릿 재현성 · L1 Vitest |
| `src/lib/components/IAExportMenu.svelte` | 구조보내기 / AI 초안 |
| `src/lib/ai/iaExportRunner.ts` | `runPlannodeIAExport` |
| `src/lib/components/IAGridSheet.svelte` | `iaGrid` — 열 정의는 `buildIaGridMatrix`와 동일 |

**GP-12:** 신규 `src/lib/ia/*` 금지 — `iaExporter.ts` 확장만.

## 6. GATE C — EPIC P2-A (Stephen ☑ 2026-05-19)

```
[x] npm run build
[x] 동일 nodes → 「구조보내기」2회 → *-ia.md 동일
[x] 동일 → 와이어 뼈대 2회 → *-wireframes.md 동일
[x] 트리 ↔ IA ↔ PRD — 캔버스 회귀 없음
[x] 「AI 초안」— API/복사 회귀 (P2-B 이후 L1 포함)
[x] LLM 없이 F4-3/4-4 저장 성공
```

**정본:** [`TASK.md`](../.cursor/harness/TASK.md) EPIC P2-A · plan-output §P-10.11.

---

# Part III — LLM 기획문서 (EPIC P2-B ☑)

## 7. §10 레이어 — 완료 vs 예정

| 레이어 | PRD | P2-B (완료) | P2-B2 (예정) |
|--------|-----|-------------|--------------|
| **LAYER1** | `serializeToPrompt` | ☑ `buildContextFromNodes` → `buildPrompt` | 유지·엣지 보강 |
| **LAYER2** | `promptMatrix` | ☑ `getSystemPrompt` | `OutputIntent` 확장 (§11.4) |
| **LAYER3** | Skeleton→Deepen→Validate | — | ☑ **§11.1** |
| **LAYER4** | `domainDictionary` | — | ☑ **§11.3** |

**설계 원칙 (유지):** 노드 `description`만 또는 `buildTreeText`만으로 API 호출 **금지**. user에 L1 블록(`[HIERARCHY CONTEXT]`·`[CURRENT]` 등) **필수**.

## 8. 호출 경로 (P2-B 완료)

```
nodes + currentNodeId (selId 또는 {projectId}-r)
  → buildContextFromNodes → serializeToPrompt (L1)
  → buildPrompt (system=L2, user=L1 + tree 보조 + supplement)
  → POST /api/ai/messages
  → (선택) insertAiGenerationL5 · context_snapshot.layer1
```

**단일 조립:** `src/lib/ai/iaExporter.ts` `buildPrompt` — GP-12: 대형 `lib/llm/*` 신규 모듈 없이 **기존 파일 확장** 우선.

## 9. AI 분석 탭 — 버튼 ↔ OutputIntent

| UI (`#V-AI`) | 키 | `OutputIntent` |
|--------------|-----|----------------|
| PRD 완성본 | `prd` | `PRD` |
| 와이어·화면 (LLM) | `wireframe` | `WIREFRAME_SPEC` |
| 누락 기능 탐지 | `miss` | `SCREEN_LIST` |
| TDD 우선순위 | `tdd` | `FUNCTIONAL_SPEC` |
| 하네스 플랜 | `harness` | `IA_STRUCTURE` |

**모델:** `selectModelForL1Request` — 고위험 구간 Sonnet (PRD §10.3).  
**폴백:** NO_KEY·503 → 조립 프롬프트 표시 · 클립보드 복사.

## 10. currentNodeId · 맥락 거부

| 규칙 | 내용 |
|------|------|
| 기본 | `selId` → 없으면 `{projectId}-r` |
| 거부 | `nodes` 0건 · L1 실질 부족 → API 스킵 + 토스트 |
| 저장 | LLM 출력은 `#ai-result`·`ai_generations` — **`nodes` 자동 덮어쓰기 없음** |

## 11. IA 탭과 LLM (P2-B-05 ☑)

| 경로 | L1 |
|------|-----|
| AI 탭 5버튼 | ☑ `triggerAI` |
| IA 「AI 초안」 | ☑ `iaExportRunner` · `IAExportMenu` |
| IA 「구조보내기」 | **변경 없음** (트랙 A만) |

## 12. 구현 맵 (P2-B · 완료)

| NOW | 경로 | 역할 |
|-----|------|------|
| P2B-01 | **본 문서** | F2-5·통합 정본 |
| P2B-02 | `iaExporter.ts` | `buildPrompt` + L1 |
| P2B-03 | `plannodePilot.js` | `triggerAI` |
| P2B-04 | `iaExporter.test.ts` | L1 Vitest |
| P2B-05 | `IAExportMenu` / `iaExportRunner` | 트랙 B L1 |
| P2B-06~07 | `+page` / `aiGenerations` | 안내·snapshot |
| P2B-08 | `TASK.md` | GATE C 블록 |

## 13. GATE C — EPIC P2-B (Stephen ☑ 2026-05-19)

```
[x] npm run build · Vitest L1
[x] AI 탭 PRD — 프롬프트에 L1 블록
[x] 맥락 부족 — 거부 토스트
[x] 5버튼 회귀 · NO_KEY 폴백
[x] IA 구조보내기 2회 동일 (P2-A 회귀)
[x] 트리 ↔ AI ↔ PRD 회귀
[x] IAExportMenu AI 초안 — L1
```

---

# Part IV — IA ↔ LLM 교차 (운영 시)

| 사용자 행동 | 정본 | LLM 역할 |
|-------------|------|----------|
| IA 탭 → 구조보내기 | 트랙 A MD | 없음 |
| IA 탭 → AI 초안 | 트리 뼈대 고정 | L1+L2로 문장 보강 |
| AI 탭 → PRD/와이어/하네스 | L1 필수 | 의도별 `OutputIntent` |
| 와이어 **블록 뼈대** 필요 | `*-wireframes.md` (A) | `WIREFRAME_SPEC`은 **서술**만 |

---

# Part V — P2-B2: LLM 고도화 · 앞으로 구현할 목록

**성격:** `plannode_llm_f25_context.md`가 담는 **「LLM 개선 2차」** 로드맵. P2-B에서 **의도적으로 제외**한 PRD §10.3~§11·§10.5 항목.  
**하네스:** 별도 **GATE A/B** · `@promptor` → plan-output **P-11.2 또는 P-12-B2** (미작성) · TASK NOW 분해.  
**병행 금지:** **EPIC D/E**(트리 CRDT)·**PROJ-SETTINGS**급 대형 UI와 **동시 GATE B 금지** (plan-output · TASK).

## 14. P2-B2 한 줄 목표

**한 번의 API 호출**이 아니라 **단계적 생성·검증·재사용·DB 정합**까지 가져가 PRD §10 전체에 가깝게 맞춘다. **IA 트랙 A 템플릿**과 **트리 SSoT**는 그대로 — LLM이 **구조를 뒤집지 않음**.

## 15. 구현 백로그 (우선순위 제안)

| ID | 항목 | PRD | 산출·코드 방향 | 선행 |
|----|------|-----|----------------|------|
| **B2-01** | **`generationPipeline`** 2/3-stage | §10.3 | Skeleton(골격) → Deepen(섹션 병렬) → Validate([GAP]·PRD 검증) · `GenerationResult.pipeline` | L1☑ · L2☑ |
| **B2-02** | **`getLatestGeneration` / 재사용 UX** | §10.5 | 동일 (node, intent) 최근 결과 표시·재실행 스킵 · UI는 **DB/store 있을 때만** | B2-01 또는 §11 스키마 |
| **B2-03** | **`ai_generations` 확장** | §11 | `pipeline_stage` · `skeleton`/`deepened`/`validated`/`final` · `token_usage` · RLS 유지 | GP-4 신규 SQL만 |
| **B2-04** | **`plan_nodes.path` + 트리거** | §11 · H1 | `update_node_path` · 조상 O(1) · **DB 선행** 후 serializer DB 경로 | Supabase 마이그레이션 · GATE |
| **B2-05** | **`domainDictionary` (L4)** | §10.4 | `injectDomainContext` — rental · b2g_saas 등 · 프로젝트 `domain` 메타 연동 | B2-01 권장 |
| **B2-06** | **`OutputIntent` 확장** | §10.4 | `RISK_ANALYSIS` · `STATE_MACHINE` · `USER_STORY` · `API_SPEC` · `ERD` 등 · `promptMatrix`·`modelSelector` 정합 | B2-01 |
| **B2-07** | **IA 보조 인텐트 정교화** | §10.4 | `IA_SITEMAP` · `WIREFRAME_COPY` — **카피만** · 트랙 A 뼈대 불변 | Part II 회귀 테스트 |
| **B2-08** | **Vitest·GATE C 블록** | §7 | 파이프 단계별 fixture · Sonnet 강제 구간 · IA 2회 동일 + LLM 5버튼 | B2-01~03 |

### 15.1 B2-01 generationPipeline (상세)

| 단계 | UX (목표) | 기술 요지 |
|------|-----------|-----------|
| Skeleton | 「골격 생성 중」 | 짧은 outline · 토큰 상한 |
| Deepen | 「섹션 N/M」 | 섹션 병렬 · 실패 시 부분 재시도 |
| Validate | 「검증」 | [GAP]·상태기계·결제 키워드 → Sonnet 강제 |

**금지(GP-12):** P2-B처럼 당장 `generationPipeline.ts` + `generationStore.ts` + UI를 **한 EPIC에 전부** — NOW 30분 단위 분해.

### 15.2 B2-04 path DB (상세)

- **순서:** 마이그레이션 → `types` → `buildContextFromDB` (또는 store 노드에 path 반영) — PRD §13 **DB 없이 AI 전면 구현 금지**.
- **회귀:** path 오염 = 전체 L1 오염 — path TDD 필수.

### 15.3 B2-02 재사용 UX (상세)

- 클라이언트만 캐시하지 않고 **`ai_generations` 조회 RPC** 또는 기존 테이블 read.
- AI 탭·IA 트랙 B에 「최근 생성 불러오기」— **스키마·RLS GATE 후**.

## 16. P2-B2 제외 (스코프 밖 유지)

| 제외 | 이유 |
|------|------|
| F2-4 템플릿 MD 로직 변경 | P2-A 정본 · Part II |
| EPIC D/E structure/text OT | 별도 하네스 |
| `plannode_workspace` 번들 Realtime 스트리밍 | 아키텍처 §10.7 |
| 아젠다→트리 UI | M2-CORE 별도 |
| Figma · xlsx 자동화 | plan-output BACKLOG |

## 17. P2-B2 착수 전 체크 (Stephen)

```
[ ] P2-A·P2-B·PROJ-SETTINGS 등 미커밋 정리 (GP-1)
[ ] 별도 GATE A — P2-B2 범위·포함/제외 확정
[ ] GATE B — NOW-B2-01~… 확정 (30분·한 파일)
[ ] §11 SQL 초안 — Stephen SQL Editor · GP-4
[ ] EPIC D·P2-B2 병행 금지 재확인
```

## 18. P2-B2 권장 하네스 순서 (참고)

1. `@promptor` — plan-output P-11.2 (P2-B2) 초안  
2. GATE A/B — NOW 스택  
3. **B2-04 (path DB)** 또는 **B2-03 (ai_generations)** — DB 선행 시 먼저  
4. **B2-01 (pipeline)** — 클라이언트 핵심  
5. **B2-02 (재사용 UX)** · **B2-05 (domain)** · **B2-06 (intent)**  
6. GATE C/D · @qa · GATE E  

---

# Part VI — 제외·참고

## 19. 통합 문서에서 다루지 않음

- **협업 LWW·revision·structure_ops** — `.cursor/rules/plannode-architecture.mdc` **§10** (구 realtime node_rows redesign — [`_archive/plannode_realtime_sync_redesign_ARCHIVED.md`](./_archive/plannode_realtime_sync_redesign_ARCHIVED.md) 폐기)
- **프로젝트 설정·badge_pool** — EPIC PROJ-SETTINGS · TASK
- **트리 CRDT** — EPIC D · OT 스파이크 문서

## 20. 참고 파일

| 경로 | 용도 |
|------|------|
| `src/lib/ai/contextSerializer.ts` | L1 |
| `src/lib/ai/promptMatrix.ts` | L2 |
| `src/lib/ai/modelSelector.ts` | 모델·토큰 |
| `src/routes/api/ai/messages/+server.ts` | 서버 1-stage (B2-01에서 다단계 검토) |
| `.cursor/plans/plannode-ai-enhancement-v3.md` | LAYER2~4 상세 템플릿 |
| `.cursor/rules/plannode-prd.mdc` | M/F/§10·§11 제품 진실 |

---

*plannode_llm_f25_context.md | Phase 2 IA·LLM 통합 | P2-A☑ P2-B☑ P2-B2 로드맵 | 2026-05-20*
