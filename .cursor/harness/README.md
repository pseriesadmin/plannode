# .cursor/harness/ — Plannode 하네스 운영 헌법

> 이 폴더는 **인간 게이트용 산출물**과 **운영 원칙**을 보관한다.
> AI 에이전트 정의 파일은 `.cursor/agents/`에 있다.

---

## PRD(제품)와 하네스(절차)의 연계

- **제품 기준(단일 진실)**: `.cursor/rules/plannode-prd.mdc` — 모듈 M#·기능 F#-#, MVP/Phase(§6), IA/와이어(F2-4, F4-3/4-4) vs LLM(F2-5, §10), v2 DB(§11) 등.
- **하네스 산출물**은 PRD의 **이번 사이클에 해당하는 조각**을 구현·검수한다.
  - `plan-output.md`: **PRD 연계** 섹션에 M#·F#-# (필요 시 PRD 절 §) + **이번에 제외하는 Phase/기능**을 명시.
  - `TASK.md`: `현재 아젠다`와 각 NOW에 `| PRD: M# F#-#` 한 줄(또는 `해당 없음: 인프라/버그만`).
- **파일럿 정합**은 `docs/PILOT_FUNCTIONAL_SPEC.md` — PRD에 없는 “Vanilla vs SvelteKit 갭”은 §9~§10이 우선, PRD F·Phase와 **모순**이 있으면 GATE A/B 전에 정리.
- **상세 TypeScript/AI·4-레이어**는 PRD가 가리키는 `plannode-ai-enhancement-v3.md` 등과 **PRD·TASK**를 맞출 것.

---

## 폴더 파일 역할

| 파일 | 역할 | 갱신 주체 |
|------|------|-----------|
| `README.md` | 이 파일 — 운영 헌법·DB 절·워크플로우 참조 | 👤 Stephen (필요 시) |
| `plan-output.md` | `@promptor` 출력 — GATE A 확정 후 고정 | 🤖 @promptor 자동 저장 |
| `TASK.md` | 현재 스프린트 NOW/DONE/NEXT/BACKLOG | Step3 Plan Mode 작성 → 🤖 @harness-executor 갱신 |
| `GSD_LOG.md` | 태스크 실행 이력 스냅샷 | 🤖 @harness-executor 자동 기록 |
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
