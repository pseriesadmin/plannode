# `.cursor/rules/` — Plannode `.mdc` 지침 통합 인덱스

이 폴더의 **`.mdc` 규칙**은 Cursor가 컨텍스트에 주입하는 **영역별 지침**이다.  
**본 README = `.mdc` 빠른 인덱싱 정본** (~~`plannode-docs.mdc`~~ 2026-06-04 삭제).

**Plannode 제품 포지션:** **상용 웹앱 개발계획 협업 서비스** — [`plannode-prd.mdc`](./plannode-prd.mdc) **§1.05~§1.06** (에이전트: 협업·동기화를 “1인용 미니멀”로 축소하지 말 것).

제품 범위·절차·플랜은 아래 **관련 문서**와 함께 읽는다.

| 구분 | 경로 | 용도 |
|------|------|------|
| 통합 로드맵 | [`.cursor/plans/plannode_integrated_milestone_v3.md`](../plans/plannode_integrated_milestone_v3.md) | M1~M5·CORE·H1~H4 단계별 계획 |
| 하네스 인덱스 | [`.cursor/harness/README.md`](../harness/README.md) | TASK·plan-output·문서 읽기 순서 |
| 워크플로 상세 | [`.cursor/plans/harness-workflow_final.md`](../plans/harness-workflow_final.md) | 기본·단축 · GATE · 복붙 블록 |
| 프로젝트 원칙 | [`AGENTS.md`](../../AGENTS.md) | GP·트리 보호·에이전트 순서 |
| 배포·인프라 | [`.cursor/plans/PLANNODE_INTEGRATED_GUIDE.md`](../plans/PLANNODE_INTEGRATED_GUIDE.md) | Git·Supabase·Vercel·DNS **단일 진입** |
| 파일럿 정합 | [`docs/PILOT_FUNCTIONAL_SPEC.md`](../../docs/PILOT_FUNCTIONAL_SPEC.md) | §9~§10 포팅 갭 |

---

## `.mdc` 전체 빠른 인덱스 (6개)

| # | 파일 | alwaysApply | globs (요약) | 한 줄 역할 | 주요 절·검색 태그 |
|---|------|:-----------:|--------------|------------|------------------|
| 1 | [plannode-core.mdc](./plannode-core.mdc) | **예** | — | 진입·스택·트리 보호·하네스·경량화 vs 협업 | 하네스 교차표 · GP-13 · 파일럿 갭 |
| 2 | [plannode-prd.mdc](./plannode-prd.mdc) | **예** | — | 제품 진실 M#·F#·Phase·IA≠LLM·§10~§11 | **§1.05~§1.06** · M5 · F2-4/F2-5 |
| 3 | [plannode-architecture.mdc](./plannode-architecture.mdc) | **예** | — | SvelteKit·파일럿·브리지·Supabase·동기 **정본** | **§10** 번들·슬라이스 · **§5.1** `PRESENCE_PEER_MERGE` · §10.10 모달 · **§10.10.1** `BADGE_STRUCTURE_OPS` · §10.11 RPC |
| 4 | [plannode-ui-identity.mdc](./plannode-ui-identity.mdc) | 아니오 | `**/*.{svelte,css,html}` | 색·타이포·레이어·모달·배지 **시각** | 배지 표시 토큰만 — 로직은 #5 |
| 5 | [plannode-web.mdc](./plannode-web.mdc) | 아니오 | `**/*.{html,js,svelte,ts}` | Vanilla 파일럿 + Vite·DOM id·와이어 싱크 | `#BFT` `#BAR` 등 숨은 버튼 id |
| 6 | [plannode-badge-mapping.mdc](./plannode-badge-mapping.mdc) | 아니오 | `src/lib/ai/**`, `plannodeTreeV1`, `projects`, `plannodePilot.js`, `+page.svelte` | 배지 풀·가져오기·추론 1→4·파일럿 카드 게이트 | **§6** · **§6.8** 트리북 |

---

## 주제별 빠른 참조 (키워드 → `.mdc`)

| 찾는 주제·증상 | 열 파일 | 힌트 |
|----------------|---------|------|
| 무엇을 만들지·M5·상용 협업 포지션 | [plannode-prd.mdc](./plannode-prd.mdc) | §1.05~§1.06 · M#·F# |
| 트리·줌·간선·`parent_id`·파일럿 DOM | [plannode-architecture.mdc](./plannode-architecture.mdc) · [plannode-core.mdc](./plannode-core.mdc) | GP-13 · §3 브리지 |
| 클라우드·번들·슬라이스·revision·structure_ops | [plannode-architecture.mdc](./plannode-architecture.mdc) | **§10** · `COLLAB_RPC_REVISION` |
| 공유자 Presence·`selected_node_id` null | [plannode-architecture.mdc](./plannode-architecture.mdc) | **§5.1** · `PRESENCE_PEER_MERGE` |
| 모달 편집 중 pull·상대 노드 안 보임 | [plannode-architecture.mdc](./plannode-architecture.mdc) | **§10.10** · `MODAL_EDIT_HYDRATE_DEFER` |
| 공유 프로젝트 배지·칩 동기·카드/칩 불일치 | [plannode-architecture.mdc](./plannode-architecture.mdc) · [plannode-badge-mapping.mdc](./plannode-badge-mapping.mdc) | **§10.10.1** · `BADGE_STRUCTURE_OPS` · §6.9 |
| 하네스·GATE·경량화·오버엔지니어링 | [plannode-core.mdc](./plannode-core.mdc) · [AGENTS.md](../../AGENTS.md) | GP-12 · GP-14 |
| UI 색·모달·칩·릴리스 행 | [plannode-ui-identity.mdc](./plannode-ui-identity.mdc) | §5 캔버스 하단 |
| `index.html`·`plannode.js`·Vite·환경변수 | [plannode-web.mdc](./plannode-web.mdc) | `VITE_*` |
| 배지·가져오기·학습·노드카드 추론 | [plannode-badge-mapping.mdc](./plannode-badge-mapping.mdc) | §0 풀 · §6.8 |
| **`.md`·README·문서만 편집** | **본 README** §「Markdown·README」 | 통합 가이드·§10·README 목록 갱신 |

