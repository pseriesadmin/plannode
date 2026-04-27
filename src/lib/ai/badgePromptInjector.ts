/**
 * Plannode 배지 기반 프롬프트 인젝터
 * - 배지 조합 → AI 프롬프트 조각 자동 생성
 * - 배지별 문서 출력 조건 정의
 */

import type { BadgeSet, NodeMetadata } from './types';
import {
  DEFAULT_DEV_KEYS,
  DEFAULT_UX_KEYS,
  DEFAULT_PRJ_KEYS,
  getEffectiveBadgePool,
  poolToSets,
  resolveLegacyTokenToTrack,
} from './badgePoolConfig';

/** UI·문서 순회용 기본 키(고정 순서). 런타임 허용 풀은 `getEffectiveBadgePool()`. */
export const DEV_BADGE_KEYS = DEFAULT_DEV_KEYS;
export const UX_BADGE_KEYS = DEFAULT_UX_KEYS;
export const PRJ_BADGE_KEYS = DEFAULT_PRJ_KEYS;

/**
 * 배지별 프롬프트 조각 정의
 * AI 시스템 프롬프트에 동적으로 주입되는 조건·요구사항·명세
 */
export const BADGE_PROMPT_FRAGMENTS: Record<string, string> = {
  // ===== DEV 트랙 (개발 구현 태그) =====

  TDD: `이 기능은 TDD 필수 구간입니다.
기능정의서에 반드시 포함:
- 단위 테스트 케이스 목록 (Given/When/Then 형식, 최소 5개)
- 경계값 테스트 케이스
- 실패 시나리오 테스트 케이스`,

  CRUD: `이 화면은 CRUD 기능을 포함합니다.
API 명세에 반드시 포함:
- GET (목록 조회): 페이지네이션, 필터, 정렬 파라미터
- GET (단건 조회): 상세 응답 스키마
- POST (생성): 요청 바디 유효성 규칙
- PUT/PATCH (수정): 부분 수정 vs 전체 수정 구분
- DELETE (삭제): 소프트삭제 vs 하드삭제 정책`,

  API: `이 기능은 외부 API 연동을 포함합니다.
명세에 반드시 포함:
- 연동 대상 API 엔드포인트 및 인증 방식
- 요청/응답 스키마 예시
- 에러 처리 및 재시도 정책
- API 변경 시 버전 관리 전략`,

  AUTH: `이 화면은 인증이 필요합니다.
명세에 반드시 포함:
- 접근 권한 레벨 (guest / user / admin)
- 미인증 접근 시 리다이렉트 경로
- 토큰 만료 처리 방식
- 권한 부족 시 에러 UI`,

  REALTIME: `이 화면은 실시간 데이터를 포함합니다.
반드시 포함:
- 실시간 갱신 트리거 조건
- 연결 끊김 시 fallback 처리
- Supabase Realtime 채널 구독 범위
- 동시성 충돌 해결 방식`,

  PAYMENT: `이 화면은 결제 로직을 포함합니다. 최고 주의 구간.
반드시 포함:
- 결제 상태머신 (pending → success / fail / cancel)
- 웹훅 수신 처리 흐름
- 멱등성 키 처리 방식
- 결제 실패 시 재고 롤백 시나리오
- Toss Payments v2 기준 에러코드 처리`,

  // ===== UX 트랙 (화면 구성 요소 태그) =====

  NAVI: `이 화면은 내비게이션 요소를 포함합니다.
와이어프레임 명세에 포함:
- 내비게이션 유형: GNB / 탭바 / 사이드메뉴 / 브레드크럼 중 택일
- 활성 탭 표시 방식
- 뒤로가기 동작 정의
- 딥링크 지원 여부`,

  HEAD: `이 화면은 헤더 영역을 포함합니다.
와이어프레임 명세에 포함:
- 페이지 타이틀 및 서브타이틀
- 상단 액션 버튼 (설정, 검색 등)
- 헤더 높이 및 배경 색상
- sticky 여부`,

  LIST: `이 화면은 목록형 UI를 포함합니다.
와이어프레임 명세에 포함:
- 목록 아이템 구조 (필드명 + 표시 형식)
- 페이지네이션 방식: 무한스크롤 / 페이지 버튼 / 더보기
- 빈 목록 상태 UI
- 로딩 스켈레톤 구조
- 정렬/필터 UI 위치`,

  CARD: `이 화면은 카드형 컴포넌트를 포함합니다.
와이어프레임 명세에 포함:
- 카드 내 표시 정보 목록 (우선순위 순)
- 카드 액션 (클릭/스와이프/롱프레스)
- 카드 상태 표시 (뱃지, 라벨, 색상 구분)
- 그리드 열 수 (모바일 기준)`,

  FORM: `이 화면은 입력 폼을 포함합니다.
와이어프레임 명세에 포함:
- 입력 필드 목록 (필드명 / 타입 / 필수여부 / 유효성 규칙)
- 제출 버튼 활성화 조건
- 에러 메시지 표시 위치
- 자동완성 / 입력 어시스트 여부`,

  BUTT: `이 화면은 주요 버튼/CTA를 포함합니다.
와이어프레임 명세에 포함:
- CTA 버튼 텍스트 및 위치
- 주요 액션 vs 보조 액션 시각적 구분
- 플로팅 버튼(FAB) 여부
- 버튼 활성/비활성 상태 명세`,

  MODAL: `이 화면은 모달/팝업을 포함합니다.
와이어프레임 명세에 포함:
- 모달 유형: 팝업 / 바텀시트 / 풀스크린 / 드로어
- 트리거 조건 (어떤 액션에서 열리는지)
- 닫기 조건 (백드롭 클릭 / 버튼 / 스와이프)
- 모달 내 주요 액션 버튼`,

  FEED: `이 화면은 피드백 UI를 포함합니다.
와이어프레임 명세에 포함:
- 성공 / 실패 / 로딩 / 빈상태 4종 상태 UI 각각 명세
- 토스트 메시지 위치 및 지속 시간
- 에러 발생 시 재시도 UX
- 로딩 중 사용자 인터랙션 차단 여부`,

  DASH: `이 화면은 대시보드/통계를 포함합니다.
와이어프레임 명세에 포함:
- 표시 지표 목록 (지표명 / 단위 / 집계 기준)
- 차트 유형 (라인 / 바 / 파이 / 수치카드)
- 기간 필터 범위
- 데이터 갱신 주기`,

  MEDIA: `이 화면은 미디어(이미지/동영상) 처리를 포함합니다.
와이어프레임 명세에 포함:
- 지원 파일 형식 및 최대 크기
- 업로드 UI (드래그앤드롭 / 버튼)
- 미리보기 및 편집 기능
- 업로드 진행도 표시 방식`,

  // ===== PRJ 트랙 (기획 산출물 방향 태그) =====

  USP: `이 기능은 핵심 차별화 포인트입니다.
PRD에 반드시 포함:
- 경쟁 서비스 대비 차별점 (최소 3개)
- 사용자 획득/유지에 미치는 영향
- 비즈니스 지표 연결 (전환율, 재방문율 등)`,

  MVP: `이 기능은 MVP 범위입니다. 개발 우선순위 P1.`,

  AI: `이 기능은 AI 처리를 포함합니다.
명세에 반드시 포함:
- AI 입력값 구조 (프롬프트 템플릿)
- 모델 선택 기준 (Haiku / Sonnet / Opus)
- 응답 파싱 방식
- AI 실패 시 fallback 처리`,

  I18N: `이 기능은 다국어 지원을 포함합니다.
명세에 반드시 포함:
- 지원 언어 목록
- 텍스트 컴포넌트에 i18n 키 명세
- 방향성(LTR/RTL) 고려사항
- 다국어 테스트 체크리스트`,

  MOBILE: `이 화면은 모바일 우선 설계입니다.
와이어프레임 기준:
- 뷰포트: 390px (iPhone 14 기준)
- 터치 타겟 최소 44px
- 하단 안전영역(safe area) 고려
- 가상 키보드 올라올 때 레이아웃 처리`,
};

