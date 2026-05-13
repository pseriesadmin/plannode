---
name: Plannode 하네스 워크플로우 — 최종 가이드라인
overview: 하네스 복붙(기본·단축) + GATE E·커밋. §3은 `.cursor/rules` 첨부만(하네스 비사용).
---

# Plannode 하네스 워크플로우

**항상:** GATE 👤 · `TASK.md` GATE LOG 🤖 · **git** 👤만 · Step4=`@harness-executor` · Step5=`@qa` · **GATE E** 👤 · 커밋 전 **`커밋 허가`** · 상세 **`AGENTS.md`**.

**§1·§2·§4·아래 QA** = Harness(`TASK`·plan-output·GATE). **§3** = 하네스 아님 — `@.cursor/rules/*.mdc` `@` + 스코프만.

| 표기 | 뜻 |
|------|-----|
| **G** | 그대로 복붙 |
| **R** | `[대괄호]` 만 변경 |
| **W** | 본인이 채움 |

## 한눈에

**경로**

```
기본: Step1 → Step2 → GATE A → Step3 → GATE B → (Step4 ↔ GATE C)×N → GATE D → Step5 → GATE E → 커밋①② → 👤 git
단축: Step1(아젠다+TASK) → GATE B → (Step4 ↔ GATE C)×N → GATE D → Step5 → GATE E → 커밋①② → 👤 git
```

**규칙만(부록 §3):** `@.cursor/rules` + 스코프 → Agent · TASK·GATE·에이전트 복붙 **없음**

| 고르기 | 조건 |
|--------|------|
| **기본** | DB·RLS·스토어/파일럿 다건·4파일+·복수 목적·PRD 큰 덩어리 등 **하나라도** |
| **단축** | 위 **전부 아님** + 단일 목적·소수 파일 · `@promptor`/plan-output/GATE A **생략** |
| **애매** | **기본** |
| **§3** | 소규모·파일 고정·`.cursor/rules`로 범위 가능 — 하네스 안 염 |

단축 `TASK.md` 첫 줄: `단축 경로: step2·GATE A 생략`