---

## 권장 읽기 순서 (에이전트·유지보수)

1. **[plannode-core.mdc](./plannode-core.mdc)** — 스택·하네스·트리 보호·경량화(항상 적용).
2. **[plannode-prd.mdc](./plannode-prd.mdc)** — 상용 협업·M/F·로드맵(항상 적용).
3. **[plannode-architecture.mdc](./plannode-architecture.mdc)** — 구현·동기·협업(항상 적용).
4. 작업에 따라 **#4 UI** / **#5 웹** / **#6 배지** 중 해당 `.mdc`만 추가.

---

## 영역별 상세 (파일별)

### 1. [plannode-core.mdc](./plannode-core.mdc) — 핵심·진입

| 항목 | 내용 |
|------|------|
| **Cursor** | `alwaysApply: true` |
| **역할** | 저장소 진입·표준 구조 표·하네스 파일 맵·파일럿 갭·유지보수 범위 |
| **다음에 열 문서** | [본 README](./README.md) · [plannode-prd](./plannode-prd.mdc) · [plannode-architecture](./plannode-architecture.mdc) |

### 2. [plannode-prd.mdc](./plannode-prd.mdc) — 제품·요구사항

| 항목 | 내용 |
|------|------|
| **Cursor** | `alwaysApply: true` |
| **역할** | PRD v1.4 — M1~M6, F#-#, IA(정보 구조) vs F2-5 LLM, §10 4-레이어, §11 DB 목표 |
| **하네스** | `plan-output.md`·`TASK.md`에 **PRD:** 한 줄 |

### 3. [plannode-architecture.mdc](./plannode-architecture.mdc) — 구현·아키텍처

| 항목 | 내용 |
|------|------|
| **Cursor** | `alwaysApply: true` |
| **역할** | 계층·`pilotBridge`·스토어·Supabase·와이어 싱크·**§10 동기 정본** |
| **핵심 절** | §3 브리지 · §5.1 Presence · §6 숨은 버튼 · §10~§10.12 협업·RPC |

### 4. [plannode-ui-identity.mdc](./plannode-ui-identity.mdc) — UI

| 항목 | 내용 |
|------|------|
| **Cursor** | `alwaysApply: false` · `**/*.{svelte,css,html}` |
| **역할** | 브랜드 색·타이포·z-index·모달·배지 칩 **표시** (매핑 로직은 badge-mapping) |

### 5. [plannode-web.mdc](./plannode-web.mdc) — 프론트 스택

| 항목 | 내용 |
|------|------|
| **Cursor** | `alwaysApply: false` · `**/*.{html,js,svelte,ts}` |
| **역할** | Vanilla 파일럿 + SvelteKit/Vite 경계·DOM id 계약 |

### 6. [plannode-badge-mapping.mdc](./plannode-badge-mapping.mdc) — 배지·가져오기

| 항목 | 내용 |
|------|------|
| **Cursor** | `alwaysApply: false` · globs: `src/lib/ai/**`, `plannodeTreeV1.ts`, `projects.ts`, `plannodePilot.js`, `+page.svelte` |
| **역할** | 표준 배지 풀·가져오기 파이프·추론 1→4·localStorage 학습·파일럿 `inferHints` 게이트 |

---

## Markdown·README 편집 시 (구 `plannode-docs.mdc` 통합)

`.md` 파일만 다룰 때는 **별도 `.mdc` 없이** 아래만 따른다.

| 규칙 | 정본 |
|------|------|
| 제품 라벨·M/F | [plannode-prd.mdc](./plannode-prd.mdc) §1.05 |
| 클라우드·협업 동기 문서 | [plannode-architecture.mdc](./plannode-architecture.mdc) **§10** — ~~`docs/plannode_workspace_sync_overview.md`~~ 제거됨 |
| Git·Supabase·Vercel·DNS | [PLANNODE_INTEGRATED_GUIDE.md](../plans/PLANNODE_INTEGRATED_GUIDE.md) **단일 진입** |
| `.mdc` 목록·주제 인덱스 | **본 README** |
| 루트 문서 트리 | [`README.md`](../../README.md) — `docs/`·`.cursor/` 추가·이동 시 **파일 구조 목록 갱신** |
| 하네스·GATE | [harness/README.md](../harness/README.md) · [AGENTS.md](../../AGENTS.md) |

동기·협업 **신규 개요 md**를 `docs/`에 또 만들지 않는다 — 내용은 **architecture §10** 또는 PRD에 반영.

---

## 갱신 시

- **신규 `.mdc` 추가** → 본 README **「전체 빠른 인덱스」**·**「주제별 빠른 참조」**·**「영역별 상세」**에 한 줄씩 추가.
- frontmatter(`description`, `alwaysApply`, `globs`) 변경 시 표를 맞춘다.
- Phase·로드맵 → **`plannode-prd.mdc`** · [통합 마일스톤](../plans/plannode_integrated_milestone_v3.md) 우선.

---

*Plannode `.cursor/rules/` · 6× `.mdc` + 본 인덱스*