/**
 * 배지별 라벨 (UI 표시용)
 */
export const BADGE_LABELS: Record<string, string> = {
  TDD: 'TDD',
  CRUD: 'CRUD',
  API: 'API',
  AUTH: 'AUTH',
  REALTIME: 'REALTIME',
  PAYMENT: 'PAYMENT',
  NAVI: 'NAVI',
  HEAD: 'HEAD',
  LIST: 'LIST',
  CARD: 'CARD',
  FORM: 'FORM',
  BUTT: 'BUTT',
  MODAL: 'MODAL',
  FEED: 'FEED',
  DASH: 'DASH',
  MEDIA: 'MEDIA',
  USP: 'USP',
  MVP: 'MVP',
  AI: 'AI',
  I18N: 'I18N',
  MOBILE: 'MOBILE',
};

/**
 * 배지별 색상 스타일 (UI 칩용)
 */
export const BADGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  // DEV 트랙 - 빨강 계열
  TDD: { bg: '#fff1f0', text: '#dc2626', border: '#fca5a5' },
  CRUD: { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' },
  API: { bg: '#faf5ff', text: '#7c3aed', border: '#c4b5fd' },
  AUTH: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  REALTIME: { bg: '#ede9fe', text: '#5b21b6', border: '#ddd6fe' },
  PAYMENT: { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
  // UX 트랙 - 파랑 계열
  NAVI: { bg: '#dbeafe', text: '#0c4a6e', border: '#7dd3fc' },
  HEAD: { bg: '#dbeafe', text: '#0c4a6e', border: '#7dd3fc' },
  LIST: { bg: '#e0e7ff', text: '#3730a3', border: '#a5b4fc' },
  CARD: { bg: '#e0e7ff', text: '#3730a3', border: '#a5b4fc' },
  FORM: { bg: '#ddd6fe', text: '#5b21b6', border: '#c4b5fd' },
  BUTT: { bg: '#cffafe', text: '#0e7490', border: '#67e8f9' },
  MODAL: { bg: '#cffafe', text: '#0e7490', border: '#67e8f9' },
  FEED: { bg: '#e1e8f0', text: '#1e293b', border: '#cbd5e1' },
  DASH: { bg: '#e1e8f0', text: '#1e293b', border: '#cbd5e1' },
  MEDIA: { bg: '#e1e8f0', text: '#1e293b', border: '#cbd5e1' },
  // PRJ 트랙 - 초록/주황 계열
  USP: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  MVP: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  AI: { bg: '#f0fdf4', text: '#16a34a', border: '#86efac' },
  I18N: { bg: '#fed7aa', text: '#92400e', border: '#fdba74' },
  MOBILE: { bg: '#fed7aa', text: '#92400e', border: '#fdba74' },
};

/**
 * 배지 조합 → 통합 프롬프트 조각 생성
 * @param badges 배지 집합
 * @returns 프롬프트에 주입할 문자열
 */
export function buildBadgeContext(badges: BadgeSet): string {
  const allBadges = [...badges.dev, ...badges.ux, ...badges.prj];

  if (allBadges.length === 0) {
    return '';
  }

  const fragments = allBadges
    .map((badge) => BADGE_PROMPT_FRAGMENTS[badge])
    .filter(Boolean);

  if (fragments.length === 0) return '';

  return `\n\n[BADGE CONTEXT — 이 노드의 구현 조건]\n\n${fragments.join('\n\n')}`;
}

/**
 * 배지에 따라 Sonnet 강제 필요 여부 판단
 * 고위험 기능은 더 강력한 모델 필요
 * @param badges 배지 집합
 * @returns true이면 Sonnet 이상 권장
 */
export function shouldForceSonnet(badges: BadgeSet): boolean {
  const highRiskBadges: string[] = ['PAYMENT', 'TDD', 'REALTIME', 'AUTH'];
  const allBadges = [...badges.dev, ...badges.ux, ...badges.prj];
  return allBadges.some((b) => highRiskBadges.includes(b));
}

/**
 * 레거시 배지 배열(소문자) → BadgeSet으로 마이그레이션
 * @param legacyBadges 기존 배지 배열 ['tdd', 'crud', 'ai', ...]
 * @returns BadgeSet
 */
export function migrateLegacyBadgesToSet(legacyBadges: string[]): BadgeSet {
  const badgeSet: BadgeSet = { dev: [], ux: [], prj: [] };

  if (!legacyBadges || !Array.isArray(legacyBadges)) {
    return badgeSet;
  }

  const pool = getEffectiveBadgePool();

  for (const badge of legacyBadges) {
    const lower = String(badge).toLowerCase();
    const hit = resolveLegacyTokenToTrack(pool, lower);
    if (!hit) continue;
    const arr = badgeSet[hit.track];
    if (!arr.includes(hit.upper)) arr.push(hit.upper);
  }

  return badgeSet;
}

/**
 * BadgeSet → 평면 배열로 변환 (레거시 호환)
 * @param set BadgeSet
 * @returns 소문자 배지 배열
 */
export function flattenBadgeSet(set: BadgeSet): string[] {
  const result: string[] = [];
  for (const dev of set.dev) result.push(dev.toLowerCase());
  for (const ux of set.ux) result.push(ux.toLowerCase());
  for (const prj of set.prj) result.push(prj.toLowerCase());
  return result;
}

/**
 * 노드(스토어·파일럿·PRD)에서 BadgeSet — metadata 우선, 없으면 레거시 배열 마이그레이션
 */
export function getBadgeSetFromNodeInput(n: {
  badges?: string[];
  metadata?: NodeMetadata | null;
}): BadgeSet {
  const mb = n.metadata?.badges;
  if (mb && Array.isArray(mb.dev) && Array.isArray(mb.ux) && Array.isArray(mb.prj)) {
    return { dev: [...mb.dev], ux: [...mb.ux], prj: [...mb.prj] };
  }
  return migrateLegacyBadgesToSet(n.badges || []);
}

function uniqUpperStrings(arr: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    const u = String(x).trim().toUpperCase();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/**
 * 3트랙 배지를 **현재 표준 풀**(기본 21개 + 사용자 설정)만 남기고 중복·대소문자 변형 제거.
 * 외부 JSON·CRAZYSHOT류 임의 토큰은 제거(다른 metadata 키는 건드리지 않음).
 */
export function filterBadgeSetToCanonicalPool(set: BadgeSet): BadgeSet {
  const { dev: devS, ux: uxS, prj: prjS } = poolToSets(getEffectiveBadgePool());
  const dev = uniqUpperStrings(set.dev.map((k) => String(k).trim().toUpperCase()).filter((k) => devS.has(k)));
  const ux = uniqUpperStrings(set.ux.map((k) => String(k).trim().toUpperCase()).filter((k) => uxS.has(k)));
  const prj = uniqUpperStrings(set.prj.map((k) => String(k).trim().toUpperCase()).filter((k) => prjS.has(k)));
  return { dev, ux, prj };
}

/**
 * `plannode.tree` v1 입·출력용: 노드의 배지를 **현재 표준 풀**로 정리하고 `badges`(소문자 평면)와 `metadata.badges`를 맞춤.
 * `functionalSpec`·`iaGrid`·`tech` 등 나머지 metadata는 유지.
 */
export function sanitizeNodeBadgesForTreeV1(n: {
  badges?: string[];
  metadata?: NodeMetadata | null;
}): { badges: string[]; metadata?: NodeMetadata } {
  const set = filterBadgeSetToCanonicalPool(getBadgeSetFromNodeInput(n));
  const badges = flattenBadgeSet(set);
  const base: NodeMetadata =
    n.metadata && typeof n.metadata === 'object' && !Array.isArray(n.metadata)
      ? { ...(n.metadata as NodeMetadata) }
      : {};
  delete base.badges;
  if (set.dev.length + set.ux.length + set.prj.length > 0) {
    base.badges = set;
  }
  return {
    badges,
    metadata: Object.keys(base).length > 0 ? base : undefined
  };
}

/** PRD·트리 한 줄에 쓰는 DEV | UX | PRJ 표기 */
export function formatBadgeTracksForDisplay(set: BadgeSet): string {
  const parts: string[] = [];
  if (set.dev.length) parts.push(`DEV: ${set.dev.join(', ')}`);
  if (set.ux.length) parts.push(`UX: ${set.ux.join(', ')}`);
  if (set.prj.length) parts.push(`PRJ: ${set.prj.join(', ')}`);
  return parts.length ? parts.join(' | ') : '—';
}
