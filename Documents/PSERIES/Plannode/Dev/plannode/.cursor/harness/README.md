# .cursor/harness/ — Plannode 하네스 운영 헌법

> 이 폴더는 **인간 게이트용 산출물**과 **운영 원칙**을 보관한다.
> AI 에이전트 정의 파일은 `.cursor/agents/`에 있다.

> **현재(2026-04-26):** [TASK.md](TASK.md) 기준 **M1 Step3·GATE A~D 마감** 유지 · **별행:** 뷰·출력 재정립 — 👤 **GATE A(뷰·출력) ✓** · 코드 착수는 👤 **GATE B(M2-뷰출력)** 후 `NOW-M2VO-*`. 제품 후속은 v4 **§1.2**·BACKLOG-M1·BACKLOG-M2-뷰출력.

---

## PRD(제품)와 하네스(절차)의 연계

- **제품 기준(단일 진실)**: `.cursor/rules/plannode-prd.mdc` — 모듈 M#·기능 F#-#, MVP/Phase(§6), IA/와이어(F2-4, F4-3/4-4) vs LLM(F2-5, §10), v2 DB(§11) 등.
- **하네스 산출물**은 PRD의 **이번 사이클에 해당하는 조각**을 구현·검수한다.
  - `plan-output.md`: **PRD 연계** 섹션에 M#·F#-# (필요 시 PRD 절 §) + **이번에 제외하는 Phase/기능**을 명시.
  - `TASK.md`: `현재 아젠다`와 각 NOW에 `| PRD: M# F#-#` 한 줄(또는 `해당 없음: 인프라/버그만`).
- **파일럿 정합**은 `docs/PILOT_FUNCTIONAL_SPEC.md` — PRD에 없는 “Vanilla vs SvelteKit 갭”은 §9~§10이 우선, PRD F·Phase와 **모순**이 있으면 GATE A/B 전에 정리.
- **상세 TypeScript/AI·4-레이어**는 PRD가 가리키는 `plannode-ai-enhancement-v3.md` 등과 **PRD·TASK**를 맞출 것.
- **트리뷰 핵심 보호:** `AGENTS.md` **GP-13**·**「트리뷰 핵심 보호 헌장」** — 하네스 NOW가 파일럿·`#V-TREE`·`pilotBridge`·노드 스토어를 건드리면 **트리 회귀**를 TASK·GATE C에 명시한다. 부가 뷰 전용 작업도 **캔버스 가림·SSoT 분열·`.view` 전환 파손**을 금지한다.

## 최소 구현·기술부채·경량화 (하네스 전역)

- **오버 엔지니어링 견제:** `plan-output`·`TASK` **포함/제외**·PRD M#·F#·Phase를 넘는 **불필요한 로직**·**범용 뼈대**·PRD 밖 v2/LLM 파이프 **선제** — 금지(GP-7·GP-12·`@promptor` P-6.5).
- **메뉴·출력 면 = `plan-output`·§4.0 고정:** `TASK` NOW ID·v4 `M2-*`·BACKLOG는 **후보**일 뿐, **상단/출력/보기에 항목을 추가하는 허가가 아님**. 신규 면 조각은 👤 채팅 또는 GATE B 보완 + `plan-output` 반영 후에만 구현. 체크리스트·사례: [harness-workflow_final.md §경량화 제어 — 「면(메뉴·출력) — 플랜 후보와 UI 분리」](../plans/harness-workflow_final.md).
- **모듈·파일 수 억제:** “한 번 더 감싸는” 레이어, **PRD·TASK에 이름 없는** `src/lib/...` 신규 모듈 — **가능한 한 기존 파일에** 붙이거나 `BACKLOG`+승인 후. 동일 UX는 **최소 import 경로** 유지.
- **기술부채:** `console.log`/TODO/any/미사용 import/무분별 의존성은 **@qa 2단계**에서 잡는다. `npm` 신규 패키지·스키마 컬럼·공개 API는 `TASK`·GATE B 없이 **불가**.
- **제어 구조(요지):** `AGENTS.md` 표 **경량화·오버엔지니어링 견제 제어 구조** = 스캐폴드가 아니라 **GATE + 스코프 + NOW 크기 + @qa** 의 다층 차단. 상세: `.cursor/plans/harness-workflow_final.md` **「경량화 제어」** 절.
- **Guides vs Sensors (외부 권고·정합):** *Guides(사전)* = `AGENTS`·`plan-output`·PRD·`@promptor` (행동 유도). *Sensors(사후)* = `npm run build`·`@qa`·린트 (깨짐/부채 검출). **불필요한 복잡도·“멋진” 일반화**는 센서만으론 부족하므로 **포함/제외·GATE**가 1차 방어 — `harness-workflow_final.md` **「외부 하네스·오버엔지니어링」** 절.
- **층·툴 최소:** 하네스 전용 **문서·GATE·에이전트** 층을 “부작위 방지”만으로 **무한 증가**시키지 않는다(신규 체크리스트·sub-agent = **의무 정당화** 없으면 넣지 않음).
- **노드 수·캔버스 부하·안정성:** 프로젝트별 노드 **N**이 커질수록 `render`·`drawEdges`·미니맵·전량 JSON persist·`IAGridSheet` 행 수가 **한꺼번에** 비용을 만든다. **지침:** `.cursor/rules/plannode-architecture.mdc` **§9**. **하네스:** `.cursor/plans/harness-workflow_final.md` **「노드 규모·부하·안정성」** — `plan-output` 포함/제외·`TASK` NOW 한 줄·GATE C(스케일 회귀)·`GSD_LOG`·`@qa` 성능 표기. 대규모 최적화는 **승인된 BACKLOG/NOW**로만 진행(YAGNI).

---

