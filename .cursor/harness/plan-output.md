# plan-output.md — Plannode Harness Flow
# 경로: `.cursor/harness/plan-output.md`
# 생성: @promptor Step2 | 2026-05-23 KST
# 소스 아젠다: `/Users/stevenmac/.cursor/plans/prd_llm_섹션_보강_5387c338.plan.md`
# 선행 EPIC: P2-B ☑ · P2-B2 ☑ (GATE E 2026-05-22) — `generationPipeline`·L1~L4·`/api/ai/messages`
# 역할: 코드·커밋 없음 — GATE A 승인 후 Step3(TASK.md) 진행

---

## P-13. EPIC PRD-LLM-SEC — PRD v2.0 섹션별 LLM 보강 (Step2 @promptor)

**생성:** 2026-05-23 KST  
**소스 아젠다:** `.cursor/plans/prd_llm_섹션_보강_5387c338.plan.md`  
**상태:** **GATE A ☑** Stephen 2026-05-23 · **GATE B** 👤 NOW 확정 대기  
**선행:** EPIC P2-B2 ☑ (`generationPipeline.ts`·`domainDictionary.ts`·GATE E 2026-05-22)  
**PRD:** M2 **F2-5** · §10 **LAYER1~3** · M4 **F4-2** · Phase **2**

### P-13.0. 한 줄 요약

**목표:** PRD 탭 **s1~s5** 각 섹션에 P2-B2에서 이미 동작하는 **3-stage LLM 파이프**(`runGenerationPipeline` + L1~L4 + `/api/ai/messages`)를 **일반화**한다. UX는 s1과 동일 — **미리보기 → 「반영」** 후 `prd_section_drafts` 저장 → **BPR**(`buildPrdMarkdownMerged`) 다운로드에 즉시 반영. 결정적 초안(`buildPrdMarkdownV20`)·BPR 자동 LLM 대체는 **하지 않음**.

**IA vs LLM (필수):** 본 EPIC은 **F2-5 LLM 기획문서 품질**(§10) 축 — PRD 탭 **마크다운 섹션 문장·누락 보강**이다. **F2-4 IA/와이어 구조 산출**·트리→템플릿 MD와 **혼동 금지**; LLM은 v2.0 **해당 섹션 헤딩·경계를 유지**하고 내용만 보강(PRD §10.4·Part IV 정합).

### P-1. 컨텍스트 로드 (요지)

- **AGENTS.md:** GP-13 트리뷰 보호 · GP-12 경량화·신규 `lib/` 모듈 억제 · GP-7 명시 범위만.
- **plannode-prd.mdc:** F2-5 · §10 LAYER1~3 · M4 F4-2 PRD 내보내기 · Phase 2.
- **GSD_LOG.md:** P2-B2 GATE E ☑ 2026-05-22 — `contextSerializer`·`domainDictionary`·`generationPipeline`·`aiGenerations.ts`.
- **아젠다 정본:** `prd_llm_섹션_보강_5387c338.plan.md`
- **로드맵 교차:** `.cursor/plans/plannode_llm_phase2.md` Part V — B2-02 `getLatestGeneration` 등 **본 EPIC 제외·BACKLOG**.
- **코드 확인 (2026-05-23):**
  - `+page.svelte` — **s1만** `runPrdS1AiEnhance`·헤더 「s1 AI 보강」·`prdS1AiBusy`/`showPrdS1AiModal` 전용 상태.
  - s1 러너는 `buildPrompt` + 인라인 `[TARGET_SECTION]` — **`buildPrdL1CoreSummaryPrompt`·`injectDomainContext` 경로와 미정합**(Phase 1에서 통합).
  - `prdStandardV20.ts` — `buildPrdL1CoreSummaryPrompt`(s1 L1+TARGET) · `getPrdAutoSections` · `PrdSectionKey` s1~s5 · **`PRD_SECTION_ENHANCE_META`·`buildPrdSectionEnhanceUserPrompt` 없음**.
  - `projects.ts` — `updateProjectPrdSectionDraft` · `Project.prd_section_drafts` **섹션 공통** 이미 존재.
  - `plannodePilot.js` — `#BPR` → `buildPrdMarkdownMerged(drafts)` · 변경 **불필요**.
  - `insertAiGenerationL5` — AI 탭 PRD만 저장 · **PRD 탭 s1 보강은 미저장**(Phase 4 선택).

---

## P-2. 모드 판별

**기본모드**

