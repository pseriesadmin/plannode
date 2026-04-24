# AGENTS.md — 1TeamWorks (원팀웍스)
# Harness Flow v3.0 적용
# 역할: 프로젝트 정체성 + 도메인 규칙 선언
#       공통 SP1~SP4 에이전트는 .cursor/agents/shared/ 참조

---

## 🏗️ 프로젝트 정체성

```
서비스명   : 1TeamWorks (1teamworks.com)
성격       : B2G 현장협업 SaaS
             중장기 건물시설 유지보수·청소 운영관리 플랫폼
             현장 중심 인력파견·도급 계약 운영 관리
개발방식   : 1인 AI 에이전틱 코딩 | Cursor AI | Harness Flow v3.0
스택       : Next.js + TypeScript · Supabase · Vercel · 토스페이먼츠 v2
```

---

## ⚖️ 황금 원칙 (모든 에이전트 공통 적용)

```
GP-1.  git 명령어는 Stephen만 직접 실행 (add / commit / push 전부)
GP-2.  모든 GATE 전환은 Stephen의 명시적 승인 후에만 진행
GP-3.  AI는 제안·실행, 결정은 Stephen
GP-4.  TDD 도메인은 테스트 없이 구현 코드 작성 금지
GP-5.  30분 초과 GSD / 15분 초과 TDD 태스크는 분해 후 재승인
GP-6.  불확실하면 즉시 멈추고 Stephen에게 질문
GP-7.  명시 범위 밖 기능 선제 구현 금지
GP-8.  컨텍스트 리셋 요청 시 prd.md 즉시 재로드
GP-9.  서버 전용 키는 절대 클라이언트 코드에 노출 금지
GP-10. 기존 마이그레이션 파일 직접 수정 금지
GP-11. [1TeamWorks] B2G 계약 금액은 서버 RPC 계산만 허용
GP-12. [1TeamWorks] 인력 배정은 assign_field_worker RPC 경유만 허용
GP-13. [1TeamWorks] 승인 상태 변경은 process_approval RPC 경유만 허용
```

---

## 🔴 원팀웍스 TDD 필수 도메인

```
계약·정산   : contract / 계약 / 정산 / 청구 / 수수료 / 단가 /
              계약금액 / 선금 / 미지급 / 세금계산서 / 자동청구
배정·스케줄 : assign / 배정 / 스케줄 / 가용성 / 이중배정 /
              근태 / 출퇴근 / 인력할당 / 로테이션 / 순번
승인 흐름   : approval / 승인 / 결재 / 반려 / 에스컬레이션 / 위임
보안·권한   : auth / 권한 / RLS / JWT / 인증 / 역할 / 접근제어
정합성      : 집계 / 누락 / 오차 / 크로스체크 / 정합
```

---

## ⚡ 원팀웍스 GSD 도메인

```
현장 UI     : 현장보고서 / 체크리스트 / 사진등록 / 서명패드
관리 화면   : 대시보드 / 목록 / 조회 / 필터 / 검색
마스터관리  : 건물등록 / 시설등록 / 고객사등록 / 직원등록
알림·리포트 : 알림 / 푸시 / 이메일 / 리포트 / 현황
```

---

## 🏢 원팀웍스 모듈 구성

```
M1. 현장관리 (Field Operations)
    건물·시설 정보 / 현장 체크리스트 / 작업보고서 / 사진증빙
    → field-ops.mdc

M2. 인력배정 (Workforce Management)
    인력 풀 / 스케줄 배정 / 가용성 체크 / 근태관리
    → workforce.mdc

M3. 계약·정산 (Contract & Settlement)
    B2G 계약서 / 자동 청구 / 정산 분리 / 토스페이먼츠
    → contract-b2g.mdc

M4. 보고·KPI (Reporting)
    관리자 대시보드 / KPI 집계 / 고객사 리포트
    → kpi-reporting.mdc

M5. 승인 흐름 (Approval Flow)
    작업완료 승인 / 계약변경 / 에스컬레이션 / 위임
    → contract-b2g.mdc + security-auth.mdc
```

---

## 🚫 원팀웍스 절대 금지 패턴

```typescript
// ❌ 인력 직접 배정 (이중배정 위험)
await supabase.from('assignments').insert({...})

// ❌ 클라이언트 계약금액 계산 (조작 위험)
const fee = baseFee * headcount * months;

// ❌ 승인 상태 직접 UPDATE (승인 흐름 우회)
await supabase.from('approvals').update({ status: 'approved' })

// ❌ 가용성 체크 없이 배정
await supabase.rpc('assign_field_worker', {...})  // check 없이

// ❌ 서버 키 클라이언트 노출
import { SUPABASE_SERVICE_ROLE_KEY } from '@/env/public'

// ❌ 로컬 타임존으로 날짜 저장
scheduled_date: new Date().toLocaleDateString()
```

