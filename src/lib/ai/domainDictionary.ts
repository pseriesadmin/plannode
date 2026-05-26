/**
 * PRD §10.2 LAYER4 — 도메인 사전 (P2-B2 B2-05)
 * rental · b2g_saas · ecommerce · general — `buildPrompt` user 조립 직전 1회 주입
 */

export type PlannodeDomain = 'rental' | 'b2g_saas' | 'ecommerce' | 'general';

const DOMAIN_CONTEXTS: Record<PlannodeDomain, string> = {
  rental: `
[도메인: 카메라 장비 렌탈 커머스]
핵심 상태 전이:
- 예약: pending → confirmed → in_use → returned | cancelled
- 자산(Asset): available → reserved → rented → inspecting → available | damaged
- 보증금: hold → released | charged

임계 규칙 (절대 변경 불가):
- atomic_reserve_asset(): EXCLUDE USING gist 동시성 잠금 — 중복 예약 0건 보장
- 임시 점유: pg_cron 10분 자동 해제
- 할인 순서 9단계 불변: 기본료 → 멤버십 → 쿠폰 → 포인트 → VAT역산 → 배송비 → 적립
- Vision Agent: confidence ≥ 0.85 자동 파손 판정, 미만 시 관리자 큐

결제 엣지케이스 (Sonnet 강제 조건):
- idempotency_key: 이중 결제 방지 UNIQUE 제약
- 부분 취소: Toss v2 partial cancel API
- 보증금 가승인(deposit_holds): 결제 전 선점 → 반납 후 해제/청구

성능 임계값:
- calculate_cart_total() RPC: P95 ≤ 500ms
- atomic_reserve_asset(): P95 ≤ 700ms
`.trim(),

  b2g_saas: `
[도메인: B2G SaaS]
권한 계층: 기관 관리자 > 담당자 > 열람자
감사 로그: 모든 데이터 변경에 created_by·updated_by·timestamp 필수
RLS: 기관 단위 row-level isolation
`.trim(),

  ecommerce: `
[도메인: 이커머스]
주문 상태: pending → paid → fulfilling → shipped → delivered | cancelled | refunded
재고: soft-reserve → confirm → deduct
`.trim(),

  general: ''
};

const DOMAIN_KEYWORDS: Array<{ domain: PlannodeDomain; pattern: RegExp }> = [
  {
    domain: 'rental',
    pattern:
      /렌탈|rental|장비|카메라|예약.*반납|보증금|atomic_reserve|크레이지샷|crazyshot/i
  },
  {
    domain: 'b2g_saas',
    pattern: /b2g|공공|기관|감사\s*로그|saas.*권한|row-level/i
  },
  {
    domain: 'ecommerce',
    pattern: /이커머스|e-?commerce|쇼핑|장바구니|주문.*배송|커머스/i
  }
];

/**
 * 프로젝트명·설명·아젠다 텍스트에서 도메인 키를 추론한다.
 * 장기: `plan_projects.domain` 필드가 정본.
 */
export function resolveProjectDomain(text: string): PlannodeDomain {
  const blob = (text || '').trim();
  if (!blob) return 'general';
  for (const { domain, pattern } of DOMAIN_KEYWORDS) {
    if (pattern.test(blob)) return domain;
  }
  return 'general';
}

/**
 * §10.2 LAYER4: 컨텍스트 문자열 앞에 도메인 특화 지식을 주입한다.
 */
export function injectDomainContext(contextStr: string, domain: string): string {
  const key = (domain as PlannodeDomain) in DOMAIN_CONTEXTS ? (domain as PlannodeDomain) : 'general';
  const domainCtx = DOMAIN_CONTEXTS[key];
  if (!domainCtx) return contextStr;
  return `${domainCtx}\n---\n${contextStr}`;
}