- §10 **LAYER1~3** 재사용 + `prdStandardV20.ts` 확장 + `+page.svelte` PRD 탭 UI·오케스트레이션 **2~3파일 연쇄**.
- PRD Phase 2 **F2-5·F4-2** — **경량모드 아님**.
- Vitest 1파일(`prdStandardV20.test.ts`) 추가 — GP-12 범위 내(아젠다 명시).

---

## P-3. 범위 정의

**포함 (GATE B 후 NOW만):**

1. **Phase 1 — 섹션 보강 코어** — `src/lib/prdStandardV20.ts` **단일 파일 확장**(신규 `prd*.ts` 5파일 **금지**):
   - `PRD_SECTION_ENHANCE_META` — s1~s5 제목·LLM 지시·maxTokens 힌트.
   - `buildPrdSectionEnhanceUserPrompt(section, project, nodes, currentDraft)` — L1 `buildContextFromNodes` → `serializeToPrompt` → `injectDomainContext` + `[TARGET_SECTION]` + draft|auto baseline.
   - s1은 기존 `buildPrdL1CoreSummaryPrompt` **위임·중복 제거**.
   - `getPrdSectionAutoBaseline` — `getPrdAutoSections` thin wrapper.
   - **Vitest** `prdStandardV20.test.ts` — TARGET_SECTION·L1 블록·draft 반영 2~3건.

2. **Phase 2 — PRD 탭 러너 일반화** — `src/routes/+page.svelte`:
   - `runPrdSectionAiEnhance(sec: PrdSectionKey)` — s1 함수 **대체·통합**.
   - 상태: `prdSectionAiBusy` · `prdSectionAiModal: { sec, preview } | null`.
   - `applyPrdSectionAiPreview(sec)` / 취소 — 기존 s1 apply 패턴.
   - 헤더 「s1 AI 보강」**제거** → 각 `PRD_BLOCKS` 툴바에 「AI 보강」(s1~s5 동일).
   - 단일 미리보기 모달 — `{sec}` 제목·aria 동적.

3. **Phase 3 — L2·파이프 미세 조정 (필요 최소):**
   - `promptMatrix.ts` — `PRD` system **한 줄** (TARGET_SECTION 헤딩 유지·v2.0 경계 변경 금지). **섹션별 system 분기 없음**(YAGNI).
   - `generationPipeline.ts` — 장문(s2 등) **maxTokens override 옵션 1개** (기본값 유지).

4. **Phase 4 — (선택·GATE C 후 Stephen 승인)** — `applyPrdSectionAiPreview` 성공 시 `insertAiGenerationL5` · `source: 'prd-tab'` · `planProjectId` UUID 가드.

5. **GATE C** — s1~s5 보강·BPR·노드 초안 복귀·L1 거부·`npm run test`·`npm run build`·트리↔PRD↔AI 뷰 회귀.

**제외 (명시 · GP-7·GP-12):**

| 제외 | 이유 |
|------|------|
| CRAZYSHOT v1.6 §0~§15·신규 PRD 템플릿 | 아젠다 비목표 |
| `buildPrdMarkdownV20` / BPR **자동 LLM 대체** | Track A 결정적 초안 유지 |
| AI 탭 PRD UX·`triggerAI` 리팩터 | 이미 3-stage 동작 |
| **`getLatestGeneration` UI** (B2-02) | BACKLOG |
| LLM 완료 시 draft **자동 저장** | Stephen 선택: preview_manual |
| **F2-4 IA/와이어** 템플릿·`#V-IA` | P2-A ☑ · 무관 |
| **`plannodePilot.js` 캔버스** (`#V-TREE`·`render`·드래그) | GP-13 — PRD 뷰만 |
| **`sync.ts`·협업·Presence** | 무관 |
| **§11 path·`plan_nodes` 정규화** | H1 BACKLOG |
| **신규 `src/lib/ai/prd*.ts` 등 래퍼 모듈** | GP-12 — `prdStandardV20.ts` 확장만 |

**트리뷰 보호 (GP-13, 필수):**

- `#V-PRD`·`.view`·PRD 섹션 CSS만 수정 — **`z-index`·`overflow`·전역 CSS**가 `#V-TREE`·`.view.active`를 가리지 않게 GATE C **트리↔PRD↔AI 1회** 명시. `plannodePilot.js` **기본 무수정**.

**편집·저장 귀속 (P-4.5):**

