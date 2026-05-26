/**
 * Plannode 배지 기반 프롬프트 인젝터
 * - 배지 조합 → AI 프롬프트 조각 자동 생성
 * - 배지별 문서 출력 조건 정의
 *
 * **가져오기·표시 공통 배지 파이프라인(모듈 경계)** — 트리·parent_id는 건드리지 않음:
 * - **표시·직렬화 전**: `getBadgeSetFromNodeInput` (기본값) → 명시 + 구조메타 추론 병합 / inferHints:false → 명시만.
 * - **저장·sanitize**: `sanitizeNodeBadgesForTreeV1` → `getBadgeSetFromNodeInput(n, { inferHints: false })` → 풀 필터(`filterBadgeSetToCanonicalPool`) 후 평면·3트랙 정렬.
 * - **파싱/스토어 래퍼**: `applySanitizeImportedPlannodeNodeV1`가 `sanitizeNodeBadgesForTreeV1` 단일 경로( `plannodeTreeV1`·`upsertImportedPlannodeTreeV1`에서 이중 호출·멱등).
 */

import type { Node } from '$lib/supabase/client';
import type { BadgeSet, NodeMetadata } from './types';
import { resolveImportedBadgeToken } from './badgeImportAliases';
import { inferBadgeHintStringsFromMetadata } from './badgeMetadataInference';
import {
  DEFAULT_DEV_KEYS,
  DEFAULT_UX_KEYS,
  DEFAULT_PRJ_KEYS,
  getEffectiveBadgePool,
  poolToSets,
  type BadgePoolTracks,
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

  ZINDEX: `레이어 순서(z-index)를 명시합니다.
- 모달·토스트·드롭다운·고정 헤더의 스택 순서
- 겹침 시 포커스·클릭 가능 영역`,

  FLEX: `Flexbox 1차원 정렬을 사용합니다.
- 주축·교차축 정렬·wrap 여부
- gap vs margin 역할 분리`,

  CSSGRID: `CSS Grid 2차원 레이아웃을 사용합니다.
- grid-template·행/열 정의
- 영역 이름(grid-area)과 컴포넌트 매핑`,

  MQUERY: `미디어 쿼리(@media)로 반응형을 구현합니다.
- 브레이크포인트 값과 적용 규칙
- 모바일/태블릿/데스크톱별 레이아웃 차이`,

  PADDING: `Padding(내부 여백) 규칙을 명시합니다.
- 컴포넌트·섹션별 padding 토큰
- margin(외부)과 구분`,

  REM: `Rem/Em 상대 단위를 사용합니다.
- 기준 폰트·스케일 단계
- px 고정값과 혼용 시 예외 목록`,

  COMP: `재사용 UI 컴포넌트 단위를 정의합니다.
- 변형(variant)·슬롯·props 표
- Figma/코드 컴포넌트 이름 매핑`,

  STATE: `UI 상태(hover/disabled/active 등)를 정의합니다.
- 상태별 스타일·인터랙션
- 기본/호버/비활성/로딩 표`,

  HARDCOD: `하드코딩·매직넘버를 지양합니다.
- 상수·토큰·설정으로 추출할 값 목록
- 환경별 분기 필요 여부`,

  DYNIX: `동적 인터랙션·모션을 포함합니다.
- 스크롤·제스처·애니메이션 범위
- 접근성( prefers-reduced-motion )`,

  DUMMY: `더미·목 데이터를 사용합니다.
- API 연동 전 샘플 JSON/필드
- empty/loading과 구분`,

  // ===== UX 트랙 (화면 구성 요소 태그) =====

  GNB: `글로벌/상단 내비게이션(GNB)을 포함합니다.
와이어프레임 명세에 포함:
- GNB 항목·활성 표시·딥링크
- LNB/탭바와 역할 구분`,

  LNB: `좌측/사이드 내비(LNB)를 포함합니다.
- 메뉴 계층·접기·현재 위치 표시`,

  SNB: `서브 내비게이션(SNB)을 포함합니다.
- 상위 메뉴 대비 하위 탭·필터`,

  FNB: `푸터 내비(FNB)를 포함합니다.
- 하단 링크·법적 고지·보조 메뉴`,

  HERO: `히어로·메인 배너 영역을 포함합니다.
- 헤드라인·CTA·비주얼 비율`,

  BREAD: `브레드크럼 경로를 포함합니다.
- depth·현재 페이지·클릭 동작`,

  CARO: `캐러셀·슬라이더를 포함합니다.
- 슬라이드 수·인디케이터·자동재생`,

  ACCORD: `아코디언·접이 패널을 포함합니다.
- 기본 펼침·단일/다중 open`,

  POPUP: `팝업·라이트박스(모달과 별도)를 포함합니다.
- 트리거·닫기·포커스 트랩`,

  TOAST: `토스트·스낵바 알림을 포함합니다.
- 위치·지속 시간·스택 규칙
- 성공/실패 메시지 패턴`,

  DROP: `드롭다운·셀렉트 메뉴를 포함합니다.
- 옵션 목록·키보드·검색`,

  CTA: `주요 CTA 버튼을 포함합니다.
- Primary/Secondary 구분·FAB 여부
- 활성/비활성 조건`,

  TAB: `탭·탭바를 포함합니다.
- 탭 목록·스와이프·뱃지`,

  GRID: `레이아웃 그리드 시스템(디자인)을 포함합니다.
- 컬럼 수·거터·브레이크포인트(IA 관점)`,

  COL: `컬럼·열 구조를 포함합니다.
- span·정렬·반응형 열 수`,

  GUTTER: `거터·컬럼 간격을 포함합니다.
- 고정/유동 간격 토큰`,

  MARGIN: `외부 여백(margin)을 포함합니다.
- 섹션·카드 간 마진 규칙`,

  BREAKPT: `브레이크포인트(디자인)를 포함합니다.
- 구간별 레이아웃 변화 요약`,

  WHSPACE: `여백·화이트스페이스 시스템을 포함합니다.
- spacing scale·밀도`,

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

  MODAL: `이 화면은 모달/바텀시트/드로어를 포함합니다.
와이어프레임 명세에 포함:
- 모달 유형: 바텀시트 / 풀스크린 / 드로어
- 트리거·닫기 조건
- 모달 내 주요 액션`,

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

  WIREF: `와이어프레임 산출물을 전제합니다.
- 저충실 블록·섹션 우선순위
- IA 트리와 화면 매핑`,

  PROTO: `프로토타입·인터랙션 검증을 포함합니다.
- 클릭 플로·전환·플레이스홀더`,

  VHIER: `시각 위계(Visual hierarchy)를 명시합니다.
- 타이포·색·대비·시선 흐름`,

  AFFORD: `어포던스·인터랙션 단서를 명시합니다.
- 클릭 가능·드래그·스크롤 힌트`,
};

