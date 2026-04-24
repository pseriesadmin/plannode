# AGENTS.md — 크레이지샷 (Crazyshot)
# Harness Flow v3.0 적용
# 역할: 프로젝트 정체성 + 도메인 규칙 선언
#       공통 SP1~SP4 에이전트는 .cursor/agents/shared/ 참조

---

## 🏗️ 프로젝트 정체성

```
서비스명   : 크레이지샷 (crazyshot.kr)
성격       : 촬영장비 전문 렌탈 플랫폼 (B2C + 글로벌 K-POP 팬층)
개발방식   : 1인 AI 에이전틱 코딩 | Cursor AI | Harness Flow v3.0
스택       : SvelteKit + TypeScript · Supabase · Vercel · 토스페이먼츠 v2
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
```

---

## 🔴 크레이지샷 TDD 필수 도메인

```
결제·정산   : payment / 결제 / 환불 / 보증금 / PG / 혼합결제 /
              쿠폰 / 포인트 / 웹훅 / idempotency / 정산
예약·재고   : reservation / 예약 / 가용성 / 이중예약 /
              재고차감 / atomic_reserve_asset / lock / 임시점유
보안·권한   : auth / 권한 / RLS / JWT / 인증
핵심로직    : 가격계산 / 단가 / 할인역산 / 기간계산
```

---

## ⚡ 크레이지샷 GSD 도메인

```
UI·화면     : UI / 컴포넌트 / 화면 / 레이아웃 / 스타일
데이터관리  : 상품등록 / 카테고리 / 이미지 / CRUD / 목록
사용자관련  : 회원정보 / 마이페이지 / 프로필
커뮤니케이션: 알림 / 푸시 / 이메일
```

---

## 🚫 크레이지샷 절대 금지 패턴

```typescript
// ❌ 직접 예약 INSERT (이중예약 위험)
await supabase.from('reservations').insert({...})

// ❌ 클라이언트 가격 계산 (조작 위험)
const price = basePrice * 0.9;

// ❌ 재고 확인 없이 결제창 오픈
toss.requestPayment({...})  // atomic_reserve_asset 없이

// ❌ 만료 필터 없는 가용성 조회
.in('status', ['temp', 'confirmed'])  // expires_at 없음

// ❌ 서버 키 클라이언트 노출
import { TOSS_SECRET_KEY } from '$env/static/public'

// ❌ DATE 단독 사용
rent_date DATE  // TIMESTAMPTZ 사용해야 함
```

```typescript
// ✅ 올바른 패턴
await supabase.rpc('atomic_reserve_asset', {...})
await supabase.rpc('calculate_final_price', {...})
const reserve = await supabase.rpc('atomic_reserve_asset', {...});
if (reserve.data?.success) toss.requestPayment({...});
.or(`status.in.(confirmed),and(status.eq.temp,expires_at.gt.${now})`)
import { TOSS_SECRET_KEY } from '$env/static/private'
ts_range TSRANGE  // timestamptz 기반
```

---

## 📋 도메인 규칙 파일 목록

```
.cursor/rules/
├── core-rules.mdc        ← alwaysApply: 개발 실행 원칙
├── rental.mdc            ← 렌탈·예약·가용성 규칙
├── payment.mdc           ← 결제·환불·PG 규칙
├── ui-mobile.mdc         ← 모바일 UX 기준
└── security-auth.mdc     ← 인증·권한·RLS
```

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

## 📋 GATE-C 강화 체크 (크레이지샷 결제·재고)

```
결제 관련 태스크 포함 시 추가 확인:
□ idempotency_key 포함
□ 실결제 ↔ 보증금 분리
□ 웹훅 멱등성 처리
□ TOSS_SECRET_KEY private import
□ 금액 수기 검산 완료

재고·예약 태스크 포함 시 추가 확인:
□ atomic_reserve_asset RPC 경유
□ 만료 필터(expires_at) 포함
□ 동시 요청 시나리오 테스트
□ 결제 실패 시 temp 예약 해제 로직
```

---

## 📁 디렉토리 구조

```
crazyshot/
├── AGENTS.md                     ← 이 파일 (프로젝트 전용)
├── task-plan.md                  ← SP1 출력 + GATE-B 마킹
├── prd.md                        ← SP1 출력
├── spec-plan.md                  ← SP1 출력
├── GSD_LOG.md                    ← SP2 실행 이력
├── .cursor/
│   ├── rules/
│   │   ├── core-rules.mdc
│   │   ├── rental.mdc
│   │   ├── payment.mdc
│   │   ├── ui-mobile.mdc
│   │   └── security-auth.mdc
│   └── agents/
│       └── shared/               ← 공통 에이전트 (4개)
│           ├── sp1-plan-agents.md
│           ├── sp2-tdd-agents.md
│           ├── sp3-qa-agent.md
│           └── sp4-deploy-agent.md
└── src/ ...
```

---

*crazyshot/AGENTS.md | Harness Flow v3.0 | B2C Rental Commerce*
