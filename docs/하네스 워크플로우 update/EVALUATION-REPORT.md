# Commerce-Harness-Flow v2.0 — 평가 리포트 & 변경사항

작성일: 2026.04
작성자: Jesmine (Claude Sonnet 4.6)
대상: Stephen Cconzy

---

## 1. 현재 플로우 평가 (v1.x 기준)

### ✅ 잘 된 것 (강점)

| 항목 | 평가 |
|---|---|
| GATE A~E 인간 검증 체계 | ★★★★★ — 단계별 인간 개입 설계 매우 탁월 |
| GSD/TDD 도메인 자동 판별 | ★★★★☆ — 키워드 기반 실용적, 명확함 |
| AGENTS.md 황금 원칙 선언 | ★★★★★ — AI 행동 제약 명확하게 정의 |
| 크레이지샷 금지 패턴 예시 코드 | ★★★★★ — 구체적 코드 예시로 AI 오류 차단 |
| GSD_LOG.md 실행 이력 | ★★★★☆ — 트레이서빌리티 확보 |
| plan-output.md 컨텍스트 브리지 | ★★★★☆ — 세션 간 연속성 기반 마련 |

### ⚠️ 발견된 결함 (개선 필요)

| # | 문제 | 위험도 | 영향 |
|---|---|---|---|
| F-1 | gsd-agent.md(크레이지샷)에 TDD 모드 없음 — pseries와 충돌 | 🔴 높음 | 결제 로직 버그 잠복 |
| F-2 | promptor STEP-P4 리스크가 선언적 나열 — 구체성 없음 | 🟠 중간 | 엣지케이스 누락 |
| F-3 | qa.md 시나리오 3단계가 Stephen 수동 100% 의존 | 🟠 중간 | 회귀 테스트 누락 위험 |
| F-4 | 롤백(ROLLBACK) 프로토콜 미정의 | 🟠 중간 | GATE 반려 시 수습 불명확 |
| F-5 | 컨텍스트 오염 방지 전략 없음 | 🟡 낮음 | 장시간 세션 후 AI 드리프트 |
| F-6 | pseries vs crazyshot AGENTS.md 이원화 — 유지보수 분산 | 🟡 낮음 | 원칙 불일치 누적 위험 |
| F-7 | model: haiku 지정 — TDD 복잡 로직에 부적합 | 🟡 낮음 | 복잡한 TDD 시나리오 오류 가능 |

---

## 2. v2.0 변경사항 요약

### 2-1. 파일 구조 재설계 (통합·단순화)

```
v1.x (기존)                    v2.0 (재설계)
─────────────────────          ─────────────────────────────
AGENTS.md (pseries)            AGENTS.md (통합 표준)
AGENTS.md (crazyshot)     →   harness-executor.md ★핵심통합
gsd-agent.md (crazyshot)       promptor.md (v2)
pseries-harness-flow.md        qa.md (v2)
promptor.md                    1teamworks-AGENTS.md (이식)
qa.md
```

**핵심**: `gsd-agent.md` + `pseries-harness-flow.md` → `harness-executor.md` 단일 통합
→ TDD/GSD 이원화 해소, 일관된 동작 보장

### 2-2. 신규 추가 기능 (v2)

| 기능 | 위치 | 효과 |
|---|---|---|
| 롤백 프로토콜 | AGENTS.md | GATE 반려 시 체계적 수습 |
| 컨텍스트 드리프트 방지 | harness-executor.md | 장시간 세션 안전성 |
| CONTEXT BRIDGE | plan-output.md | 세션 재시작 시 빠른 복원 |
| 검수 3단계: 회귀 테스트 | qa.md | 기존 기능 보호 |
| model: sonnet 상향 | harness-executor.md | TDD 복잡 로직 정확도 향상 |
| 태스크 분해 기록 패턴 | harness-executor.md | TASK.md 이력 추적 강화 |

### 2-3. 강화된 항목

| 항목 | v1.x | v2.0 |
|---|---|---|
| 리스크 정의 | 선언적 나열 | 구체적 시나리오 + 예상동작 + 처리방법 |
| QA 단계 | 3단계 | 4단계 (회귀 테스트 신규) |
| GATE C 체크리스트 | 크레이지샷 전용 | 프로젝트 독립 표준 + 원팀웍스 추가 |
| ROLLBACK 처리 | 미정의 | 명확한 4단계 절차 |
| 컨텍스트 관리 | 없음 | 자동 드리프트 감지 + 수동 리셋 |

