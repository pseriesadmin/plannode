/**
 * 아젠다 텍스트에서 도메인 힌트를 감지해 프롬프트에 주입할 컨텍스트 블록을 만든다.
 * (PRD LAYER4 domainDictionary의 최소 구현 — plan-output P-6.5 범위 내)
 */

export interface DomainHint {
  name: string;
  coreFeatures: string[];
  contextBlock: string;
}

type DomainDef = {
  keywords: RegExp;
  hint: DomainHint;
};

const DOMAIN_DEFS: DomainDef[] = [
  {
    keywords: /커머스|쇼핑|shop|commerce|결제|주문|장바구니|상품|배송/i,
    hint: {
      name: 'E-Commerce',
      coreFeatures: ['상품목록', '장바구니', '주문', '결제', '배송추적', '리뷰'],
      contextBlock: `도메인: 커머스
필수 고려사항:
- 재고 상태전이 (available→reserved→sold)
- 결제 흐름 (선택→결제→승인→완료→환불)
- 비회원 구매 가능 여부
- 배지 강제: PAYMENT, CRUD, AUTH 포함`
    }
  },
  {
    keywords: /예약|booking|reservation|병원|헬스케어|healthcare|클리닉/i,
    hint: {
      name: 'Booking/Healthcare',
      coreFeatures: ['예약등록', '예약조회', '알림', '취소·환불', '의사·자원관리'],
      contextBlock: `도메인: 예약/헬스케어
필수 고려사항:
- 예약 슬롯 동시성 (중복 예약 방지)
- 알림 발송 (예약확인·리마인더)
- 취소·환불 정책
- 배지 강제: REALTIME, AUTH, FORM 포함`
    }
  },
  {
    keywords: /SaaS|saas|구독|subscription|B2B|대시보드|dashboard|어드민|admin/i,
    hint: {
      name: 'B2B SaaS',
      coreFeatures: ['워크스페이스', '권한관리', '구독·청구', '대시보드', '감사로그'],
      contextBlock: `도메인: B2B SaaS
필수 고려사항:
- 역할 기반 접근 제어 (RBAC)
- 조직·워크스페이스 격리
- 구독 플랜·업그레이드·청구
- 배지 강제: AUTH, DASH, PAYMENT 포함`
    }
  },
  {
    keywords: /SNS|소셜|커뮤니티|community|피드|feed|팔로|follow|채팅|chat/i,
    hint: {
      name: 'Social/Community',
      coreFeatures: ['피드', '팔로우', '좋아요·댓글', '알림', '채팅'],
      contextBlock: `도메인: 소셜/커뮤니티
필수 고려사항:
- 실시간 알림·채팅 (WebSocket)
- 피드 알고리즘 (최신·추천)
- 신고·차단 정책
- 배지 강제: REALTIME, FEED, AUTH 포함`
    }
  },
  {
    keywords: /교육|학습|학원|LMS|강의|course|퀴즈|quiz/i,
    hint: {
      name: 'EdTech/LMS',
      coreFeatures: ['강의목록', '수강등록', '진도관리', '퀴즈·시험', '수료증'],
      contextBlock: `도메인: 교육/LMS
필수 고려사항:
- 수강 진도 추적
- 결제·환불 (부분 수강 시)
- 강사·학습자 권한 분리
- 배지 강제: CRUD, FORM, PAYMENT 포함`
    }
  }
];

const DEFAULT_HINT: DomainHint = {
  name: 'General Web Service',
  coreFeatures: ['사용자 인증', '메인 기능', '알림', '설정', '관리자'],
  contextBlock: `도메인: 일반 웹서비스
필수 고려사항:
- 사용자 인증·권한
- 핵심 도메인 CRUD
- 알림·피드백
- 배지: AUTH, CRUD 기본 포함`
};

export function detectDomain(agenda: string): DomainHint {
  for (const def of DOMAIN_DEFS) {
    if (def.keywords.test(agenda)) return def.hint;
  }
  return DEFAULT_HINT;
}