- **트리 SSoT:** `nodes[]` — L1 입력·앵커 노드(`resolveContextAnchorNodeId`).
- **PRD 섹션 편집·LLM 반영:** `Project.prd_section_drafts` + `updateProjectPrdSectionDraft` — **LLM 결과는 draft에만** 기록(GP-13·아젠다 SSoT). BPR은 `buildPrdMarkdownMerged`가 draft 우선.
- **§11 `ai_generations`:** Phase 4 선택 시 **스냅샷 영속**만; 트리·draft 자동 덮어쓰기 **없음**.

**참고 파일:**

| 경로 | 이유 |
|------|------|
| `src/lib/prdStandardV20.ts` | v2.0 MD·s1 L1·**Phase 1 확장 정본** |
| `src/routes/+page.svelte` | `PRD_BLOCKS`·draft·s1 러너·모달 |
| `src/lib/ai/generationPipeline.ts` | 3-stage · `createAnthropicMessagesCaller` |
| `src/lib/ai/iaExporter.ts` | `buildPrompt` |
| `src/lib/ai/contextSerializer.ts` | L1 · `isLayer1ContextSufficient` |
| `src/lib/ai/promptMatrix.ts` | L2 PRD system (Phase 3 선택) |
| `src/lib/ai/domainDictionary.ts` | L4 `injectDomainContext` |
| `src/lib/stores/projects.ts` | `updateProjectPrdSectionDraft` |
| `src/lib/supabase/aiGenerations.ts` | Phase 4 `insertAiGenerationL5` |
| `src/routes/api/ai/messages/+server.ts` | API 계약 유지 |
| `src/lib/pilot/plannodePilot.js` | `#BPR`·`buildPrdMarkdownMerged` (회귀만) |
| `.cursor/plans/plannode_llm_phase2.md` | Part V BACKLOG |
| `.cursor/rules/plannode-ui-identity.mdc` | PRD 탭·모달 톤·버튼 |
| `docs/plannode_llm_f25_context.md` | F2-5 vs F2-4 · L1 필수 |

---

## P-3.5. v4 보기·출력 정본 동기

- **내부 `OutputIntent`:** PRD 탭 보강은 **`PRD`** 단일 intent — AI 탭 5버튼·`AI_INTENT_BY_TYPE`과 **별 경로**(PRD draft vs AI 뷰 표시).
- **사용자 라벨:** 섹션 툴바 **「AI 보강」** — v4 §4.0 「AI 분석(LLM)」= F2-5와 정합; **IA 탭 「구조보내기」와 혼동 금지**.
- **「노드」라벨:** 「노드 초안으로」= `getPrdAutoSections` 결정적 초안 복귀 — LLM 전 상태(§4.0.1 캔버스 「노드」와 무관).
- **M2 ID:** 본 EPIC은 **PRD 탭 섹션 LLM** — `M2-EXPORT-XLSX`·IA 그리드 **해당 없음**.

---

## P-4. 파일럿 갭 연관성 체크

출처: `docs/PILOT_FUNCTIONAL_SPEC.md` §7·§9, §10 갭 표

```
관련 갭 항목:
□ [포팅갭-7 PRD/Spec 탭] — 파일럿: render 후 buildPRD 동기 | Svelte: #V-PRD·PRD_BLOCKS·draft | 리스크: 🟡 PRD 뷰 CSS·.view 전환만 — 캔버스 미침범 전제
□ [PRD/Spec 데이터 동기] — 파일럿: nodes 변경 시 updPRD | Svelte: prdAuto·draft 별도 | 리스크: 🟡 LLM은 draft만 — 트리 nodes 직접 수정 금지(SSoT 유지)
□ [BPR 다운로드] — 파일럿 #BPR buildPrdMarkdownMerged | 변경 없음 | 리스크: 🟢 회귀 확인만

직접 무관: 포팅갭-1~6 캔버스 transform·addChild·줌 — plannodePilot.js 미수정 전제
```

---

## P-4.5. PRD 연계 (plannode-prd.mdc)

| PRD | 본 EPIC |
|-----|---------|
| **M2 · F2-5** LLM/AI 분석 | ☑ — PRD 탭 섹션별 3-stage 보강 |
| **§10.2 LAYER1** | ☑ — `serializeToPrompt`·`injectDomainContext` 필수 |
| **§10.2 LAYER2** | ☑ — `promptMatrix` PRD system (Phase 3 한 줄) |
| **§10.3 LAYER3** | ☑ — `runGenerationPipeline` skeleton→deepen→validate (**P2-B2 ☑ 재사용**) |
| **§10.4 IA 보조 LLM** | — — **구조는 v2.0 섹션 고정**, LLM은 문장·누락만 |
| **§10.5 UX** | ☑ — 미리보기→수동 반영; `getLatestGeneration` **제외** |
| **M4 · F4-2** PRD MD 내보내기 | ☑ — BPR·draft merge 경로 유지 |
| **M2 · F2-4** · **M4 F4-3/4-4** | **변경 없음** (P2-A ☑) |
| **§11** `ai_generations` | ☐ Phase 4 **선택** |
| **§6 Phase 2** | ☑ — F2-5 LLM 강화 연장(P2-B2 후속 UX) |

