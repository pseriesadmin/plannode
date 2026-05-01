# harness-evolution.md
# Harness Flow v3.0 — 진화적 개선 루프 (기둥 ④)
# 위치: 프로젝트 루트
# 목적: AI가 새로운 실수를 할 때마다 하네스를 점점 더 견고하게 만든다

---

## 설계 철학

> "반복적 개선: AI가 실패하는 케이스를 모아
>  하나씩 울타리를 높여가십시오."
>
> — Harness System Design Standard

하네스는 한 번 완성되는 문서가 아니다.
AI가 새로운 실수를 할 때마다 그 실수가 **구조적으로 다시 발생하지 않도록**
ESLint 규칙, 테스트 케이스, AGENTS.md 금지 패턴을 추가한다.

---

## 진화적 개선 프로세스 (SP3 QA 완료 후 실행)

### GATE-E 이후: 실수 수확 세션

```
QA 사이클이 끝날 때마다 Stephen + AI가 함께 아래를 검토한다.
소요 시간: 10분 이내.

검토 항목:
1. 이번 사이클에서 GATE-C 반려가 발생한 태스크 목록
2. SP3 QA 검수에서 발견된 규칙 위반 항목
3. 자동 루프 3회 실패 사례
4. Stephen이 "이런 패턴 다신 보고 싶지 않다"고 느낀 것
```

### 실수 → 하네스 강화 변환 규칙

```
발견된 실수 유형           →    추가할 하네스 요소
────────────────────────       ────────────────────────────────────
코드 패턴 실수              →   ESLint 커스텀 규칙 (harness-enforcement.md)
비즈니스 로직 실수          →   AGENTS.md 금지 패턴 코드 예시 추가
엣지케이스 누락             →   spec-plan.md 표준 엣지케이스 목록 추가
컨텍스트 망각               →   AGENTS.md CONTEXT BRIDGE 항목 추가
TDD 시나리오 누락           →   sp2-tdd-agents.md 도메인별 필수 시나리오 추가
```

### 실수 기록 형식 (HARNESS_LOG.md)

```markdown
# HARNESS_LOG.md — 진화 이력
# 형식: [날짜] | 실수 유형 | 발생 위치 | 추가된 강화 요소

[2026-04-XX] | 직접 INSERT 시도 | SP2 GREEN 단계 | ESLint H-01 규칙 추가
[2026-04-XX] | 만료 필터 누락    | GATE-C 반려    | spec-plan.md Edge 케이스 추가
[2026-04-XX] | any 타입 잔류    | SP3 검수 2단계 | Pre-commit H-03 검사 추가
```

---

## "성공은 조용히, 실패는 시끄럽게" 원칙 적용

> 현재 v3.0의 문제: GATE-C가 성공/실패 모두 동일 분량의 체크리스트를 출력한다.
> 이는 컨텍스트 낭비 + AI 드리프트 원인이다.

### SP2 출력 원칙 재정의 (sp2-tdd-agents.md 보완)

```
✅ 성공 시 (조용히):
   GSD: "✅ T-{ID} 완료." + GATE-C 최소 포맷
   TDD: "✅ T-{ID} 완료. 테스트 {N}개 통과." + GATE-C 최소 포맷
   → 체크리스트 항목 생략. Stephen 확인 1줄 요청.

❌ 실패/반려 시 (시끄럽게):
   → 에러 메시지 전문
   → 실패한 테스트 케이스 이름
   → 위반된 ESLint 규칙 ID
   → "원인 분석: {1줄}" + "권장 수정: {1줄}"
   → HARNESS_LOG.md 기록 안내
```

### GATE-C 최소 포맷 (성공 시)

```
─────────────────────────────────────
🚦 GATE-C [{모드}] T-{ID} — 👤 승인?
완료: {태스크명 1줄}
{TDD만} 테스트 {N}개 통과
→ Y: 다음 / 수정 [내용]: 반영 후 재실행 / N: 재시작
─────────────────────────────────────
```

### GATE-C 실패 포맷 (반려 시 — 상세)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ GATE-C 반려 — 상세 분석
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
태스크: T-{ID} {태스크명}
반려 이유: {Stephen 입력}

위반 분석:
- ESLint 규칙: {위반 규칙 ID}
- 금지 패턴: {AGENTS.md 어느 항목}
- 테스트 실패: {실패 케이스명}