**부가:** 건별 개발 완료 시 릴리스 노트 갱신용 **채팅 복붙**은 [부가 — 건별 릴리스 노트](#release-note-per-item).

**Cursor:** Ask/Plan/Agent = UI 모드. GATE A·C·D·커밋 전 메시지는 **Agent** 권장. 표에서 **범위 한 줄 ○**면 같은 메시지 끝에 아래 한 줄.

<a id="gate-scope-line"></a>

```text
허용: TASK.md GATE LOG(이 단계 산출물)만. src·구현·커밋 금지.
```

<a id="paste-cheatsheet"></a><a id="paste-basic"></a>

---

# 1. 기본모드

plan-output · GATE A · Step3 후 Step4.

## 표 · 복붙

○ = 위 [범위 한 줄](#gate-scope-line) 같이.

| # | 단계 | 모드 | ○ | 복붙 | 금지 |
|---|------|------|---|------|------|
| 1 | Step1 | Ask/Agent | — | [B-01](#basic-b01) | `@promptor` `@harness-executor` 구현 |
| 2 | Step2 | Agent | — | [B-02](#basic-b02) | 코드·커밋·TASK 직접 |
| 3 | GATE A 승인 | Agent | ○ | `GATE A 승인. Step3로 TASK.md 작성 진행.` | Step4·커밋 직행 |
| 4 | GATE A 수정 | Agent | ○ | `GATE A 수정: … plan-output 갱신해.` | |
| 5 | GATE A 반려 | Agent | ○ | `GATE A 반려. Step2부터. 아젠다: …` | Step3 진행 |
| 6 | Step3 | Agent | — | [B-04-A](#basic-b04a) | 코드 |
| 7 | Step3 | Plan | — | [B-04-P](#basic-b04p) | |
| 8 | GATE B 승인 | Agent | — | [B-05](#basic-b05) | 커밋·`@qa` 직행 |
| 9 | GATE B 수정 | Agent | ○ | `GATE B: TASK.md 내가 고쳤어. 순서만 확인해.` | |
| 10 | GATE B 반려 | Agent | ○ | `GATE B 반려. Step3 재실행. 이유: …` | Step4 직행 |
| 11 | 모델 전환 | — | — | `채팅 모델 Sonnet(또는 제품 권장)으로 바꿈. Step4 진행.` | |
| 12 | Step4 | Agent | — | [B-06](#basic-b06) | NOW 여러 개 한 번에 |
| 13 | GATE C | Agent | ○ | [B-07](#basic-b07) | |
| 14 | GATE D | Agent | ○ | [B-08](#basic-b08) | |
| 15 | Step5 | Agent | — | [B-09](#basic-b09) | AI에게 git |
| 16 | GATE E | Agent | ○ | 채팅 **①** `GATE E 승인.` ([B-0E](#basic-b0e)) → **②**(선택) 릴리스 [B-0E-R](#basic-b0er) | GATE E 없이 커밋 |
| 17 | 커밋 | Agent | ○ | [B-10](#basic-b10) | |

Step4~GATE C 루프 = 각 NOW마다 반복.

## 원문

<a id="basic-b01"></a>**B-01** Step1 · W

```text
목표: …
범위 밖: …
PRD: M# F#-#(또는 생략)
참고:
```

<a id="basic-b02"></a>**B-02** Step2

```text
@promptor 위 아젠다로 분석하고 `.cursor/harness/plan-output.md`에 저장. PRD 연계(§) 포함. **코드·커밋 금지.** — 에이전트: `.cursor/agents/promptor.md`
```

<a id="basic-b04a"></a>**B-04-A** Step3 Agent

```text
.cursor/harness/plan-output.md(GATE A 확정분)만 읽고 .cursor/harness/TASK.md를 NOW/DONE 형태로만 채워. NOW는 30분 단위. PRD: 줄 유지. src·구현·커밋 금지.
```

<a id="basic-b04p"></a>**B-04-P** Step3 Plan

```text
Plan Mode: plan-output.md(GATE A 확정)를 입력으로 TASK.md를 NOW/DONE으로 채울 계획을 세우고, 확정 후 저장. src·구현 금지.
```

<a id="basic-b05"></a>**B-05** GATE B

```text
GATE B 승인. @harness-executor 로 .cursor/harness/TASK.md 현재 NOW만.
```

<a id="basic-b06"></a>**B-06** Step4

```text
@harness-executor `.cursor/harness/TASK.md` **현재 NOW만**. 요청한 파일·섹션만 수정하고 범위 밖 구현 금지. 끝나면 TASK·GSD_LOG·한 줄 요약. — `.cursor/agents/harness-executor.md`
```

<a id="basic-b07"></a>**B-07** GATE C

```text
GATE C 승인. 다음 NOW.
```

```text
GATE C 승인. 전부 끝. GATE D로.
```

<a id="basic-b08"></a>**B-08** GATE D

```text
GATE D 승인. @qa 검수 진행.
```

```text
변경 파일: [경로…]
```

```text
TASK.md·아젠다 목표 기준으로 PASS / CONDITIONAL / FAIL 판정.
```

<a id="basic-b09"></a>**B-09** Step5 · R

```text
@qa 변경 파일: [경로1] [경로2] 절차: .cursor/agents/qa.md TASK·plan-output·plannode-prd(해당 시)
```

<a id="basic-b0e"></a>**B-0E** GATE E · 👤

```text
GATE E 승인.
```

`@qa` 이후 · 터미널 커밋 직전 **최종 확인** (`AGENTS.md` GATE E → 커밋 허가 → git).

<a id="basic-b0er"></a>**B-0E-R** 릴리스 노트 (`plannodeUpdateLog.ts`) · 기본·단축 **공통** · 선택

**터미널** (프로젝트 루트 · `id` 가 이미 있으면 `--id` 만 바꿔서 실행):

```text
npm run gate-e-release -- --title "…" --body "본문 한 줄 또는 줄바꿈은 \\n" --at 2026-05-07 --id feature-xyz-2026-05-07
```

**Agent** (파일 직접 편집):

```text
`src/lib/plannodeUpdateLog.ts` 의 `PLANNODE_UPDATE_LOG` 배열 **맨 앞**에 항목 추가. 기존 항목과 동일 포맷 · **같은 id 중복 금지**.

- id: feature-xyz-2026-05-07
- at: 2026-05-07
- title: …
- body: (아래)

본문:


```

**저장소 대조 (문서와 코드 일치 확인)**

| 무엇 | 어디서 보나 |
|------|-------------|
| `npm run gate-e-release` 정의 | 저장소 루트 `package.json` → `"gate-e-release"` |
| 스크립트 본체·옵션·기본 id·**같은 id 이미 있으면 종료(exit 1)** | `scripts/gate-e-release-note.mjs` |
| 앱 Release 노트 소스 배열 | `src/lib/plannodeUpdateLog.ts` → `export const PLANNODE_UPDATE_LOG` |
| GATE E → 커밋 허가 순서 | 루트 `AGENTS.md` 에이전트 순서 표 |

<a id="release-note-per-item"></a>**부가 — 건별 개발 완료 시 릴리스 노트(Release note)** · 채팅 복붙

앱 캔버스 하단 **Release** → 모달 **Release note** 목록은 `src/lib/plannodeUpdateLog.ts`의 `PLANNODE_UPDATE_LOG`(맨 앞이 최신)가 정본이다. **기능 한 건이 끝날 때마다** 아래 **G** 블록을 Agent에 붙여 넣고, 표기 **[R]** 자리만 바꾼다(본문은 **W**). **GATE E와 무관**하게 써도 됨(작은 완료마다 갱신). 범위는 통상 그 파일 한 개 — [범위 한 줄](#gate-scope-line)을 같이 붙이면 안전.

**G** 표준(필드 전부 명시)

```text
src/lib/plannodeUpdateLog.ts 의 PLANNODE_UPDATE_LOG 배열 **맨 앞**에 항목 하나 추가해줘.

- id: [영문-슬러그-YYYY-MM-DD]
- at: [YYYY-MM-DD]
- title: [모달 카드에 보일 한 줄 제목]
- body: 아래 그대로 본문에 넣어줘.

---
[W 여기에 기능 보완 설명. bullet이면 줄바꿈으로]
---

끝나면 `npm run build` 한 번만 확인해줘.
```

**G** 짧은 버전(설명은 바로 위 채팅에 써 둔 경우)

```text
릴리스 노트에 한 줄 추가: `plannodeUpdateLog.ts` → id `[slug-날짜]`, at `[날짜]`, title `[제목]`, body는 내가 이 메시지 위에 쓴 설명 그대로.
```

**G** 범위 고정 + 한 줄

```text
허용: src/lib/plannodeUpdateLog.ts 만. 다른 파일·커밋은 하지 마.

PLANNODE_UPDATE_LOG 맨 앞에 추가: id / at / title / body = [각각 채움]
```

**R** 터미널로 넣을 때는 [B-0E-R](#basic-b0er)의 `npm run gate-e-release` 블록과 동일 계열.

<a id="basic-b10"></a>**B-10** 커밋

```text
커밋 메시지 제안해줘
```

```text
커밋 허가
```

→ 👤 `git add` / `git commit`

---

<a id="paste-short"></a>

# 2. 단축모드

Step2 · plan-output · GATE A · 별도 Step3 **없음**.

## 표 · 복붙

[§1 표 읽는 법](#1-기본모드) 동일 · Step4~GATE D는 §1과 동일 · Step5~GATE E~커밋은 [B-09](#basic-b09)·[B-0E](#basic-b0e)·(선택)[B-0E-R](#basic-b0er)·[B-10](#basic-b10) · **건별 릴리스 노트만** [부가 — 건별](#release-note-per-item).

| # | 단계 | 모드 | ○ | 복붙 | 금지 |
|---|------|------|---|------|------|
| 1 | Step1 | Plan/Agent | — | [단축 Step1](#short-step1) | `@promptor` plan-output GATE A |
| 2 | GATE B 승인 | Agent | — | `GATE B 승인. @harness-executor로 .cursor/harness/TASK.md 현재 NOW만.` | |
| 3 | GATE B 수정 | Agent | ○ | `GATE B: TASK.md 내가 고쳤어. 순서만 확인해.` | |
| 4 | GATE B 반려 | Agent | ○ | `GATE B 반려. Step1 TASK 재작성. 이유: …` | Step4 직행 |
| 5 | 모델 전환 | — | — | §1 행 11과 동일 | |
| 6 | Step4 | Agent | — | [B-06](#basic-b06) | |
| 7 | GATE C 중간 | Agent | ○ | `GATE C 승인. 다음 NOW.` | |
| 8 | GATE C 끝 | Agent | ○ | `GATE C 승인. 전부 끝. GATE D로.` | |
| 9 | GATE D | Agent | ○ | [B-08](#basic-b08) | |
| 10 | Step5 | Agent | — | [B-09](#basic-b09) | |
| 11 | GATE E | Agent | ○ | 채팅 **①** `GATE E 승인.` ([B-0E](#basic-b0e)) → **②**(선택) 릴리스 [B-0E-R](#basic-b0er) | B-10 없이 커밋 |
| 12 | 커밋 | Agent | ○ | [B-10](#basic-b10) | |

<a id="short-step1"></a>**단축 Step1**

```text
아젠다:
목표: …
범위 밖: …
PRD: M# F#-#(또는 생략)
참고:

위 아젠다만 반영해 `.cursor/harness/TASK.md`를 NOW/DONE 형태로 작성해. 파일 상단 첫 줄은 반드시 `단축 경로: step2·GATE A 생략`. NOW는 30분 단위. 각 NOW에 PRD: 한 줄 있으면 유지. src·구현·커밋 금지. — `.cursor/agents/harness-executor.md` 와 TASK 형식 정합.
```

---

<a id="paste-atomic"></a><a id="3-단건-모드"></a><a id="3-부록--단건-cursorrules-규칙-첨부"></a>

# 3. 부록 — `.cursor/rules` 단건

Harness 아님 · `@promptor`·TASK·GATE·`@harness-executor`·`@qa` **안 씀**.

**순서:** 아래 스코프 → `@` 한 줄(표) → (화면이면 추가 한 줄) → 작업/파일/범위 밖.

```text
요청한 파일·섹션만 수정. 다른 컴포넌트·전역 스타일·파일럿 DOM id 변경 금지.
```

| 작업 | `@` |
|------|-----|
| 단순 UI | `plannode-ui-identity.mdc` `plannode-core.mdc` |
| UI 파일 로직(+page·파일럿) | `plannode-web.mdc` `plannode-architecture.mdc` |
| 스토어·브리지 | `plannode-architecture.mdc` `plannode-core.mdc` |
| 배지·가져오기·트리 텍스트 | `plannode-badge-mapping.mdc` `plannode-core.mdc` |
| 문서 `.md`만 | `plannode-docs.mdc` |

경로는 모두 `@.cursor/rules/…` 붙임. 배지 안 건드리면 badge-mapping 생략 · 중복 `@` 금지.

화면 손댈 때만:

```text
UI는 plannode-ui-identity 준수. 트리·캔버스는 plannode-architecture·GP-13.
```

```text
작업: …
파일: …
범위 밖: …
```

---

# 4. 단축 → 기본

`단축 중단. 기본모드로 전환. plan-output·GATE A부터 다시 진행.`  
(TDD·고위험·DB·RLS·스토어 계약 등 나오면)

---

<a id="qa-paste"></a>

## QA·재작업

```text
# @harness-executor .cursor/harness/TASK.md QA FAIL이 난 NOW만 재구현. 아래 QA 지적만 반영. 범위 밖 구현 금지. 끝나면 TASK·GSD_LOG·한 줄 요약.

QA 지적:


```

```text
# GATE B 소급 요청. 동일 NOW 기준 QA FAIL이 3회입니다. .cursor/harness/TASK.md에서 해당 NOW를 재분해해줘.
```

```text
.cursor/harness/TASK.md 의 BACKLOG에 아래 한 줄을 추가해줘.

CONDITIONAL:


```

```text
# @harness-executor .cursor/harness/TASK.md 현재 미완료 NOW만. 이전 스레드 맥락은 무시. 범위 밖 구현 금지. 끝나면 TASK·GSD_LOG·한 줄 요약.
```

---

| 참고 | |
|------|---|
| `AGENTS.md` | GP·순서 |
| `.cursor/harness/TASK.md` | NOW |
| `.cursor/harness/plan-output.md` | @promptor |