/**
 * 배지별 라벨 (UI 표시용)
 */
const DEV_CHIP = { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' };
const DEV_CHIP_WARN = { bg: '#fff1f0', text: '#dc2626', border: '#fca5a5' };
const DEV_CHIP_PAY = { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' };
const UX_NAV = { bg: '#dbeafe', text: '#0c4a6e', border: '#7dd3fc' };
const UX_COMP = { bg: '#cffafe', text: '#0e7490', border: '#67e8f9' };
const UX_GRID = { bg: '#e0e7ff', text: '#3730a3', border: '#a5b4fc' };
const UX_BODY = { bg: '#e1e8f0', text: '#1e293b', border: '#cbd5e1' };
const PRJ_CHIP = { bg: '#dcfce7', text: '#166534', border: '#86efac' };
const PRJ_CHIP_WARM = { bg: '#fed7aa', text: '#92400e', border: '#fdba74' };

/** 배지별 라벨 (UI 칩 표시) — `DEFAULT_*_KEYS`와 1:1 */
export const BADGE_LABELS: Record<string, string> = {
  TDD: 'TDD',
  API: 'API',
  AUTH: 'AUTH',
  REALTIME: 'REALTIME',
  PAYMENT: 'PAYMENT',
  ZINDEX: 'Z-Index',
  FLEX: 'Flexbox',
  CSSGRID: 'CSS Grid',
  MQUERY: 'Media Query',
  PADDING: 'Padding',
  REM: 'Rem/Em',
  COMP: 'Component',
  STATE: 'State',
  HARDCOD: 'Hardcode',
  DYNIX: 'Dynamic',
  DUMMY: 'Dummy',
  GNB: 'GNB',
  LNB: 'LNB',
  SNB: 'SNB',
  FNB: 'FNB',
  HERO: 'Hero',
  BREAD: 'Breadcrumb',
  CARO: 'Carousel',
  ACCORD: 'Accordion',
  MODAL: 'Modal',
  POPUP: 'Popup',
  TOAST: 'Toast',
  DROP: 'Dropdown',
  CTA: 'CTA',
  TAB: 'Tab',
  GRID: 'Grid',
  COL: 'Column',
  GUTTER: 'Gutter',
  MARGIN: 'Margin',
  BREAKPT: 'Breakpoint',
  WHSPACE: 'Whitespace',
  HEAD: 'HEAD',
  LIST: 'LIST',
  CARD: 'CARD',
  FORM: 'FORM',
  DASH: 'DASH',
  MEDIA: 'MEDIA',
  USP: 'USP',
  MVP: 'MVP',
  AI: 'AI',
  I18N: 'I18N',
  MOBILE: 'MOBILE',
  WIREF: 'Wireframe',
  PROTO: 'Prototype',
  VHIER: 'Visual Hierarchy',
  AFFORD: 'Affordance',
};

/** 배지별 색상 스타일 (UI 칩용) */
export const BADGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  TDD: DEV_CHIP_WARN,
  API: { bg: '#faf5ff', text: '#7c3aed', border: '#c4b5fd' },
  AUTH: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  REALTIME: { bg: '#ede9fe', text: '#5b21b6', border: '#ddd6fe' },
  PAYMENT: DEV_CHIP_PAY,
  ZINDEX: DEV_CHIP,
  FLEX: DEV_CHIP,
  CSSGRID: DEV_CHIP,
  MQUERY: DEV_CHIP,
  PADDING: DEV_CHIP,
  REM: DEV_CHIP,
  COMP: DEV_CHIP,
  STATE: DEV_CHIP,
  HARDCOD: DEV_CHIP_WARN,
  DYNIX: DEV_CHIP,
  DUMMY: DEV_CHIP,
  GNB: UX_NAV,
  LNB: UX_NAV,
  SNB: UX_NAV,
  FNB: UX_NAV,
  HERO: UX_NAV,
  BREAD: UX_COMP,
  CARO: UX_COMP,
  ACCORD: UX_COMP,
  MODAL: UX_COMP,
  POPUP: UX_COMP,
  TOAST: UX_COMP,
  DROP: UX_COMP,
  CTA: UX_COMP,
  TAB: UX_COMP,
  GRID: UX_GRID,
  COL: UX_GRID,
  GUTTER: UX_GRID,
  MARGIN: UX_GRID,
  BREAKPT: UX_GRID,
  WHSPACE: UX_GRID,
  HEAD: UX_NAV,
  LIST: UX_GRID,
  CARD: UX_GRID,
  FORM: { bg: '#ddd6fe', text: '#5b21b6', border: '#c4b5fd' },
  DASH: UX_BODY,
  MEDIA: UX_BODY,
  USP: PRJ_CHIP,
  MVP: PRJ_CHIP,
  AI: PRJ_CHIP,
  I18N: PRJ_CHIP_WARM,
  MOBILE: PRJ_CHIP_WARM,
  WIREF: PRJ_CHIP_WARM,
  PROTO: PRJ_CHIP_WARM,
  VHIER: PRJ_CHIP_WARM,
  AFFORD: PRJ_CHIP_WARM,
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
export function migrateLegacyBadgesToSet(
  legacyBadges: string[],
  poolParam?: BadgePoolTracks
): BadgeSet {
  const badgeSet: BadgeSet = { dev: [], ux: [], prj: [] };

  if (!legacyBadges || !Array.isArray(legacyBadges)) {
    return badgeSet;
  }

  const pool = poolParam ?? getEffectiveBadgePool();

  for (const badge of legacyBadges) {
    const hit = resolveImportedBadgeToken(String(badge), pool);
    if (!hit) continue;
    const arr = badgeSet[hit.track];
    if (!arr.includes(hit.upper)) arr.push(hit.upper);
  }

  return badgeSet;
}

function coerceImportedBadgeSetFromTracksAndFlat(
  mb: BadgeSet,
  flat: string[],
  pool: BadgePoolTracks
): BadgeSet {
  const out: BadgeSet = { dev: [], ux: [], prj: [] };
  const add = (hit: { track: keyof BadgePoolTracks; upper: string }) => {
    const arr = out[hit.track];
    if (!arr.includes(hit.upper)) arr.push(hit.upper);
  };
  const consume = (vals: unknown[]) => {
    for (const v of vals) {
      if (typeof v !== 'string' && typeof v !== 'number') continue;
      const hit = resolveImportedBadgeToken(String(v), pool);
      if (hit) add(hit);
    }
  };
  consume(mb.dev);
  consume(mb.ux);
  consume(mb.prj);
  consume(flat);
  return out;
}

function mergeBadgeSets(a: BadgeSet, b: BadgeSet): BadgeSet {
  const mergeTrack = (x: string[], y: string[]) => {
    const seen = new Set<string>();
    const o: string[] = [];
    for (const t of [...x, ...y]) {
      const u = String(t).trim().toUpperCase();
      if (!u || seen.has(u)) continue;
      seen.add(u);
      o.push(u);
    }
    return o;
  };
  return {
    dev: mergeTrack(a.dev, b.dev),
    ux: mergeTrack(a.ux, b.ux),
    prj: mergeTrack(a.prj, b.prj)
  };
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
 *
 * 기본값(opts.inferHints 미지정 또는 undefined): **명시 배지 + 구조 메타 추론 병합**
 * opts.inferHints: false: 명시 배지만 반환 (저장·sanitize 경로 전용)
 *
 * @param n 노드 입력 (badges, metadata, name, description)
 * @param opts 옵션. { inferHints?: boolean } — false 지정 시 추론 스킵 (기본값: 추론 병합)
 * @returns BadgeSet (명시+추론 또는 명시만)
 */
export function getBadgeSetFromNodeInput(
  n: {
    badges?: string[];
    metadata?: NodeMetadata | null;
    name?: string;
    description?: string;
  },
  opts?: { inferHints?: boolean }
): BadgeSet {
  const pool = getEffectiveBadgePool();
  const mb = n.metadata?.badges;
  const hasTrackShape =
    mb &&
    typeof mb === 'object' &&
    !Array.isArray(mb) &&
    Array.isArray((mb as BadgeSet).dev) &&
    Array.isArray((mb as BadgeSet).ux) &&
    Array.isArray((mb as BadgeSet).prj);

  let base: BadgeSet;
  if (hasTrackShape) {
    base = coerceImportedBadgeSetFromTracksAndFlat(mb as BadgeSet, n.badges || [], pool);
  } else {
    base = migrateLegacyBadgesToSet(n.badges || [], pool);
  }

  // 기본값: 추론 병합 활성화 (표시 경로)
  // false만 지정되면 명시 배지만 반환 (저장 경로·sanitize)
  if (opts?.inferHints === false) {
    return base;
  }

  // 추론 활성화: 명시 배지 + 구조 메타 키워드/학습 규칙 병합
  const hints = inferBadgeHintStringsFromMetadata({
    name: n.name,
    description: n.description,
    metadata: n.metadata ?? null
  });
  if (!hints.length) return base;
  const inferred = migrateLegacyBadgesToSet(hints, pool);
  return mergeBadgeSets(base, inferred);
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
 * 3트랙 배지를 **현재 표준 풀**(기본 DEV/UX/PRJ 풀 + 사용자 설정)만 남기고 중복·대소문자 변형 제거.
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
 *
 * **저장 정책**: `getBadgeSetFromNodeInput` 호출 시 반드시 `{ inferHints: false }` 명시.
 * 저장·가져오기 경로에서는 **명시 배지만** 정리하고, 구조 메타/사용자/AI 학습 규칙 추론은 제외한다 (버그 B 차단).
 */
export function sanitizeNodeBadgesForTreeV1(n: {
  badges?: string[];
  metadata?: NodeMetadata | null;
  name?: string;
  description?: string;
}): { badges: string[]; metadata?: NodeMetadata } {
  const set = filterBadgeSetToCanonicalPool(
    getBadgeSetFromNodeInput(
      {
        badges: n.badges,
        metadata: n.metadata,
        name: n.name,
        description: n.description
      },
      { inferHints: false } // 명시 호출: 저장 경로는 명시 배지만 정리
    )
  );
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

/**
 * 가져오기·클라우드 슬라이스 등 **저장/파싱 산출물**에 동일 배지 규칙 적용.
 * `sanitizeNodeBadgesForTreeV1` 단일 구현을 쓰며, `plannodeTreeV1`·`upsertImportedPlannodeTreeV1`에서 재사용한다.
 */
export function applySanitizeImportedPlannodeNodeV1(node: Node): Node {
  const san = sanitizeNodeBadgesForTreeV1({
    badges: node.badges ?? [],
    metadata: node.metadata,
    name: node.name,
    description: node.description
  });
  return { ...node, badges: san.badges, metadata: san.metadata };
}

/** PRD·트리 한 줄에 쓰는 DEV | UX | PRJ 표기 */
export function formatBadgeTracksForDisplay(set: BadgeSet): string {
  const parts: string[] = [];
  if (set.dev.length) parts.push(`DEV: ${set.dev.join(', ')}`);
  if (set.ux.length) parts.push(`UX: ${set.ux.join(', ')}`);
  if (set.prj.length) parts.push(`PRJ: ${set.prj.join(', ')}`);
  return parts.length ? parts.join(' | ') : '—';
}