## 폴더 파일 역할

| 파일 | 역할 | 갱신 주체 |
|------|------|-----------|
| `README.md` | 이 파일 — 운영 헌법·DB 절·워크플로우 참조 | 👤 Stephen (필요 시) |
| `plan-output.md` | `@promptor` 출력 — GATE A 확정 후 고정 | 🤖 @promptor 자동 저장 |
| `TASK.md` | 현재 스프린트 NOW/DONE/NEXT/BACKLOG | Step3 Plan Mode 작성 → 🤖 @harness-executor 갱신 |
| `GSD_LOG.md` | 태스크 실행 이력 스냅샷 | 🤖 @harness-executor 자동 기록 |
| `QA_REPORT.md` | @qa 산출·로컬 검수 보고 — 하네스 **워크플로**에서 쓰지만 **git 추적 제외** (`.gitignore`) | 🤖 @qa + 👤 확인·보관 |
| `context-hook.md` | 컨텍스트 드리프트 방지 훅 규칙 | 고정 (수정 시 Stephen 확인) |

---

## 하네스 워크플로우와 Plannode 원칙

### 모드 판별 기준

| 판별 신호 | Plannode 예시 | 처리 |
|-----------|---------------|------|
| DB 스키마·마이그레이션 | `plan_nodes` 컬럼 추가, RLS 변경 | **기본모드** |
| Supabase 인증·권한 로직 | `owner_id` 정합성, RLS 우회 위험 | **기본모드** |
| 광범위 변경 (4개+ 파일) | SvelteKit 전체 렌더 파이프라인 재작성 | **기본모드** |
| 단일 UI·버그 수정 | 노드 카드 스타일, 줌 버튼 미연결 수정 | **경량모드** 후보 |
| 파일럿 갭 수정 (1~2개) | `canvasContainer` bind, 좌표 오류 수정 | **경량모드** 후보 |

### Plannode 적용 GSD/TDD 판별

Plannode에는 결제·예약·동시성 로직이 없으므로 **전 영역이 GSD 기본**이다.
단, 아래 영역은 **주의 강화 GSD**로 처리한다 (TDD 불필요, 하지만 더 꼼꼼하게):

```
주의강화 GSD:
  - Supabase RLS 정책 변경
  - plan_projects · plan_nodes 스키마 추가
  - SvelteKit store 계약 변경 (노드 ID 일치 등)
  - transform / 좌표계 관련 Canvas 로직

일반 GSD:
  - UI 스타일·레이아웃
  - 탭 전환·뷰 토글
  - PRD/Spec 빌드 함수
  - 미니맵·토스트 등 보조 컴포넌트
```

---

## DB·스키마·Supabase 절차

### 원칙

1. **이미 실행된 SQL은 수정하지 않는다** — 신규 파일만 추가한다.
2. 스키마 변경은 PRD §11 + `plannode-ai-enhancement-v3.md`와 **정합**을 확인하고, `docs/` 또는 별도 `migrations/`로 관리한다.
3. SQL 실행은 **Supabase 대시보드 SQL Editor 또는 psql** — AI 자율 실행 금지.
4. `owner_id`는 반드시 `auth.uid()` 기반 — 하드코딩 UUID 절대 금지.

### Plannode DB 테이블 요약

| 테이블 | 역할 | RLS |
|--------|------|-----|
| `plan_projects` | 프로젝트 메타 | owner_full_access / public_read / collaborator_read |
| `plan_nodes` | 노드 트리 (flat, parent_id 체계) | nodes_owner_full / nodes_editor_write / nodes_viewer_read / nodes_public_read |
| `plan_collaborators` | 공동 작업자 관리 | collab_owner_manage / collab_self_read |
| `plan_snapshots` | 노드 스냅샷 (버전 관리) | snapshots_project_member |

전체 SQL: `docs/PILOT_FUNCTIONAL_SPEC.md` + `.cursor/plans/PLANNODE_INTEGRATED_GUIDE.md §4`

### 스키마 변경 시 절차

```
1. 신규 .sql 파일 작성 (기존 파일 수정 금지)
2. plan-output.md에 변경 사항 명시
3. TASK.md NOW에 "DB 변경 포함" 표시
4. GATE B에서 Stephen 확인 필수
5. 적용은 Stephen이 Supabase SQL Editor에서 직접 실행
```

---

## GATE 자동 기록 원칙

- **판단**: 항상 👤 Stephen (채팅 입력)
- **기록**: 항상 🤖 AI → `TASK.md` GATE LOG 자동 갱신
- Stephen이 `TASK.md` GATE LOG를 직접 편집하지 않는다.
- GATE B·C·D 승인만으로 커밋 자동 허가 안 됨 — 반드시 **"커밋 허가"** 채팅 입력 필요.

---

## 컨텍스트 드리프트 방지

- `@harness-executor` GATE C가 **3회 연속** 승인될 때마다 → 아젠다 재확인 출력
- GATE C 반려가 **2회 연속** → 리마인드 출력 후 plan-output.md 재로드
- 새 채팅 시작 직후 → `context-hook.md` HOOK-4 자동 실행

---

## 자동화 황금 원칙

```
✅ 자동화 가능     → 형식 검증, NOW/DONE 전환, GATE LOG 기록
✅ 조건부 자동화   → GATE B·C·D 승인 (경량모드 + 조건 명확할 때)
❌ 자동화 금지     → git commit / push 실행
❌ 자동화 금지     → DB 스키마 SQL 적용 (Supabase 실행)
❌ 자동화 금지     → Supabase 인증·권한 로직 판단
❌ 자동화 금지     → 기본모드 GATE A·E 최종 판단
```

---

*harness/README.md | Plannode | Harness Flow v1.0 | 2026.04*