**Phase:** PRD §6 Phase 2 **F2-5·F4-2** 범위 — MVP·Phase 3+ L4 도메인 사전 **전면·path DB**는 제외.

**충돌 정리:** PRD §10 「`content`만 API 금지」— P2-B/B2로 AI 탭은 복구됨; **PRD 탭 s1은 L1 일부만**(`buildPrompt` 경로) — Phase 1에서 **`buildPrdL1CoreSummaryPrompt`와 동일 L1+L4 계약**으로 정합. P2-A IA 템플릿과 **공존**(PRD draft ≠ IA MD).

---

## P-5. 핵심 위험 요소

| # | 위험 | 수준 | 대응 |
|---|------|------|------|
| 1 | s2 장문 → 토큰 초과·잘림 | 🟠 | Phase 3 maxTokens override · validate `[GAP]` 표시(기존) |
| 2 | LLM이 v2.0 `##`/`###` 헤딩·섹션 경계 파괴 | 🔴 | TARGET_SECTION 지시 + system 한 줄 + **미리보기 필수** |
| 3 | s1 `buildPrompt` vs `buildPrdL1CoreSummaryPrompt` **L1 불일치** | 🟠 | Phase 1 단일 `buildPrdSectionEnhanceUserPrompt` |
| 4 | `+page.svelte` 비대·인라인 중복 | 🟠 | prompt 로직 → `prdStandardV20.ts`; UI만 셸 |
| 5 | 섹션 1회 = API **3회** · s5까지 최대 15회 | 🟡 | UX 힌트·BACKLOG 일괄 보강 |
| 6 | PRD `.view` CSS가 트리 가림 | 🟠 | `plannode-ui-identity` · GATE C 뷰 전환 |
| 7 | 로컬 projectId vs plan UUID — insert 실패 | 🟡 | Phase 4 optional · enhance는 로그인+클라우드만 |

---

## P-6. Step3 지침 (Plan Mode용)

```
태스크 크기: GSD 30분 이내, 단일 파일 원칙
PRD 추적: TASK.md 각 NOW에 M2 F2-5 · §10 · M4 F4-2 1줄씩
의존 순서:
  NOW-PRD-01 (prdStandardV20 + test) →
  NOW-PRD-02 (+page runPrdSectionAiEnhance + 모달) →
  NOW-PRD-03 (+page s2~s5 버튼·힌트·aria) →
  (선택 GATE C 후) NOW-PRD-04 insertAiGenerationL5 →
  NOW-PRD-05 GATE C

주의 영역:
  - L1 거부·클라우드 가드 — AI 탭·s1과 동일 패턴 유지
  - draft 저장 — updateProjectPrdSectionDraft; nodes persist 경로 **우회 금지**
  - promptMatrix/generationPipeline 변경은 **최소 diff** (Phase 3)
파일럿 갭: §7 PRD 탭 — pilot buildPRD 미변경; BPR 회귀만
PRD v2: P2-B2 파이프 **재사용** — generationPipeline 신규 작성 금지
```

**디자인 시스템 (UI):** Step3·@harness-executor에 **`.cursor/rules/plannode-ui-identity.mdc`** 를 PRD 탭·모달·「AI 보강」버튼 **유일 UI 참조**로 명시.

---

## P-6.5. 오버 엔지니어링·기술부채·YAGNI

- **포함:** 아젠다 Phase 1~3 + GATE C + (선택) Phase 4만.
- **제외:** 섹션별 system prompt 분기 · 신규 `lib/prd*` 모듈 · CRAZYSHOT 템플릿 · B2-02 재사용 UI.
- **기술부채:** 프로덕션 `console.log`·무분별 `TODO`·`any` 금지 · s1 레거시 함수명 정리 시 **deprecated 주석**만.
- **YAGNI:** 일괄 s1→s5 순차 보강(15 API) · 자동 draft 저장 — **BACKLOG**.

---

