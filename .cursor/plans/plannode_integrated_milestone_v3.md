# 플랜노드 통합 마일스톤 플랜 v3.0

> **역할:** M1~M5·H1~H4 **단일 로드맵 목차**. 구현·협업·IA/LLM **상세**는 아래 연결 문서에 분산한다(GP-12 — 본문에 880줄 통합 금지).

> **작성:** 2026.05 · **갱신:** 2026-06-04 (문서 명·연결·코드 정합) · **대상:** Stephen Cconzy (PSeries)

---

## 연결 문서 생태계 (파일명 정본)

| 별칭 | 로컬 파일 (`.cursor/plans/`) | 역할 | 상태 |
|------|------------------------------|------|------|
| **마일스톤** | `plannode_integrated_milestone_v3.md` | 본 문서 — 실행 순서·M/H ID | **정본 목차** |
| **개발서 v1.0** | [`plannode_dev_spec_v1.0.md`](./plannode_dev_spec_v1.0.md) | M2-CORE 파일·순서·코드 명세 | **CORE 구현 시 단일 기준** |
| **AI 제품 경계** | [`plannode-ai-logic-v4.md`](./plannode-ai-logic-v4.md) | M2/M3 NOW ID · Manyfast 4.2 · H1~H4 | **참고·ID 카탈로그** |
| **IA·LLM Phase2** | [`plannode_llm_phase2.md`](./plannode_llm_phase2.md) | P2-A/B 완료 기록 · P2-B2(M3) 백로그 | **LLM·IA 운영 정본** |
| **와이어 Figma** | [`plannode_wireframe_figma_dev.md`](./plannode_wireframe_figma_dev.md) | M4~M5 **트랙 B** (REST·플러그인) | **미착수** (`src/lib/wireframe/` 없음) |
| **협업·동기화** | `.cursor/rules/plannode-architecture.mdc` **§10** | 번들·ops·revision·Presence | **기술 정본** (M5) |
| **제품 PRD** | `.cursor/rules/plannode-prd.mdc` | M#·F#·IA≠LLM | 제품 진실 |
| **Realtime node_rows** | [`_archive/plannode_realtime_sync_redesign_ARCHIVED.md`](./_archive/plannode_realtime_sync_redesign_ARCHIVED.md) | 구 Layer2 node_rows 초안 | **폐기·참고 금지** |