```typescript
// ✅ 올바른 패턴
// 인력 배정 (가용성 체크 → 배정 순서 필수)
const avail = await supabase.rpc('check_worker_availability', {
  worker_id, date_range
});
if (avail.data?.available) {
  await supabase.rpc('assign_field_worker', { worker_id, site_id, schedule });
}

// 계약금액 계산
await supabase.rpc('calculate_contract_amount', {
  contract_type, headcount, duration_months, conditions
});

// 승인 처리
await supabase.rpc('process_approval', {
  approval_id, action: 'approve', approver_id, comment
});

// 서버 전용 키
import { SUPABASE_SERVICE_ROLE_KEY } from '@/env/server'

// UTC 저장
scheduled_at: new Date().toISOString()  // UTC TIMESTAMPTZ
```

---

## 📋 도메인 규칙 파일 목록

```
.cursor/rules/
├── core-rules.mdc        ← alwaysApply: 개발 실행 원칙
├── field-ops.mdc         ← 현장관리 비즈니스 로직      [작성 필요]
├── contract-b2g.mdc      ← B2G 계약·정산·청구 규칙     [작성 필요]
├── workforce.mdc         ← 인력배정·근태·스케줄         [작성 필요]
├── kpi-reporting.mdc     ← KPI 집계·리포트              [작성 필요]
├── ui-mobile.mdc         ← 모바일 현장 UX 기준
└── security-auth.mdc     ← 역할별 인증·권한·RLS
```

> ⚠️ [작성 필요] 항목: 원팀웍스 핵심 비즈니스 규칙 파일.
> 이 파일들이 없으면 SP1 Spec Plan 단계에서 도메인 규칙 매핑 불가.
> **가장 먼저 작성해야 할 파일들.**

---

## 🤖 에이전트 호출 순서

```
STEP 1  아젠다 정의              👤 Stephen
         ↓
STEP 2  @sp1-plan-agents         🤖 PRD → Spec → Task (Planner)
         ↓
GATE-A  계획 승인                👤 Stephen
         ↓
GATE-B  task-plan.md APPROVED    👤 Stephen (마킹 필수)
         ↓
STEP 3  @sp2-tdd-agents          🤖 Red→Green→Refactor / GSD (Worker)
         ↓
GATE-C  코드 검증 (매 루프)      👤 Stephen
         ↓
GATE-D  전체 구현 확인           👤 Stephen
         ↓
STEP 4  @sp3-qa-agent            🤖 4단계 검수 (Evaluator)
         ↓
GATE-E  최종 확인                👤 Stephen → git commit
         ↓
STEP 5  @sp4-deploy-agent        🤖 배포 체크리스트 안내
         ↓
GATE-F  배포 완료                👤 Stephen
```

---

## 📋 GATE-C 강화 체크 (원팀웍스 계약·배정·승인)

```
계약·정산 태스크 포함 시:
□ calculate_contract_amount RPC 경유
□ 정산 분리 처리 (파견료·도급료·관리비)
□ idempotency_key 자동 청구 포함
□ 금액 수기 검산 완료

인력배정 태스크 포함 시:
□ check_worker_availability 선행 확인
□ assign_field_worker RPC 경유
□ 이중배정 방지 원자 트랜잭션
□ 배정 취소 시 가용성 복원 로직

승인 흐름 태스크 포함 시:
□ process_approval RPC 경유
□ 직접 status UPDATE 없음
□ 에스컬레이션 조건 처리
□ 승인 이력 로그 생성

보안·권한 태스크 포함 시:
□ 역할별 RLS 정책 적용
□ 고객사별 데이터 격리
□ 현장 작업자 → 관리자 메뉴 접근 차단
```

---

## 📁 디렉토리 구조

```
1teamworks/
├── AGENTS.md                     ← 이 파일 (프로젝트 전용)
├── task-plan.md
├── prd.md
├── spec-plan.md
├── GSD_LOG.md
├── .cursor/
│   ├── rules/
│   │   ├── core-rules.mdc
│   │   ├── field-ops.mdc         ← 작성 필요
│   │   ├── contract-b2g.mdc      ← 작성 필요
│   │   ├── workforce.mdc         ← 작성 필요
│   │   ├── kpi-reporting.mdc     ← 작성 필요
│   │   ├── ui-mobile.mdc
│   │   └── security-auth.mdc
│   └── agents/
│       └── shared/               ← 공통 에이전트 (SP1~SP4)
│           ├── sp1-plan-agents.md
│           ├── sp2-tdd-agents.md
│           ├── sp3-qa-agent.md
│           └── sp4-deploy-agent.md
└── src/ ...
```

---

## 🗓️ 원팀웍스 개발 로드맵

```
Phase 0: 기반 구축 (현재)
  핵심 RPC 설계 및 구현:
  - assign_field_worker
  - calculate_contract_amount
  - process_approval
  - check_worker_availability
  도메인 규칙 .mdc 5개 작성

Phase 1: MVP (런칭 S1)
  M1 현장 체크리스트 + 작업보고서
  M2 기본 인력배정 스케줄

Phase 2: 운영 안정화 (런칭 S2)
  M3 자동 청구 + 정산
  M5 승인 흐름 완성
  M4 고객사 리포트 자동화

Phase 3: 성장 트랙
  AI 현장 이상 감지 (G3)
  외부 ERP 연동 (G2)
```

---

*1teamworks/AGENTS.md | Harness Flow v3.0 | B2G SaaS*