## P-6.6. Step3 — TASK NOW 초안 (GATE A·B 후 · 30분·1파일)

| NOW | 파일(주) | 내용 | PRD |
|-----|----------|------|-----|
| **NOW-PRD-01** | `prdStandardV20.ts` + `prdStandardV20.test.ts` | `PRD_SECTION_ENHANCE_META` · `buildPrdSectionEnhanceUserPrompt` · Vitest | F2-5 · §10.2 |
| **NOW-PRD-02** | `+page.svelte` | `runPrdSectionAiEnhance` · 상태·모달 일반화 · s1 함수 통합 | F2-5 · §10.3 |
| **NOW-PRD-03** | `+page.svelte` | `PRD_BLOCKS` 각 「AI 보강」·힌트·aria · 헤더 s1 전용 버튼 제거 | F4-2 · UI |
| **NOW-PRD-04** | `+page.svelte` + `aiGenerations.ts` **(선택)** | apply 시 `insertAiGenerationL5` · `source: prd-tab` | §11 |
| **NOW-PRD-05** | GATE C | s1~s5·BPR·L1거부·build/test·트리 회귀 | M2 |

**선택 Phase 3** (필요 시 NOW에 합치거나 소형 NOW):
- `promptMatrix.ts` PRD system 한 줄
- `generationPipeline.ts` maxTokens override

**의존:** PRD-01 → PRD-02 → PRD-03 → (PRD-04) → PRD-05.  
**병행 금지:** EPIC D/E · IA 템플릿 재작업 · path DB.

---

## P-6.7. GATE C (EPIC PRD-LLM-SEC · 초안)

```
[ ] npm run test · npm run build
[ ] 로그인·노드 충분 → s1~s5 각 「AI 보강」→ 3단계 토스트 → 미리보기 → 반영 → BPR MD 해당 섹션만 변경
[ ] 「노드 초안으로」→ LLM 반영 전 결정적 초안 복귀
[ ] L1 부족 트리 → API skip + 토스트(AI 탭·s1과 동일)
[ ] AI 탭 PRD 5버튼 — 회귀 없음
[ ] 트리 ↔ PRD ↔ AI — 캔버스·노드 편집·`.view` 회귀 없음
[ ] (선택 Phase 4) apply 후 ai_generations 행 · 로컬-only project skip
```

---

## P-6.8. BACKLOG (본 EPIC 제외)

| 항목 | PRD |
|------|-----|
| B2-02 `getLatestGeneration` — 섹션별 최근 보강 불러오기 | §10.5 |
| 일괄 보강 s1→s5 순차 + 진행 UI | F2-5 |
| CRAZYSHOT v1.6 템플릿 EPIC | — |
| B2-04 path DB · B2-06 intent 확장 | §11 |

---

## P-7. GATE A — 출력

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚦 GATE A (P-13 / EPIC PRD-LLM-SEC) — ☑ Stephen 2026-05-23
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
저장 파일:
  📄 .cursor/harness/plan-output.md (§P-13)
  📄 .cursor/plans/prd_llm_섹션_보강_5387c338.plan.md (소스)

확인 항목:
[ ] PRD 탭 s1~s5 섹션별 LLM 보강(미리보기→수동 반영) 의도가 맞는가?
[ ] Phase 1 `prdStandardV20.ts` 단일 확장·신규 lib 모듈 금지에 동의하는가?
[ ] 제외(BPR 자동 LLM·AI탭 변경·getLatestGeneration·IA/F2-4)에 동의하는가?
[ ] s1 `buildPrompt` vs `buildPrdL1CoreSummaryPrompt` L1 정합(Phase 1)에 동의하는가?
[ ] Phase 4 ai_generations **선택** 범위에 동의하는가?
[ ] PRD 연계(M2 F2-5 · §10 · M4 F4-2 · Phase 2 · IA≠LLM)가 채워졌는가?
[ ] P-6.5(YAGNI·GP-12) · GP-13 트리 보호가 반영됐는가?
[ ] NOW-PRD-01~05 분해·GATE C 체크리스트에 동의하는가?

→ 승인: ☑ GATE A Stephen 2026-05-23. Step3 TASK.md ☑ → **GATE B** NOW-PRD-01~05 확정.
→ 수정: GATE A 수정: … plan-output §P-13 갱신해.
→ 반려: GATE A 반려. Step2부터. 아젠다 재정의: …
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

*promptor Step2 | EPIC PRD-LLM-SEC P-13 | 2026-05-23 | 코드·커밋 없음*
