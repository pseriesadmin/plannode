# `.cursor/rules/` — Plannode 지침 문서 통합 인덱스

이 폴더의 **`.mdc` 규칙**은 Cursor가 컨텍스트에 주입하는 **영역별 지침**이다. 제품 범위·절차·플랜은 아래 **관련 문서**와 함께 읽는다.

| 구분 | 경로 | 용도 |
|------|------|------|
| 통합 로드맵 | [`.cursor/plans/plannode_integrated_milestone_v2.md`](../plans/plannode_integrated_milestone_v2.md) | M1~M5·CORE·H1~H4 단계별 계획 |
| 하네스 인덱스 | [`.cursor/harness/README.md`](../harness/README.md) | TASK·plan-output·문서 읽기 순서 |
| 워크플로 상세 | [`.cursor/plans/harness-workflow_final.md`](../plans/harness-workflow_final.md) | 기본·단축 · GATE · 복붙 블록 |
| 프로젝트 원칙 | [`AGENTS.md`](../../AGENTS.md) | GP·트리 보호·에이전트 순서 |
| 파일럿 정합 | [`docs/PILOT_FUNCTIONAL_SPEC.md`](../../docs/PILOT_FUNCTIONAL_SPEC.md) | §9~§10 포팅 갭 |

---

## 권장 읽기 순서 (에이전트·유지보수 공통)

1. **[plannode-core.mdc](./plannode-core.mdc)** — 스택·문서 위계·하네스 교차표·경량화 원칙(항상 적용).
2. **[plannode-prd.mdc](./plannode-prd.mdc)** — 제품 M#·F#·IA vs LLM·로드맵(항상 적용).
3. **[plannode-architecture.mdc](./plannode-architecture.mdc)** — SvelteKit·파일럿·브리지·스토어·Supabase 흐름(항상 적용).
4. 작업 성격에 따라 **UI** / **웹 스택** / **배지 파이프** / **Markdown 문서** 해당 파일만 추가로 연다.

---

## 주제별 빠른 참조 (어떤 지침을 열까)

아래는 **기능·증상 키워드 → 단일 `.mdc`** 로 바로 가기 위한 인덱스다. 세부 절 번호는 각 파일 목차를 본다.

| 찾는 주제 | 열 파일 | 힌트 |
|-----------|---------|------|
| PRD·Phase·IA vs LLM·F# 근거 | [plannode-prd.mdc](./plannode-prd.mdc) | M#·F#·§10 |
| 파일럿·브리지·스토어·동기화 파이프 | [plannode-architecture.mdc](./plannode-architecture.mdc) | §10 노드 CRUD·번들, **`PRESENCE_PEER_MERGE` / §5.1** |
| 트리 보호·하네스·GP·경량화 | [plannode-core.mdc](./plannode-core.mdc) | 하네스 교차표·파일럿 갭 |
| 색·타이포·모달·칩 시각 | [plannode-ui-identity.mdc](./plannode-ui-identity.mdc) | 배지 **표시** 토큰만; 매핑 로직은 배지 문서 |
| Vite·DOM id·Vanilla/Svelte 경계 | [plannode-web.mdc](./plannode-web.mdc) | 와이어 싱크 id |
| 배지 풀·가져오기·추론 순서 1→4·localStorage 학습·**파일럿 카드/모달 게이트** | [plannode-badge-mapping.mdc](./plannode-badge-mapping.mdc) | **§6** 파일럿 추론 조건, **§6.8** 저장≠카드 원인규명 |
| Markdown·README 편집 규약 | [plannode-docs.mdc](./plannode-docs.mdc) | 통합 가이드 단일 진입 |

---

## 영역별 인덱스

### 1. 핵심·진입 (항상 참조)

| 파일 | 설명 | Cursor |
|------|------|--------|
| [plannode-core.mdc](./plannode-core.mdc) | 프로젝트 컨텍스트, 규칙 간 링크, 하네스·파일럿 갭, 경량화 | `alwaysApply: true` |

### 2. 제품·요구사항

| 파일 | 설명 | Cursor |
|------|------|--------|
| [plannode-prd.mdc](./plannode-prd.mdc) | PRD v1.2 — M/F·Phase·IA·와이어 vs F2-5 LLM·§10~§11 DB | `alwaysApply: true` |

### 3. 구현·아키텍처

| 파일 | 설명 | Cursor |
|------|------|--------|
| [plannode-architecture.mdc](./plannode-architecture.mdc) | 계층·`pilotBridge`·스토어·Supabase·와이어 싱크 id·**§5.1 「원격선택-null」/`PRESENCE_PEER_MERGE`** | `alwaysApply: true` |

### 4. UI·프론트엔드

| 파일 | 설명 | Cursor |
|------|------|--------|
| [plannode-ui-identity.mdc](./plannode-ui-identity.mdc) | 색·타이포·레이어·모달·배지 시각 패턴 | `alwaysApply: false` · `**/*.{svelte,css,html}` |
| [plannode-web.mdc](./plannode-web.mdc) | Vanilla 파일럿 + SvelteKit/Vite·`VITE_*`·DOM id | `alwaysApply: false` · `**/*.{html,js,svelte,ts}` |

### 5. 도메인 특화 (가져오기·배지)

| 파일 | 설명 | Cursor |
|------|------|--------|
| [plannode-badge-mapping.mdc](./plannode-badge-mapping.mdc) | **표준 풀 매핑**(§0)·가져오기 파이프·추론 1→4·localStorage·**§6 파일럿 노드카드/모달 `inferHints` 게이트**·**§6.8 원인규명 트리북** | `alwaysApply: false` — globs: `src/lib/ai/**`, `plannodeTreeV1`, `projects`, `plannodePilot.js`, `+page.svelte` 등 |

### 6. 문서·Markdown

| 파일 | 설명 | Cursor |
|------|------|--------|
| [plannode-docs.mdc](./plannode-docs.mdc) | Markdown·README 유지보수, 통합 가이드 단일 진입 | `alwaysApply: false` · `**/*.md` |

---

## 전체 파일 요약 표

| 파일 | 영역 | alwaysApply | 비고 |
|------|------|:-------------:|------|
| `plannode-core.mdc` | 핵심 | 예 | 다른 규칙으로 들어가는 허브 |
| `plannode-prd.mdc` | 제품 | 예 | TASK·plan-output의 PRD: 한 줄 근거 |
| `plannode-architecture.mdc` | 아키텍처 | 예 | 트리 SSoT·파일럿 계약·**§5.1 `PRESENCE_PEER_MERGE` / 「원격선택-null」** |
| `plannode-ui-identity.mdc` | UI | 아니오 | Svelte/CSS/HTML 편집 시 |
| `plannode-web.mdc` | 스택 | 아니오 | HTML/JS/Svelte/TS |
| `plannode-badge-mapping.mdc` | 배지 | 아니오 | 표준 풀·가져오기·**§6 파일럿 게이트·§6.8 트리북** (`plannodePilot.js` glob 포함) |
| `plannode-docs.mdc` | 문서 | 아니오 | `.md` 편집 시 |

---

## 갱신 시

- **신규 `.mdc` 추가** 시 본 `README.md`의 해당 **영역 절**과 **전체 요약 표**에 한 줄 추가한다.
- 규칙 파일 frontmatter(`description`, `alwaysApply`, `globs`)가 바뀌면 표를 맞춘다.
- 제품 Phase·로드맵 변경은 **`plannode-prd.mdc`** 및 [통합 마일스톤](../plans/plannode_integrated_milestone_v2.md)을 우선 갱신한다.

---

*Plannode `.cursor/rules/` 인덱스 · 유지보수용*
