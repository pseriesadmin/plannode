# Plannode PRD — 노드·프로젝트 → v2.0 핵심 블록 매핑 (내부 정본)

> **제품 UI·내보내기**에는 외부 예시 서비스명을 넣지 않는다. 구현 식별자 `manyfastGuideMarkdown` 등은 역사적 이름이다.

## 설계 원칙: 영감 vs 복제

| 하지 않을 것 | 할 것 |
|--------------|--------|
| Manyfast(또는 타 서비스) PRD **원문·절 순서·카피 문장** 그대로 이식 | **구조적 힌트**만 참고(개요→가치→사용 맥락→지표→메타 등 **일반적 PRD 흐름**) |
| 블록 이름만 바꾼 **패러프레이즈** | Plannode **노드 타입·배지·부모-자식·프로젝트 필드**에 맞춘 **매핑 규칙**을 우선 |
| “예시 서비스와 동일하면 성공” | **AI 코딩에 쓸 Plannode 산출물**이 읽히고, 노드 SSoT와 **모순 없이** 동기되는지 |

**참고 문헌(팀 내부, 영감용):** [Manyfast PRD 가이드](https://docs.manyfast.io/plan/prd) — 절 구성 아이디어 중 하나일 뿐, 정본·필수 스펙이 **아님**.

**목적:** `PRD_표준작성가이드_v2.0` 상단 블록(개요·핵심 가치·타겟·시나리오·성공 지표·속성)을 Plannode **노드 트리·프로젝트 메타**에서 어떻게 채울지 **단일 정본**으로 둔다.  
**범위:** NOW-42 — 결정적 매핑만(LLM 없음). `buildPRD`·뷰 구현은 NOW-43~에서 본 표를 따른다.

**데이터 출처 (런타임):**

- **프로젝트** — [`Project`](../src/lib/supabase/client.ts): `name`, `author`, `start_date`, `end_date`, `description?`, `plan_project_id?` …
- **노드** — [`Node`](../src/lib/supabase/client.ts) / [PILOT §1.4](PILOT_FUNCTIONAL_SPEC.md): `name`, `description?`, `num?`, `badges?`, `node_type?`, `parent_id`, `depth`, `metadata?` …

---

## v2.0 핵심 블록 → Plannode 소스 (매핑 표)

| 핵심 블록 | Plannode에서 채우는 정보 | 우선 소스(필드·범위) | 비고 |
|---------------|--------------------------|----------------------|------|
| **1. 개요** — 한 줄 정의, 제품 목표, 배경 | 제품·프로젝트 한 줄 + 목표 + 배경 | `Project.name`, `Project.description`, 루트 노드(`node_type` root) `name`/`description` | 루트 설명이 비면 `Project.description`만으로 개요 블록 구성 |
| **2. 핵심 가치** — 문제, 해결, 차별점 | 기능·모듈별 가설·가치 서술 | L2~L3 노드 `module`/`feature`의 `name`+`description`, 배지(`badges`)가 USP·API 등 힌트 | 배지 [PILOT §1.4] `tdd`/`ai`/`crud`/`api`/`usp`는 PRD §1.3·기능명세 키워드와 정합 |
| **3. 타겟 및 시나리오** — 사용자, 사용 흐름 | 누가 어떤 흐름으로 쓰는지 | `Project.author`(작성자·내부 표기), `detail` 노드·하위 `description`(시나리오 문장), 트리 `toMdLine` 순서(흐름) | 외부 "페르소나" 필드는 아직 없음 → 시나리오는 **노드 description** 위주 |
| **4. 성공 지표** — KPI, 리스크, 오픈 이슈 | 측정·리스크·미결 | `risk`·`decision`류 `node_type`(확장 시), 또는 `detail`+배지 `tdd`·`usp`, 노드 `description`에 [리스크]/KPI 문장 | PRD v2 `node_type` 확장 시 본 행을 갱신 |
| **5. 속성 설정** — 카테고리, 역할, 채널 | 메타·일정·플랫폼 | `Project.start_date`/`end_date`, `node_type` 분포, 배지 분포, (향후) `plan_projects.domain` 등 DB 메타 | **웹** 기본; 멀티 채널은 프로젝트/노드 설명에 명시될 때까지 플레이스홀더 |

---

## 섹션 조립 순서 (NOW-43 `buildPRD` 정본)

1. 문서 제목 / 프로젝트 메타 (`Project.name`, 기간)  
2. **1. 개요** …  
3. **2. 핵심 가치** — 트리에서 `module`→`feature` 요약 + 배지 블록(기존 파일럿 TDD/AI 섹션과 합치거나 직후 배치)  
4. **3. 타겟 및 시나리오** — 루트·`detail` 설명 + 필요 시 `toMdLine` 요약  
5. **4. 성공 지표** — 리스크/이슈 노드·배지 기반  
6. **5. 속성** — 일정·역할(작성자)·노드 타입 요약  
7. (기존 Plannode) **기능 트리(MD)** / 배지별 강조 섹션 — **핵심 PRD 요약 절** 뒤에 둠: 구현은 [`src/lib/prdStandardV20.ts`](../src/lib/prdStandardV20.ts) `prdCoreSummaryMarkdownV20` + `buildPrdMarkdownV20` / `buildPrdViewHtmlV20`

---

## 정합 참고

- 제품 PRD: [plannode-prd.mdc](../.cursor/rules/plannode-prd.mdc) F2-2, F4-2, §10 `OutputIntent.PRD`  
- 파일럿 PRD 빌드: [PILOT §7.2](PILOT_FUNCTIONAL_SPEC.md) `buildPRD`  
- 하네스: [plan-output.md](../.cursor/harness/plan-output.md) 노드 뷰 PRD 아젠다

---

*NOW-42 산출물 · 2026-04-28*
