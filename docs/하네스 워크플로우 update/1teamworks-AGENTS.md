# AGENTS.md — 1TeamWorks-Harness-Flow v1.0
# 위치: 프로젝트 루트
# 원칙: AI는 실행·제안, 인간은 방향·검증·결정·커밋
# 기반: Commerce-Harness-Flow v2.0 이식
# 버전: 1.0 | 2026.04 | Stephen Cconzy

---

## 🏗️ 프로젝트 정체성

```
서비스명   : 1TeamWorks (1teamworks.com)
성격       : B2G 현장협업 SaaS
             — 중장기 건물시설 유지보수·청소 운영관리 플랫폼
             — 현장 중심 인력파견·도급 계약 운영
개발방식   : 1인 AI 에이전틱 코딩 (Cursor AI + 1TeamWorks-Harness-Flow)
스택       : Next.js + TypeScript · Supabase · Vercel · 토스페이먼츠 v2
도메인규칙 : field-ops.mdc · contract-b2g.mdc · workforce.mdc ·
             ui-mobile.mdc · security-auth.mdc
```

---

## ⚖️ 황금 원칙 (Golden Principles) — 절대 위반 금지

```
GP-1.  git commit / git push 는 반드시 Stephen이 직접 실행
GP-2.  모든 GATE 전환은 Stephen의 명시적 승인 후에만 진행
GP-3.  AI는 제안하고 실행한다. 결정은 Stephen이 한다.
GP-4.  TDD 도메인(정산·배정·계약·승인·보안)은 테스트 없이 구현 코드 작성 금지
GP-5.  30분 초과 태스크는 반드시 분해 후 재승인
GP-6.  불확실하면 즉시 멈추고 Stephen에게 질문한다
GP-7.  명시된 범위 밖의 기능을 추측·선제 구현하지 않는다
GP-8.  컨텍스트 리셋 신호 수신 시 plan-output.md를 즉시 재로드한다
GP-9.  서버 전용 키(SECRET, SERVICE_ROLE)는 절대 클라이언트에 노출하지 않는다
GP-10. 기존 마이그레이션 파일을 수정하지 않는다 (새 파일로 ALTER 처리)
GP-11. [1TeamWorks 특화] B2G 계약 금액은 서버 RPC 계산만 허용
GP-12. [1TeamWorks 특화] 인력 배정은 assign_field_worker RPC 경유만 허용
```

---

## 🔀 1TeamWorks TDD/GSD 도메인 판별

### 🔴 TDD 강제 도메인

```
계약·정산   contract / 계약 / 정산 / 청구 / 수수료 / 단가 / 계약금액 /
             정산분리 / 선금 / 미지급 / 세금계산서 / B2G계약
배정·스케줄  assign / 배정 / 스케줄 / 가용성 / 이중배정 / 근태 /
             출퇴근 / 인력할당 / 로테이션 / 순번
승인 흐름   approval / 승인 / 결재 / 반려 / 에스컬레이션 / 위임
보안·권한   auth / 권한 / RLS / JWT / 인증 / 접근제어 / 역할
정합성      집계 / 누락 / 오차 / 검증 / 크로스체크
```

### ⚡ GSD 일반 도메인

```
현장 UI     현장보고서 / 체크리스트 / 사진등록 / 서명패드
관리 화면   대시보드 / 목록 / 조회 / 필터 / 검색
마스터관리  건물등록 / 시설등록 / 고객사등록 / 직원등록
알림·리포트  알림 / 푸시 / 이메일 / 리포트 / 현황보고
```

---

## 🏢 1TeamWorks 도메인 모듈 구성

```
M1. 현장관리 (Field Operations)
    - 건물·시설 정보 관리
    - 현장 체크리스트 / 작업보고서
    - 사진 증빙 / 서명 패드
    → field-ops.mdc 적용

M2. 인력배정 (Workforce Management)
    - 인력 풀 관리 (직접고용 / 파견 / 도급)
    - 스케줄 배정 / 가용성 체크
    - 근태 관리 (출퇴근·초과·휴가)
    → workforce.mdc 적용

M3. 계약·정산 (Contract & Settlement)
    - B2G 계약서 관리 (번호 채번·버전 관리)
    - 정기 청구 / 정산 분리 (파견료·도급료·관리비)
    - 토스페이먼츠 연동 (자동 청구)
    → contract-b2g.mdc + payment.mdc 적용

M4. 보고·KPI (Reporting)
    - 관리자 대시보드 / 현장 현황
    - KPI 집계 / 이상 감지
    - 고객사 리포트 자동 생성
    → kpi-reporting.mdc 적용

M5. 승인 흐름 (Approval Flow)
    - 작업완료 승인 (현장→팀장→관리자)
    - 계약 변경 승인 / 에스컬레이션
    - 위임 정책
    → contract-b2g.mdc + security-auth.mdc 적용
```

---

## ⚠️ 1TeamWorks 절대 금지 패턴

