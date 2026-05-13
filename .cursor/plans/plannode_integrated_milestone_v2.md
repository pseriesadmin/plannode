# 플랜노드 통합 마일스톤 플랜 v2.0

> **통합 문서 기반:**
> - [노드트리 AI생성 자동화- 파이프라인 정밀 개발서 v1.0.md](./노드트리%20AI생성%20자동화-%20파이프라인%20정밀%20개발서%20v1.0.md) — 아젠다→트리 구현 단일 기준 · [docs.plannode.io 미러](https://docs.plannode.io/dev/back/plannode_dev_spec.md) *(배포 파일명이 다를 수 있음)*
> - [`ai_스택·갭_정리.plan.md`](https://docs.plannode.io/ai_stack_gap.plan.md) — 갭 분석 정본
> - [`plannode-ai-logic-v4.md`](./plannode-ai-logic-v4.md) — 제품 경계·하네스·M2/M3 ID (`v4.1` 절 번호는 본 파일 목차 기준). 공개 미러: [ai_logic_v4.1.md](https://docs.plannode.io/ai_logic_v4.1.md) *(로컬 파일명과 다를 수 있음)*
> - [개발가이드-PLANNODE_WIREFRAME_DEV.md](./개발가이드-PLANNODE_WIREFRAME_DEV.md) — 와이어 **Figma 자동화** 경로(노드 JSON→메타→Figma API). **PRD F2-4 MD 와이어와 별 트랙** — §6·M4~M5에 반영
>
> **작성 일시:** 2026.05 | **상태:** Cursor AI 즉시 착수용 | **대상:** Stephen Cconzy (PSeries)

---

## 통합 개발 단계(하네스 연동)

> **한 줄:** 제품·구현 순서는 **아래 단계 번호**가 우선이며, **절차**는 [`.cursor/harness/README.md`](../harness/README.md) · [`.cursor/plans/harness-workflow_final.md`](./harness-workflow_final.md) · `AGENTS.md`와 병행한다. NOW·GATE·PRD 한 줄은 `TASK.md` / `plan-output.md`에 남긴다.

| 단계 | 범위 | 본 플랜 § | 하네스·지침 |
|------|------|-----------|-------------|
| **0** | 스코프·모드 확정 | §7 | `plan-output.md` 포함/제외 · GATE A/B · [harness-workflow_final.md](./harness-workflow_final.md) 기본·단축·복붙 |
| **1** | 잔류 갭 정리 | §1 | H1~H4를 `TASK.md` NOW에 각 1줄 + GATE LOG |
| **2** | **M2-CORE** 아젠다→트리 | §3 | 개발서 v1.0 §1~§8 순 · `@harness-executor` · GATE C 트리 회귀 |
| **3** | M2 본편 (MCP·캔버스·뷰·보내기) | §4 | v4 `M2-*` ID · PILOT §9~§10 |
| **4** | M3 도메인·온보딩·플로 | §5 | PRD §10·§11 · v4 §5.0.2 |
| **5** | M4~M5 파일·와이어·번들 | §6 | 트랙 A(MD)·트랙 B(Figma) · [개발가이드-PLANNODE_WIREFRAME_DEV.md](./개발가이드-PLANNODE_WIREFRAME_DEV.md) |

**에이전트 순서(하네스 v1.0):** Ask(아젠다) → `@promptor` → `plan-output.md` → GATE A → Plan → `TASK.md` → GATE B → `@harness-executor` → GATE C/D → `@qa` → GATE E — 상세는 `AGENTS.md` **에이전트 호출 순서**.

---

## 문서 구조

| § | 제목 | 용도 |
|---|------|------|
| **0** | 통합 개발 단계(하네스 연동) | M1~M5·H1~H4 **실행 순서 한 표** + 하네스·에이전트 링크 |
| **1** | 하네스 잔류 갭 (H1~H4) | 즉시 처리 항목 |
| **2** | 마일스톤 개요 | M1~M5 범위 한 표 |
| **3** | **M2-CORE** — 아젠다→노드트리 | **Cursor 즉시 착수** (개발서 v1.0 §1~§8) |
| **4** | M2 — 실행 연결성·캔버스 UX | v4.1 §5.0.1 M2 ID 전체 |
| **5** | M3 — 도메인·온보딩 최적화 | v4.1 §5.0.2 전반부 |
| **6** | M4~M5 — 파일업로드·**와이어(이원)**·개발지시서 | Manyfast 풀 패리티 + **트랙 A(MD) / 트랙 B(Figma)** |
| **7** | 구현 진실 순위 & 규칙 | 하네스·하단 원칙 |

**용어:** 본 문서에서 **`개발서 v1.0`** 이란 위 한 줄의 [노드트리 AI생성 자동화- 파이프라인 정밀 개발서 v1.0.md](./노드트리%20AI생성%20자동화-%20파이프라인%20정밀%20개발서%20v1.0.md)를 가리킨다(구 `plannode_dev_spec.md`).

---

## § 1. 하네스 잔류 갭 (H1~H4) — 즉시 처리

> **출처:** v4.1 §1.2 | **규칙:** GATE B 전 반드시 처리. TASK.md에 해당 ID 명시

### H1 — `plan_nodes.path` (PRD §11)

| 항목 | 내용 |
|------|------|
| **문제** | path 필드(uuid[] 조상 추적) 전용 완료 SQL·TASK NOW 한 줄 없음 |
| **다음 액션** | GP-4 준수: 신규 SQL 파일 생성 → Supabase 수동 실행 → TASK에 "PRD: M3 F3-2" 한 줄 추가 |
| **시기** | M2 중반 또는 M3 초기 |

### H2 — PILOT §9~§10 수동 검증

| 항목 | 내용 |
|------|------|
| **문제** | PILOT_FUNCTIONAL_SPEC.md §9 갭 표·§10 체크리스트 검증 결과 미기록 |
| **다음 액션** | @qa Step5 또는 별도 TASK 검증 표 작성 (M1 이후, IA 구현 완료 후 수행) |
| **산출물** | 갭 표 채움 + "회귀 완료" 마크 |

### H3 — `plan-output.md` M1 스냅샷 갱신

| 항목 | 내용 |
|------|------|
| **문제** | plan-output.md는 Step2(설계) 전용이나, M1 완료·GATE D 후 아젠다 갱신 미실행 |
| **다음 액션** | M2 착수 전 아젠다 한 줄 갱신: "M1 완료·§1 + TASK.md로 대체" 또는 아젠다 문구 신규 작성 |
| **타이밍** | M2 GATE B 바로 전 |

### H4 — v4.1 과거 시제 리프레시

| 항목 | 내용 |
|------|------|
| **문제** | v4 파일의 "스택 공백·미구현" 서술이 현 코드 상태와 불일치 가능 |
| **다음 액션** | 본 v2.0 마일스톤 확정 후, v4.1 §2(Frozen design) 읽기 전용 리프레시: 구현 완료 항목 명기, 코드 인용만 추가 |
| **범위** | 기능 변경 없음 — 문서만 정리 |

---

## § 2. 마일스톤 범위 (M1 ~ M5)

### M1 — 웹 기획툴 MVP ✅ (완료 귀결)

**목표:** 노드맵 → IA·MD 산출이 실서비스로 동작 + PILOT §7~9 신뢰 UX 최소화  
**완료 기준 (GATE D):** L5 IA 3종 표시·내보내기 + 배지 자동 설정 + 캔버스·탭 전환 깨짐 없음

**M1 내용 요약:**
- 노드 트리 캔버스 (드래그·줌·간선·미니맵)
- PRD / 기능명세 / IA(정보구조) 뷰
- L5 IA 3종 (IA_STRUCTURE, SCREEN_LIST, FUNCTIONAL_SPEC) + Mermaid
- 21종 배지 + 동의어 자동 매핑
- Supabase 실시간 협업·RLS·ACL
- ai_generations DB 1-stage 저장
- Anthropic API 서버 연동 (callAI = /api/ai/messages)

**미구현 (M2로 이관):**
- 아젠다 입력 UI + 자동 트리 생성
- 응답 → 파싱 → 스토어 → 캔버스 연결
- 노드 카드 재연결(3초 드래그)

---

### M2 — 실행 연결성·캔버스 UX·보기 완결

| 축 | 내용 | 상태 |
|----|------|------|
| **CORE** | 아젠다→노드트리 파이프라인 (개발서 v1.0 §1~§8) | **즉시 착수** |
| **MCP** | Cursor·Claude Code 연동 (구조화 컨텍스트) | 병렬 진행 |
| **캔버스** | 3초 드래그로 노드 재연결 (M2-CANVAS-NODE-RELINK) | CRITICAL |
| **뷰** | PRD 동기·기능명세 그리드 편집·저장 | HIGH |
| **내보내기** | xlsx·Mermaid·검색·온보딩 lite | HIGH |

**M2 완료 기준:** 아젠다 입력 → 캔버스 렌더 end-to-end · MCP 연결 · 노드 이동 동작 · 그리드 저장

---

### M3 — 도메인 컨텍스트 강화 & 온보딩

| 축 | 내용 | 상태 |
|----|------|------|
| **도메인** | LAYER4 domainDictionary (커머스·SaaS·부동산) | HIGH |
| **리스크** | 고위험 감지 → Sonnet 강제 (v4.1 §10.3) | HIGH |
| **파이프** | L3 골격 + PRD 섹션별 AI | HIGH |
| **온보딩** | 질문지 가이드 + 60초 첫 PRD | MEDIUM |

**M3 완료 기준:** 도메인 선택 시 PRD에 자동 포함 · 신규 프로젝트 60초 내 첫 PRD

---

### M4~M5 — 파일 업로드 & 와이어프레임 (Manyfast 풀 패리티)

**와이어프레임 개발계획(이원화 — PRD §3 F2-4·AGENTS GP-13과 정합)**

| 트랙 | 내용 | 시기·비고 |
|------|------|-----------|
| **A — 구조형 와이어(MD)** | 노드 트리·`SCREEN_LIST` / `WIREFRAME_SPEC` → **저충실도 MD**·보내기·(선택) LLM 보강. **Figma 수준 UI 도구로의 대체 아님.** | **M2** 뷰·출력·`v4.1` §4.0·§5.0.1 (`M2-EXPORT-*` 등) · **M3**에서 IA·플로와 연계 강화 |
| **B — Figma 프로토타입 자동화** | [개발가이드-PLANNODE_WIREFRAME_DEV.md](./개발가이드-PLANNODE_WIREFRAME_DEV.md): 노드 JSON → 와이어 메타 → **Figma REST API** → 공유 링크; Step 3 네이티브 플러그인은 후행. | **M4~M5** 전용 `TASK` NOW + **GATE B** 후 착수. **캔버스·트리 SSoT**와 역할 분리 — **읽기 전용 보조·외부 동기**로 두고 파일럿 코어 침습 금지 |

| M4 | M5 |
|----|-----|
| PDF·DOCX·MD 업로드 → 트리 추출 | **트랙 B** 와이어 AI(Figma 파이프)·클릭 프로토 수준은 Manyfast 정합 후 |
| 유저 플로 기초·버전 | 개발지시서 자동 생성 |
| | MCP + 개발지시서 = 원클릭 워크플로 |

---

## § 3. M2-CORE — 아젠다 → 노드트리 파이프라인 (즉시 착수)

> **단일 구현 기준:** **개발서 v1.0** §1~§8 파일별 구현 순서 따를 것  
> **소요 시간:** 1~2주

### 목표

사용자 아젠다 입력 → 배지가 설정된 노드트리 자동 생성 → 캔버스 렌더. 핵심 기능 완성.

**핵심 갭 해소:**
- triggerAI가 텍스트 패널에만 표시 → **응답을 캔버스에 반영하는 경로 없음**
- 이 마일스톤에서 응답→파싱→스토어→캔버스 전체 경로 구현

---

### Sprint CORE-1 · 프롬프팅 에이전트 레이어

**파일:** 개발서 v1.0 §3-1, §3-2

#### CORE-01: `agendaDomainDetector.ts` (신규)
- **역할:** 아젠다 텍스트 → 도메인 감지 (커머스·예약·SaaS·소셜·교육·기본)
- **의존성:** 없음 (가장 먼저 생성)
- **파일:** `src/lib/ai/agendaDomainDetector.ts`
- **우선순위:** 🔴 CRITICAL

#### CORE-02: `agendaPromptAgent.ts` (신규)
- **역할:** 아젠다+도메인 → `buildAgendaSystemPrompt()` + `buildAgendaUserPrompt()`
- **핵심:** plannode.tree v1 JSON **단일 출력 강제** 문구 포함 (갭: promptMatrix에 없음)
- **파일:** `src/lib/ai/agendaPromptAgent.ts`
- **의존:** agendaDomainDetector
- **우선순위:** 🔴 CRITICAL

#### CORE-03: `agendaResponseParser.ts` (신규)
- **역할:** AI 응답 문자열 → ```json 펜스 추출 → `parsePlannodeTreeV1ImportText()` 래핑 → 검증
- **재사용:** `src/lib/plannodeTreeV1.ts` 건드리지 않음
- **파일:** `src/lib/ai/agendaResponseParser.ts`
- **우선순위:** 🔴 CRITICAL

---

### Sprint CORE-2 · 백엔드 API 라우트

**파일:** 개발서 v1.0 §3-4

#### CORE-04: `fetchAnthropicAssistantText` 시그니처 확인
- **확인 대상:** `src/lib/server/anthropicMessages.ts` 실제 함수 시그니처
- **이유:** 인자명 불일치 시 런타임 오류 (갭 분석 §4 참조)
- **타이밍:** CORE-05 진행 전 필수
- **우선순위:** 🔴 CRITICAL

#### CORE-05: `/api/ai/agenda-to-tree/+server.ts` (신규)
- **역할:** POST 라우트 — 인증 → 요청 파싱 → `buildAgendaPrompt()` → `fetchAnthropicAssistantText()` → rawResponse 반환
- **파싱:** 클라이언트에서 진행 (트리 보호 헌장 — 서버가 스토어 직접 건드리지 않음)
- **고위험:** "결제" 키워드 감지 → Sonnet 강제
- **파일:** `src/routes/api/ai/agenda-to-tree/+server.ts`
- **재사용:** anthropicMessages (건드리지 않음)
- **우선순위:** 🔴 CRITICAL

---

### Sprint CORE-3 · 응답 → 스토어 → 캔버스 연결 (핵심)

**파일:** 개발서 v1.0 §3-3, §3-5

#### CORE-06: `AgendaInputModal.svelte` (신규)
- **역할:** 아젠다 입력 UI → fetch /api/ai/agenda-to-tree → 응답 파싱 → 스토어 저장 → 캔버스 렌더
- **플로우:**
  ```
  텍스트 입력 → POST /api/ai/agenda-to-tree
       ↓
  AI 응답 (plannode.tree JSON)
       ↓
  extractAndParseTree() — CORE-03 재사용
       ↓
  sanitizeNodeBadgesForTreeV1() — 기존 배지 함수
       ↓
  upsertImportedPlannodeTreeV1() — 기존 projects.ts
       ↓
  hydrateFromStore() — 기존 pilotBridge.ts
       ↓
  캔버스 렌더
  ```
- **핵심:** **이 컴포넌트가 triggerAI 텍스트 패널 우회 경로를 구현**
- **파일:** `src/lib/components/AgendaInputModal.svelte`
- **재사용:** upsertImportedPlannodeTreeV1, hydrateFromStore, storeNodesToPilot (건드리지 않음)
- **우선순위:** 🔴 CRITICAL

#### CORE-07: 머지 정책 결정 및 구현
- **내용:** 기존 노드 있을 때 교체 확인 다이얼로그
- **구현:** AgendaInputModal 내 조건부 `confirm()` + `upsertImportedPlannodeTreeV1` 교체(replace) 정책 확인
- **타이밍:** CORE-06과 함께
- **우선순위:** 🟡 HIGH

#### CORE-08: `+page.svelte` 최소 수정
- **수정 대상:** src/routes/+page.svelte
- **변경 사항:**
  - AgendaInputModal import
  - `let showAgendaModal = false` 상태 추가
  - 숨은 버튼 `#BNA` (와이어 싱크·개발서 v1.0 §3-6 패턴)
  - 툴바 "노드트리 생성" 버튼 1개 추가
- **파일:** `src/routes/+page.svelte`
- **범위:** 최소 변경 (기존 와이어 싱크 패턴 따름)
- **우선순위:** 🟡 HIGH

---

### Sprint CORE-4 · ai_generations 저장 + types

**파일:** 개발서 v1.0 §6, §7 · 갭분석 §4

#### CORE-09: `types.ts` OutputIntent 추가
- **변경:** `'AGENDA_TO_TREE'` union에 추가
- **파일:** `src/lib/ai/types.ts`
- **범위:** 1줄 추가
- **우선순위:** 🟡 HIGH

#### CORE-10: `AgendaInputModal` 성공 후 `insertAiGenerationL5` 호출
- **내용:**
  ```typescript
  await insertAiGenerationL5({
    project_id: projectId,
    node_id: null,                           // 전체 트리
    output_intent: 'AGENDA_TO_TREE',
    pipeline_stage: '1-stage',
    model_used: modelOverride ?? 'claude-haiku-4-5-20251001',
    final_output: rawResponse,
    context_snapshot: { agenda },
    token_usage: {},                         // 추후 파싱
  }).catch(console.error);                  // 저장 실패가 UX 막지 않음
  ```
- **주의:** 현재 token_usage 파싱 없음 (추후 M2~M3에서 보강)
- **파일:** `src/lib/components/AgendaInputModal.svelte`
- **재사용:** src/lib/supabase/aiGenerations.ts (건드리지 않음)
- **우선순위:** 🟠 MEDIUM

---

### CORE 완료 기준 (GATE C)

```
✓ 아젠다 입력 → "생성 중..." → 캔버스 노드트리 렌더 end-to-end 동작
✓ 배지 자동 설정 확인 (배지 2개 이상)
✓ PRD·기능명세·IA 탭 전환 시 깨짐 없음 (트리 보호 헌장 회귀)
✓ 에러 케이스: 빈 아젠다·API 실패 시 사용자 피드백 정상
```

---

## § 4. M2 — 실행 연결성·캔버스 UX·보기 완결

> **출처:** v4.1 §5.0.1 M2 ID 전체  
> **소요 시간:** 4~6주 (CORE 완료 후)  
> **병렬 진행:** MCP 연동 (별도팀)

### M2-MCP-01 & M2-MCP-02 · MCP 연동

| ID | 내용 | 우선순위 |
|----|------|----------|
| **M2-MCP-01** | 플랜노드 MCP 서버 — plannode.tree JSON + ContextSerializer 4레이어 컨텍스트 패킷 제공 | 🔴 CRITICAL |
| **M2-MCP-02** | Cursor 설정 1-click 복사 UX (가이드 페이지) | 🟡 HIGH |

**차별화:** 단순 JSON이 아닌 **배지+PRD 맥락 구조적 컨텍스트** 전달이 매니패스트와 차별화

---

### M2-CANVAS-NODE-RELINK · 캔버스 노드 재연결

| 항목 | 내용 |
|------|------|
| **ID** | M2-CANVAS-NODE-RELINK |
| **기능** | 3초 선택 → 떼기 → + 드롭으로 parent_id 재연결 |
| **범위** | 단일 노드 + 서브트리 그룹 이동, 순환 방지, 모바일 터치 |
| **기준** | PILOT §7·§4.0.1과 정합 |
| **파일** | `src/lib/pilot/plannodePilot.js` (최소 침습) |
| **우선순위** | 🔴 CRITICAL |

**이유:** 핵심 기능 3요소(수정·이동·삭제) 중 "이동"이 유일하게 미구현. 캔버스가 기획 도구로 불완전함

---

### M2-PRD-SYNC · M2-VIEW-SPEC-GRID · M2-VIEW-IA-GRID · 보기 완결

| ID | 기능 | 우선순위 |
|----|------|----------|
| **M2-PRD-SYNC** | 노드 편집 → PRD 뷰 자동 갱신 (탭 전환·저장 후 깨짐 없음) | 🔴 CRITICAL |
| **M2-VIEW-SPEC-GRID** | 기능명세 뷰 인라인 셀 편집·저장 (SSoT 충돌 없게) | 🟡 HIGH |
| **M2-VIEW-IA-GRID** | IA(정보구조) 뷰 기술·컴포넌트 컬럼 포함 편집·저장 | 🟡 HIGH |

**v4.1 §4.0 정합:** 읽기 전용 모달 → 편집 가능 워크스페이스 격상

---

### M2 내보내기 & 온보딩

| ID | 기능 | 우선순위 |
|----|------|----------|
| **M2-EXPORT-XLSX** | 기능명세·IA → .xlsx 다운로드 | 🟡 HIGH |
| **M2-EXPORT-MERMAID** | 노드트리 → Mermaid 플로우차트 .mermaid 파일 + 미리보기 | 🟡 HIGH |
| **M2-DIR-SEARCH** | 노드 검색 → 캔버스 포커스 (사이드 패널·목록 필터) | 🟠 MEDIUM |
| **M2-ONBOARD-LITE** | 신규 프로젝트 생성 시 가벼운 질문지 가이드 | 🟠 MEDIUM |
| **M2-L3-PIPE** | 노드 단위 L2→L3 파이프 최소 UX (초안·히스토리·재생성) | 🟡 HIGH |

---

### M2 완료 기준 (GATE C)

```
✓ Cursor MCP 연결 후 노드 컨텍스트 AI 응답에 반영
✓ 노드 카드 3초 드래그 재연결 동작
✓ PRD 탭 전환 시 깨짐 없음 (실시간 동기)
✓ 기능명세 셀 편집 → 저장 → xlsx 다운로드 end-to-end
✓ Mermaid 파일 정상 생성·미리보기
```

---

## § 5. M3 — 도메인 컨텍스트 강화 & 온보딩

> **출처:** v4.1 §5.0.2 전반부  
> **소요 시간:** 5~6주

### M3-DOMAIN-DICT · LAYER4 도메인 사전

| 항목 | 내용 |
|------|------|
| **기능** | LAYER4 domainDictionary 정식 구현 |
| **포함** | 커머스(재고·결제·환불), SaaS(권한·구독·감사), 부동산(임대·계약·버퍼) |
| **목표** | 도메인 없이 생성하면 "일반론적 PRD" 문제 해소 |
| **우선순위** | 🟡 HIGH |

---

### M3-RISK-DETECT · Sonnet 강제

| 항목 | 내용 |
|------|------|
| **기능** | 고위험 컨텍스트(결제·동시성·잠금) 자동 감지 → Sonnet 강제 + 사용자 알림 |
| **정책** | PRD §10.3 modelSelector (v4.1 §3) |
| **우선순위** | 🟡 HIGH |

---

### M3-FLOW-BASE · M3-FLOW-VERSION · 유저 플로

| ID | 기능 | 우선순위 |
|----|------|----------|
| **M3-FLOW-BASE** | 노드 간선 + SCREEN_LIST → Mermaid 유저 플로 자동 생성 | 🟠 MEDIUM |
| **M3-FLOW-VERSION** | 플로 버전 저장·비교 뷰 | 🟠 MEDIUM |

---

### M3 완료 기준 (GATE C)

```
✓ 커머스 도메인 아젠다 → PRD에 결제·재고 상태전이 자동 포함
✓ 신규 프로젝트 생성 60초 내 첫 PRD 생성 (WOW 경험)
✓ Sonnet 강제 아젠다(결제 포함) 시 모델 자동 전환
```

---

## § 6. M4~M5 — 파일 업로드 & 와이어프레임 (Manyfast 풀 패리티)

### 와이어프레임 개발계획 (요약)

- **트랙 A (MD·제품선):** PRD **F2-4** — `SCREEN_LIST` / `WIREFRAME_SPEC` → 저충실 MD·보내기·(선택) LLM 보강. **M2~M3**에서 뷰·출력과 함께 진행 (`v4.1` §4.0·§5.0.1).
- **트랙 B (Figma·선택):** [개발가이드-PLANNODE_WIREFRAME_DEV.md](./개발가이드-PLANNODE_WIREFRAME_DEV.md) — Phase 1 REST·Phase 2 플러그인·Phase 3 네이티브. **M4~M5** + 별도 GATE B·`TASK` NOW; 트리 캔버스와 **역할 분리**(GP-13).

### M4 · 파일 업로드 & 유저 플로

| ID | 기능 | 우선순위 |
|----|------|----------|
| **M3-ONBOARD-UPLOAD** | PDF·DOCX·MD 업로드 → 컨텍스트 추출 → 노드트리 초안 생성 | 🟡 HIGH |
| **M3-FLOW-BASE** | 간선+SCREEN_LIST → Mermaid 플로 | 🟠 MEDIUM |

---

### M5 · 와이어프레임 AI & 개발지시서

| ID | 기능 | 우선순위 |
|----|------|----------|
| **M5-WIRE-MD** | **트랙 A:** `SCREEN_LIST` → 화면별 저충실도 블록 레이아웃 MD·zip 번들 일부 | 🟡 HIGH |
| **M5-WIRE-FIGMA** | **트랙 B:** 가이드 Step 1~2 (REST·메타→Figma) — Manyfast 정합·토큰·RLS 확정 후 | 🟠 MEDIUM |
| **M5-EXPORT-BUNDLE** | PRD+명세+IA+개발지시서 zip 번들 (스택+배지 기반 구현 가이드) | 🟡 HIGH |
| **OPT-MIND-ELIXIR** | Mind Elixir 마인드맵 + PNG (선택) | 🟠 MEDIUM |

**최종 WOW:** 플랜노드 기획 → Cursor MCP 연결 → 개발 시작 원클릭 워크플로 완성

---

## § 7. 구현 진실 순위 & 하네스 규칙

### 문서 진실 순위

```
① TASK.md (NOW / DONE / GATE LOG)
② 본 마일스톤 v2.0 (§0 단계표 + §1~§6 상세)
③ plan-output.md (M2 착수 전 갱신 필수)
④ plannode-ai-logic-v4.md (참고용)
⑤ 노드트리 AI생성 자동화- 파이프라인 정밀 개발서 v1.0.md (CORE 구현 시 단일 기준)
⑥ .cursor/plans/harness-workflow_final.md — 기본·단축·GATE·복붙 규율
⑦ .cursor/harness/README.md — 하네스 폴더 운영·DB 절·워크플로 참조
⑧ AGENTS.md — 황금 원칙(GP)·트리 보호 헌장·에이전트 순서
```

### 지침·플랜 인덱스(교차 참조)

| 문서 | 경로 | 본 플랜과의 관계 |
|------|------|------------------|
| 통합 마일스톤 | 본 파일 | 단일 로드맵 |
| 하네스 워크플로 | [harness-workflow_final.md](./harness-workflow_final.md) | 기본·단축·GATE·복붙 |
| 하네스 운영 | [README.md](../harness/README.md) | TASK·plan-output·GSD_LOG 역할 |
| 제품 PRD | `.cursor/rules/plannode-prd.mdc` | M#·F#·IA/LLM 구분 |
| 규칙 폴더 인덱스 | [`.cursor/rules/README.md`](../rules/README.md) | 영역별 `.mdc` 지침 통합 목록 |
| 아키텍처 | `.cursor/rules/plannode-architecture.mdc` | 브리지·스토어·Supabase |
| 배포·인프라 | [PLANNODE_INTEGRATED_GUIDE.md](./PLANNODE_INTEGRATED_GUIDE.md) | Git·Vercel·DNS |
| 파일럿 갭 | `docs/PILOT_FUNCTIONAL_SPEC.md` | §9~§10 정합 |
| AI 제품 경계 | [plannode-ai-logic-v4.md](./plannode-ai-logic-v4.md) | M2/M3 ID·Frozen design |
| 개발서 v1.0 | [노드트리 AI생성 자동화- 파이프라인 정밀 개발서 v1.0.md](./노드트리%20AI생성%20자동화-%20파이프라인%20정밀%20개발서%20v1.0.md) | CORE 파일·순서 |
| 와이어 Figma 트랙 | [개발가이드-PLANNODE_WIREFRAME_DEV.md](./개발가이드-PLANNODE_WIREFRAME_DEV.md) | §6 트랙 B |

### NOW 작성 규칙 (TASK.md용)

```
✓ 반드시 포함: "v4.1 §5.0.1 <ID>" 또는 "H1~H4" 중 하나
✓ 금지: 표 전체 추가 (GP-12 — 범위 누수 방지)
✓ 예: "M2-MCP-01: MCP 서버 구현 — v4.1 §5.0.1"
```

### 건드리지 않는 파일 (트리 보호 헌장 · GP-13)

```
src/lib/pilot/plannodePilot.js          — 파일럿 캔버스 코어
src/lib/plannodeTreeV1.ts               — 기존 파싱 함수
src/lib/ai/badgePromptInjector.ts       — 배지 sanitize
src/lib/ai/badgeImportAliases.ts        — 동의어 매핑
src/lib/stores/projects.ts              — upsertImportedPlannodeTreeV1 내부
src/lib/pilot/pilotBridge.ts            — 브리지 내부 로직
src/routes/api/ai/messages/+server.ts   — 기존 AI 라우트
src/lib/server/anthropicMessages.ts     — Anthropic 함수 (시그니처만 확인)
```

### M2 착수 전 체크리스트

- [ ] H1~H4 모두 TASK.md에 배정 및 진행 상태 명시
- [ ] plan-output.md "§1 + TASK.md만 참조" 명시 또는 아젠다 갱신
- [ ] CORE 구현 완료 (GATE C 통과)
- [ ] 개발서 v1.0 §3~§8 모든 파일 생성 완료
- [ ] fetchAnthropicAssistantText 시그니처 확인 완료 (CORE-04)

---

## 최종 요약

| 단계 | 이름 | 소요 시간 | 상태 | 갭 분석 출처 |
|------|------|----------|------|-------------|
| **M1** | 웹 기획툴 MVP | ✅ 완료 | GATE D | v4.1 §1.1 |
| **M2-CORE** | 아젠다→트리 파이프라인 | 1~2주 | 🔴 즉시 착수 | 개발서 v1.0 §1~§8 |
| **M2** | 실행 연결성·캔버스·뷰 | 4~6주 | 대기 | v4.1 §5.0.1 |
| **M3** | 도메인·온보딩 | 5~6주 | 대기 | v4.1 §5.0.1 후반 |
| **M4~M5** | 파일업로드·와이어·개발지시서 | 10~14주 | 대기 | v4.1 §5.0.2 |

**전체 계획 기간:** 약 6개월 (CORE부터 M5 완료까지)

---

*플랜노드 통합 마일스톤 플랜 v2.0 · Cursor AI 즉시 착수용*  
*기준 문서: 노드트리 AI생성 자동화- 파이프라인 정밀 개발서 v1.0.md · ai_스택·갭_정리.plan.md · plannode-ai-logic-v4.md · [개발가이드-PLANNODE_WIREFRAME_DEV.md](./개발가이드-PLANNODE_WIREFRAME_DEV.md) (와이어 Figma 트랙) · 하네스 인덱스 [`.cursor/harness/README.md`](../harness/README.md)*  
*작성일: 2026.05 · 대상: Stephen Cconzy (PSeries)*