**외부 미러 (로컬과 파일명이 다를 수 있음):** [docs.plannode.io `plannode_dev_spec.md`](https://docs.plannode.io/dev/back/plannode_dev_spec.md) ≈ 로컬 `plannode_dev_spec_v1.0.md` · [ai_logic_v4.1](https://docs.plannode.io/ai_logic_v4.1.md) ≈ `plannode-ai-logic-v4.md`

**갭 분석:** [docs.plannode.io `ai_stack_gap.plan.md`](https://docs.plannode.io/ai_stack_gap.plan.md) — API 시그니처·파서 정본 보정(개발서 §0·§7과 교차)

**용어:** **`개발서 v1.0`** = [`plannode_dev_spec_v1.0.md`](./plannode_dev_spec_v1.0.md) (구 한글 파일명·`plannode_dev_spec.md` 동의)

---

## 통합 개발 단계(하네스 연동)

> **한 줄:** 제품·구현 순서는 **아래 단계 번호**가 우선. **절차**는 [`.cursor/harness/README.md`](../harness/README.md) · [`harness-workflow_final.md`](./harness-workflow_final.md) · `AGENTS.md`.

| 단계 | 범위 | 본 플랜 § | 연결 문서 |
|------|------|-----------|-----------|
| **0** | 스코프·모드 | §7 | `plan-output.md` · GATE A/B |
| **1** | H1~H4 | §1 | v4 §1.2 · `plannode_llm_phase2` §17 (B2-04↔H1) |
| **2** | **M2-CORE** | §3 | **`plannode_dev_spec_v1.0.md`** §1~§8 |
| **3** | M2 본편 | §4 | **`plannode-ai-logic-v4.md`** §5.0.1 |
| **4** | M3 | §5 | v4 §5.0.2 · **`plannode_llm_phase2.md`** Part V (P2-B2) |
| **5** | M4~M5 | §6 | 트랙 A: PRD F2-4 · 트랙 B: **`plannode_wireframe_figma_dev.md`** |
| **—** | 협업·CSR 등 | — | **`plannode-architecture.mdc` §10** · `TASK.md` (마일스톤과 병행) |

---

## 문서 구조

| § | 제목 | 용도 |
|---|------|------|
| **0** | 연결 문서 생태계 | 파일명·역할·폐기 문서 |
| **1** | H1~H4 | 하네스 잔류 |
| **2** | M1~M5 개요 | 범위·**코드 스냅샷(2026-06)** |
| **3** | M2-CORE | 아젠다→트리 · CORE-01~10 상태 |
| **4** | M2 본편 | MCP·캔버스·뷰·보내기 |
| **5** | M3 | 도메인·온보딩 · P2-B2 이관 |
| **6** | M4~M5 | 업로드·와이어 이원 |
| **7** | 진실 순위·인덱스·체크리스트 | 하네스 규칙 |

---

## § 1. 하네스 잔류 갭 (H1~H4)

> **출처:** v4 §1.2 · GATE B 전 `TASK.md`에 ID 1줄

### H1 — `plan_nodes.path` (PRD §11)

| 항목 | 내용 |
|------|------|
| **문제** | path(uuid[] 조상) 전용 SQL·TASK NOW 없음 |
| **다음 액션** | GP-4 신규 SQL → Supabase 실행 → TASK `PRD: M3 F3-2` |
| **교차** | [`plannode_llm_phase2.md`](./plannode_llm_phase2.md) **B2-04** · M3와 동일 GATE |

### H2 — PILOT §9~§10 수동 검증

| 항목 | 내용 |
|------|------|
| **문제** | `docs/PILOT_FUNCTIONAL_SPEC.md` §9~§10 검증 미기록 |
| **다음 액션** | @qa 또는 TASK 검증 표 (IA 구현 후) |

### H3 — `plan-output.md` M1 스냅샷

| 항목 | 내용 |
|------|------|
| **다음 액션** | M2 GATE B 전: "M1 완료·§1+TASK만 참조" 한 줄 또는 아젠다 갱신 |

### H4 — v4.1 시제 리프레시

| 항목 | 내용 |
|------|------|
| **다음 액션** | [`plannode-ai-logic-v4.md`](./plannode-ai-logic-v4.md) — M2-CORE API·relink·§10 협업 정본 반영(문서만) |
| **스냅샷** | 아젠다 API·파서 ☑ · UI=`+page.svelte` 프로젝트 생성 플로 · `AgendaInputModal` 별도 컴포넌트 **없음** · relink ☑(파일럿) · node_rows Realtime **미채택** |

---

## § 2. 마일스톤 범위 (M1 ~ M5) — 코드 스냅샷 2026-06

### M1 — 웹 기획툴 MVP ✅ (완료 귀결)

**완료 기준 (GATE D):** L5 IA 3종·보내기·배지·캔버스·탭 전환 · P2-A/B — [`plannode_llm_phase2.md`](./plannode_llm_phase2.md) GATE C

**M1 요약:** 트리·PRD/명세/IA·배지·Supabase ACL·`ai_generations` 1-stage·`/api/ai/messages` · 협업 골격은 **architecture §10**

---

### M2 — 실행 연결성·캔버스 UX·보기

| 축 | 내용 | 상태 (2026-06) |
|----|------|----------------|
| **CORE** | 아젠다→트리 ([`plannode_dev_spec_v1.0.md`](./plannode_dev_spec_v1.0.md)) | **부분 완료** — §3 표 |
| **MCP** | Cursor MCP · ContextSerializer | 미완 |
| **캔버스** | M2-CANVAS-NODE-RELINK (3초 재연결) | **부분** — `plannodePilot.js` `relink*` |
| **뷰·보내기** | PRD 동기·그리드·xlsx·Mermaid | 미완 다수 |

**M2 완료 기준:** CORE GATE C 잔여 + MCP + 재연결 UX 검수 + 그리드·xlsx

---

### M3 — 도메인·온보딩·LLM 고도화

| 축 | 연결 |
|----|------|
| domainDictionary · generationPipeline | 코드 **부분** — [`plannode_llm_phase2.md`](./plannode_llm_phase2.md) Part V **P2-B2** (B2-01~08) |
| H1 path DB | B2-04 = H1 |

---

### M4~M5 — 업로드·와이어 (Manyfast 패리티)

| 트랙 | 문서 | 시기 |
|------|------|------|
| **A — MD 와이어** | PRD F2-4 · `iaExporter` · Part II `plannode_llm_phase2` | M2~M3 |
| **B — Figma** | [`plannode_wireframe_figma_dev.md`](./plannode_wireframe_figma_dev.md) | **M4~M5** GATE B 후만 |

---

## § 3. M2-CORE — 아젠다 → 노드트리

> **구현 명세:** [`plannode_dev_spec_v1.0.md`](./plannode_dev_spec_v1.0.md) §1~§8 (본 §은 **상태·GATE**만)

### 목표

아젠다(요구사항) → 배지 반영 노드트리 → 캔버스. **캔버스 반영 경로**가 CORE 핵심(기존 `triggerAI` 텍스트 패널만 표시는 우회).

### UI 진입 (문서·코드 정합)

| 계획 초안 | **현행 구현** |
|----------|----------------|
| `AgendaInputModal.svelte` + `#BNA` | **`src/routes/+page.svelte`** — 프로젝트 생성·요구사항 필드 → `POST /api/ai/agenda-to-tree` (개발서 §3-5 플로우 동일, 컴포넌트 분리 없음) |

별도 모달·툴바 「노드트리 생성」이 필요하면 CORE-06b로 TASK 분리. **없으면** 개발서·CORE-06~08을 `+page` 기준으로 본다.

### CORE 항목 상태 (2026-06)

| ID | 항목 | 상태 |
|----|------|------|
| CORE-01 | `agendaDomainDetector.ts` | ☑ |
| CORE-02 | `agendaPromptAgent.ts` | ☑ |
| CORE-03 | `agendaResponseParser.ts` | ☑ |
| CORE-04 | `fetchAnthropicAssistantText` 시그니처 | ☑ (구현 시 확인 유지) |
| CORE-05 | `/api/ai/agenda-to-tree` | ☑ |
| CORE-06 | 클라이언트 E2E (`+page` 아젠다 플로) | ☑ (모달 컴포넌트 없음) |
| CORE-07 | 머지·교체 confirm | ☐ TASK 확인 |
| CORE-08 | `+page` 진입·와이어 싱크 | ☑ (모달 import 대신 내장 플로) |
| CORE-09 | `AGENDA_TO_TREE` in types | ☐ |
| CORE-10 | `insertAiGenerationL5` after success | ☐ |

### Sprint 요지 (변경 없음 — 상세는 개발서)

- **CORE-1~3:** `src/lib/ai/agenda*.ts` — 개발서 §3-1~3-2  
- **CORE-4~5:** `anthropicMessages` · `src/routes/api/ai/agenda-to-tree/` — §3-4  
- **CORE-6~8:** 클라이언트 플로 — §3-3, §3-5 (**파일=`+page.svelte`**)  
- **CORE-9~10:** types · `aiGenerations` — §6~7  

### CORE GATE C

```
☑ POST /api/ai/agenda-to-tree → 파싱 → upsert → hydrate → 캔버스 (프로젝트 생성·요구사항 경로)
☐ CORE-07 머지 정책 UX 확정
☐ CORE-09~10 AGENDA_TO_TREE 영속
☑ 배지·PRD/IA/명세 탭 회귀 없음
☐ 빈 아젠다·API 실패 피드백 (재검증)
```

---

## § 4. M2 — 실행 연결성·캔버스 UX

> **ID 목록:** [`plannode-ai-logic-v4.md`](./plannode-ai-logic-v4.md) §5.0.1

### M2-CANVAS-NODE-RELINK

| 항목 | 내용 |
|------|------|
| **코드** | `plannodePilot.js` — `relinkArm` · `relinkDrag*` 등 **존재** |
| **GATE** | PILOT §7·§4.0.1 수동 회귀 — 「미구현」 문구는 v4 H4에서 수정 |

### M2-MCP · PRD-SYNC · 그리드 ·보내기

v4 §5.0.1 ID 그대로 — `M2-MCP-01` · `M2-PRD-SYNC` · `M2-VIEW-*` · `M2-EXPORT-*` · `M2-L3-PIPE` 등. NOW 1줄 규칙 유지.

---

## § 5. M3 — 도메인·온보딩·P2-B2

> **백로그 정본:** [`plannode_llm_phase2.md`](./plannode_llm_phase2.md) Part V (B2-01~08)  
> **코드 착수:** `generationPipeline.ts` · `domainDictionary.ts` — **부분**

| 마일스톤 | P2-B2 ID |
|----------|----------|
| M3 파이프 L3 | B2-01 |
| M3 재사용 UX | B2-02 |
| M3 ai_generations 확장 | B2-03 |
| **H1** path | **B2-04** |
| M3 domainDictionary | B2-05 |

**제외:** 협업 번들/ops → **architecture §10** (llm 문서 Part VI). Figma → **wireframe 가이드** M4~M5.

---

## § 6. M4~M5 — 파일·와이어

- **트랙 A:** `plannode_llm_phase2` Part II · PRD F4-3/4-4  
- **트랙 B:** [`plannode_wireframe_figma_dev.md`](./plannode_wireframe_figma_dev.md) — `src/lib/wireframe/` **미생성** · GP-13 캔버스 침습 금지  

---

## § 7. 구현 진실 순위 & 인덱스

### 문서 진실 순위

```
① TASK.md (NOW / DONE / GATE LOG)
② 본 마일스톤 v3.0 (§0~§7)
③ plan-output.md (M2 착수 전 갱신)
④ plannode-architecture.mdc §10 — 협업·동기화 (M5, CSR)
⑤ plannode-prd.mdc — 제품 M/F
⑥ plannode-ai-logic-v4.md — M2/M3 ID·Manyfast
⑦ plannode_dev_spec_v1.0.md — M2-CORE 구현 명세
⑧ plannode_llm_phase2.md — IA/LLM 완료·P2-B2
⑨ plannode_wireframe_figma_dev.md — M4~M5 트랙 B만
⑩ harness-workflow_final.md · harness/README.md · AGENTS.md
```

**사용 금지(로드맵 NOW):** `_archive/plannode_realtime_sync_redesign_ARCHIVED.md`

### NOW 한 줄 규칙

```
✓ "v4 §5.0.1 <ID>" 또는 "H1"~"H4" 또는 "CORE-0N" 또는 "B2-0N"
✗ 표 전체 복붙 (GP-12)
```

### 건드리지 않는 파일 (GP-13)

`plannodePilot.js` · `plannodeTreeV1.ts` · `badgePromptInjector.ts` · `badgeImportAliases.ts` · `projects.ts`(upsert 내부) · `pilotBridge.ts` · `api/ai/messages` · `anthropicMessages.ts`(시그니처 확인만)

### M2-CORE 잔여 체크리스트

- [ ] CORE-07 머지 정책
- [ ] CORE-09 `AGENDA_TO_TREE`
- [ ] CORE-10 `insertAiGenerationL5` (아젠다 성공 경로)
- [ ] [`plannode_dev_spec_v1.0.md`](./plannode_dev_spec_v1.0.md) §0 「구현 상태」와 본 §3 표 동기
- [ ] H4 — v4 시제 리프레시

---

## 최종 요약

| 단계 | 이름 | 상태 (2026-06) | 정본 문서 |
|------|------|----------------|-----------|
| **M1** | MVP | ✅ | v4 §1.1 · llm phase2 P2-A/B |
| **M2-CORE** | 아젠다→트리 | **부분 ☑** | `plannode_dev_spec_v1.0.md` |
| **M2** | 연결성·캔버스·뷰 | 대기 | `plannode-ai-logic-v4.md` |
| **M3** | 도메인·P2-B2 | 대기 | `plannode_llm_phase2.md` |
| **M4~M5** | 업로드·Figma | 대기 | `plannode_wireframe_figma_dev.md` |
| **M5 협업** | 팀 동기화 | **진행 중** | `plannode-architecture.mdc` §10 · TASK |

---

*plannode_integrated_milestone_v3.md v3.0 · 연결: `plannode_dev_spec_v1.0` · `plannode-ai-logic-v4` · `plannode_llm_phase2` · `plannode_wireframe_figma_dev` · architecture §10 · `_archive` realtime 폐기*