---

## 3. 원팀웍스 이식 가능성 검토

### 결론: ✅ 이식 가능 (권장)

### 이식 방법: 3단계

```
단계 1 — 즉시 사용 가능 (공통 파일)
  ✅ harness-executor.md  → 그대로 복사
  ✅ promptor.md          → 그대로 복사
  ✅ qa.md                → 그대로 복사 (시나리오 섹션 추가)

단계 2 — 교체 필요 (프로젝트 정체성)
  🔄 AGENTS.md            → 1teamworks-AGENTS.md 사용
  🔄 crazyshot 도메인 규칙 → 1TeamWorks 도메인 규칙으로 교체

단계 3 — 신규 작성 필요 (도메인 규칙 .mdc)
  📝 field-ops.mdc        → 현장관리 비즈니스 로직
  📝 contract-b2g.mdc     → B2G 계약·정산·청구 규칙
  📝 workforce.mdc        → 인력배정·근태·스케줄 규칙
  📝 kpi-reporting.mdc    → KPI 집계·리포트 규칙
  📝 security-auth.mdc    → 역할별 인증·권한·RLS 규칙
```

### 크레이지샷 vs 원팀웍스 비교

| 항목 | 크레이지샷 (B2C) | 원팀웍스 (B2G) |
|---|---|---|
| 핵심 TDD 도메인 | 결제·예약·재고 | 계약·배정·승인 |
| 원자 트랜잭션 | atomic_reserve_asset | assign_field_worker |
| 금액 계산 | calculate_final_price | calculate_contract_amount |
| 상태 전환 | reservations.status | approvals.status |
| 보안 초점 | 고객 결제 정보 | 고객사 데이터 격리 + 역할 분리 |
| UI 특성 | B2C 모바일 UX | 현장 작업자용 모바일 + 관리자 웹 |

### 원팀웍스 이식 시 주의사항

```
1. B2G 특화 고려사항
   - 계약 주체: 고객사(기관) ↔ 1TeamWorks ↔ 파견/도급 업체
   - 정산 구조: 파견료 / 도급료 / 관리비 3원 분리
   - 계약서: 번호 자동 채번 + 버전 관리 필수
   - 세금계산서 데이터 연동 고려

2. 인력 유형별 처리 차이
   - 직접고용 / 파견 / 도급 3가지 유형별 근태 처리 다름
   - 가용성 체크 로직이 크레이지샷보다 복잡
   - 다중 현장 동시 배정 가능성 고려

3. 승인 흐름 복잡성
   - 크레이지샷: 결제 승인 단순
   - 원팀웍스: 현장→팀장→관리자→고객사 다단계 승인
   - 에스컬레이션 + 위임 정책 필요

4. 개발 우선순위 권장
   Phase 0: 핵심 RPC 먼저 (assign, calculate, process_approval)
   Phase 1: 현장 UI (M1) + 기본 배정 (M2)
   Phase 2: 계약·정산 (M3) — TDD 집중 구간
   Phase 3: KPI·리포트 (M4) + 승인흐름 (M5)
```

---

## 4. 적용 권장 순서

```
크레이지샷 지금 당장:
  1. gsd-agent.md 삭제 → harness-executor.md 교체
  2. AGENTS.md v2.0으로 업데이트 (롤백 프로토콜 추가)
  3. qa.md v2.0으로 업데이트 (회귀 테스트 추가)
  4. ROLLBACK_LOG.md 파일 생성 (빈 파일)

원팀웍스 준비:
  1. 1teamworks-AGENTS.md → AGENTS.md로 복사
  2. 공통 에이전트 3개 복사 (harness-executor / promptor / qa)
  3. 도메인 규칙 .mdc 5개 작성 (가장 중요, 시간 필요)
  4. 핵심 RPC SQL 설계 (assign_field_worker 등)
```

---

*Commerce-Harness-Flow v2.0 평가 리포트 | 2026.04 | Jesmine*