권장 수정:
1. {구체적 수정 방법}

하네스 강화 권장:
→ 이 패턴을 ESLint 규칙으로 추가하시겠습니까?
   Y: harness-enforcement.md + HARNESS_LOG.md 업데이트 안내
   N: 이번만 수동 수정

재시작: RED 단계부터 / GREEN 단계부터
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## AGENTS.md 경량화 가이드 (60줄 권장 준수)

> 지침서 기둥 ①: "1,000페이지 설명서가 아닌 60줄 이하 한눈에 보이는 지도"

### 현재 문제

```
현재 AGENTS.md: ~180줄 (크레이지샷) / ~220줄 (원팀웍스)
권장 기준: 60줄 이하
원인: 절대 금지 패턴 코드 예시 + 상세 설명이 AGENTS.md에 인라인으로 포함됨
```

### 해결 구조: AGENTS.md = 지도 / 상세 규칙 = 별도 파일

```
AGENTS.md (60줄 이하 — 지도)
│  - 프로젝트 정체성 (5줄)
│  - 황금 원칙 10개 (15줄)
│  - TDD/GSD 도메인 판별표 (15줄)
│  - 에이전트 호출 순서 (10줄)
│  - 참조 파일 목록 (10줄)
│  ※ 상세 규칙은 아래 파일들 참조
│
├── harness-enforcement.md   ← ESLint 규칙 + 프리커밋 + 자동루프
├── harness-evolution.md     ← 진화적 개선 프로세스 (이 파일)
├── .cursor/rules/*.mdc      ← 도메인별 상세 비즈니스 규칙
└── HARNESS_LOG.md           ← 진화 이력
```

### AGENTS.md 60줄 버전 (크레이지샷 예시)

```markdown
# AGENTS.md — 크레이지샷 | Harness Flow v3.0

## 프로젝트
서비스: crazyshot.kr | SvelteKit + Supabase + 토스페이먼츠 v2 | 1인 AI 코딩

## 황금 원칙
GP-1. git은 Stephen만 실행
GP-2. 모든 GATE는 Stephen 승인 후 전환
GP-3. AI 제안·실행, 결정은 Stephen
GP-4. TDD 도메인: 테스트 없이 구현 코드 금지
GP-5. 초과 태스크(GSD>30분, TDD>15분) 분해 후 재승인
GP-6. 불확실 → 즉시 질문
GP-7. 범위 밖 기능 선제 구현 금지
GP-8. 컨텍스트 리셋 → prd.md 즉시 재로드
GP-9. 서버 키 클라이언트 노출 금지
GP-10. 기존 마이그레이션 파일 수정 금지

## TDD 강제 도메인
결제·정산·PG·웹훅·환불·보증금·idempotency
예약·가용성·이중예약·atomic_reserve_asset·lock
권한·RLS·JWT·가격계산·할인역산

## GSD 도메인
UI·컴포넌트·CRUD·목록·알림·마이페이지·이미지

## 에이전트 호출 순서
아젠다 → @sp1-plan-agents → GATE-A → GATE-B →
@sp2-tdd-agents → GATE-C(매루프) → GATE-D →
@sp3-qa-agent → GATE-E → git commit → @sp4-deploy-agent → GATE-F

## 자동 강제 시스템
ESLint + Pre-commit + Auto-Loop → harness-enforcement.md 참조

## 도메인 규칙
rental.mdc / payment.mdc / ui-mobile.mdc / security-auth.mdc

## 상세 규칙
절대금지 패턴 코드 예시 → AGENTS-detail.md
진화적 개선 프로세스 → harness-evolution.md
```

---

## Dead Code 자동 감지 (주기적 실행)

```bash
# package.json 스크립트 추가
{
  "scripts": {
    "harness:gc": "npx ts-prune src --error && npx depcheck"
  }
}
```

### SP3 QA 검수 4단계 추가 항목 (harness-evolution.md 연동)

```
SP3 검수 4단계 완료 후 harness:gc 실행:
□ ts-prune: 사용하지 않는 export 감지
□ depcheck: 사용하지 않는 npm 패키지 감지
□ 감지된 Dead Code → TASK.md BACKLOG 등록
□ 신규 실수 패턴 → HARNESS_LOG.md 기록 + 하네스 강화 검토
```

---

*harness-evolution.md | Harness Flow v3.0 | 진화적 개선 루프 (기둥 ④)*