```typescript
// ❌ 절대 금지 패턴

// 1. 인력 직접 배정 (이중배정 위험)
await supabase.from('assignments').insert({...})
// ✅ 반드시: await supabase.rpc('assign_field_worker', {...})

// 2. 클라이언트에서 계약금액 계산 (조작 위험)
const fee = baseFee * headcount * months;
// ✅ 반드시: await supabase.rpc('calculate_contract_amount', {...})

// 3. 승인 상태 직접 UPDATE (승인 흐름 우회)
await supabase.from('approvals').update({ status: 'approved' })
// ✅ 반드시: await supabase.rpc('process_approval', {...})

// 4. 가용성 체크 없이 배정
await supabase.rpc('assign_field_worker', {...})  // 사전 체크 없음
// ✅ 반드시: check_worker_availability → assign_field_worker 순서 보장

// 5. 서버 키 클라이언트 노출
import { SUPABASE_SERVICE_ROLE_KEY } from '@/env/public'
// ✅ 반드시: 서버 사이드 API route에서만 사용

// 6. 날짜를 로컬 타임존으로 저장
scheduled_date: new Date().toLocaleDateString()
// ✅ 반드시: UTC TIMESTAMPTZ 저장, 표시 시에만 KST 변환
```

```typescript
// ✅ 올바른 패턴

// 인력 배정
const avail = await supabase.rpc('check_worker_availability', { worker_id, date_range });
if (avail.data?.available) {
  await supabase.rpc('assign_field_worker', { worker_id, site_id, schedule });
}

// 계약금액 계산
const amount = await supabase.rpc('calculate_contract_amount', {
  contract_type, headcount, duration_months, conditions
});

// 승인 처리
await supabase.rpc('process_approval', {
  approval_id, action: 'approve', approver_id, comment
});
```

---

## 🚦 하네스 플로우 (GATE 정의) — Commerce-Harness-Flow v2.0 동일

```
STEP 1  아젠다 정의         👤 Stephen
STEP 2  @promptor 호출      🤖 7단계 분석 → plan-output.md
GATE A  방향 승인           👤 Stephen
STEP 3  Cursor Plan Mode    🤖 TASK.md 생성
GATE B  태스크 확정 ★       👤 Stephen (APPROVED 마킹 필수)
STEP 4  @harness-executor   🤖 GSD/TDD 자동 판별 루프
GATE C  코드 검증 (매루프)  👤 Stephen
GATE D  전체 아젠다 확인    👤 Stephen
STEP 5  @qa 검수            🤖 4단계 검수
GATE E  최종 확인           👤 Stephen → git commit 직접 실행
```

---

## 📋 GATE C 강화 체크리스트 (1TeamWorks 도메인)

```
계약·정산 관련
□ 계약금액 계산 RPC 경유 확인
□ 정산 분리 처리 (파견료·도급료·관리비 별도)
□ 자동 청구 idempotency_key 포함
□ 미지급 처리 fallback 로직 확인
□ 세금계산서 데이터 정합성 확인

인력배정 관련
□ assign_field_worker RPC 경유 확인
□ 가용성 체크 선행 확인
□ 이중배정 방지 원자 트랜잭션 확인
□ 배정 취소 시 가용성 복원 로직 확인

승인 흐름 관련
□ 직접 status UPDATE 없음 (RPC 경유)
□ 에스컬레이션 조건 처리 포함
□ 승인 이력 로그 생성 확인

보안·권한
□ 역할별 RLS 정책 적용 확인
□ 현장 작업자 → 관리자 메뉴 접근 차단
□ 고객사별 데이터 격리 확인
```

---

## 📁 1TeamWorks 디렉토리 구조

```
1teamworks/
├── AGENTS.md                        ← 이 파일
├── TASK.md
├── plan-output.md
├── GSD_LOG.md
├── ROLLBACK_LOG.md
├── .cursor/
│   ├── rules/
│   │   ├── core-rules.mdc           ← alwaysApply
│   │   ├── README.md
│   │   ├── field-ops.mdc            ← 현장관리 비즈니스 로직
│   │   ├── contract-b2g.mdc         ← B2G 계약·정산·청구
│   │   ├── workforce.mdc            ← 인력배정·근태·스케줄
│   │   ├── kpi-reporting.mdc        ← KPI·리포트·집계
│   │   ├── security-auth.mdc        ← 인증·권한·RLS
│   │   └── ui-mobile.mdc            ← 모바일 현장 UX
│   └── agents/
│       ├── promptor.md              ← Commerce-Harness-Flow v2.0 공용
│       ├── harness-executor.md      ← Commerce-Harness-Flow v2.0 공용
│       └── qa.md                    ← Commerce-Harness-Flow v2.0 공용
└── src/ ...
```

---

## 🗓️ 1TeamWorks 개발 로드맵 (현재 위치 추적용)

```
Phase 0: 환경 세팅 + 코어 DB 설계
  - Supabase 스키마 (buildings / workers / contracts / assignments)
  - 핵심 RPC 구현 (assign, calculate, process_approval)
  - 인증·권한 체계 (역할: admin / manager / field_worker / client)

Phase 1: MVP 오픈베타 (런칭 트랙 S1)
  - 현장 체크리스트 + 작업보고서 (M1)
  - 기본 인력배정 스케줄 (M2)
  - 수동 청구 + 정산 (M3 기본)

Phase 2: 운영 안정화 (런칭 트랙 S2)
  - 자동 청구 연동 (토스페이먼츠)
  - 승인 흐름 완성 (M5)
  - 고객사 리포트 자동화 (M4)

Phase 3: 성장 트랙
  - AI 현장 이상 감지 (G3)
  - 다중 현장 통합 관리 (G2)
  - 외부 ERP 연동 (G2)
```

---

*1TeamWorks-Harness-Flow v1.0 | 2026.04 | Stephen Cconzy*
*Commerce-Harness-Flow v2.0 기반 B2G SaaS 이식본*
