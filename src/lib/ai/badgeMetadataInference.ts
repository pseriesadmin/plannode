/**
 * 노드 `metadata`·설명 등에서 배지 파이프라인 힌트를 추론한다.
 * - 가져오기·캔버스 표시 공통: `getBadgeSetFromNodeInput`에서 명시 배지와 병합.
 * - 기본 규칙 = 코드에 내장된 "사전 학습" 패턴; 사용자 규칙은 localStorage로 확장.
 *
 * `inferBadgeHintStringsFromMetadata` 힌트 **병합 순서**(민감도·우선권):
 * 1. `treeImportExtras` — 가져온 JSON에 붙은 구조화 플래그(가장 신뢰).
 * 2. `iaGrid` — `screenType`·`path` 등 화면 archetype(구조 메타 우선).
 * 3. `keywordHints` — functionalSpec·iaGrid·tech 합성 문자열 + name + description 정규식.
 * 4. 사용자 규칙(`plannode.badgeInferenceUserRules.v1`).
 * 5. AI 누적 학습(`plannode.badgeInferenceAiLearnedRules.v1`).
 */

import type { BadgeSet, NodeMetadata } from './types';
import { resolveImportedBadgeToken } from './badgeImportAliases';
import { getEffectiveBadgePool } from './badgePoolConfig';

const USER_RULES_STORAGE_KEY = 'plannode.badgeInferenceUserRules.v1';
const AI_LEARNED_RULES_STORAGE_KEY = 'plannode.badgeInferenceAiLearnedRules.v1';

/** AI 학습 규칙 최대 개수 — 초과 시 배열 앞쪽(오래된 항목)부터 드롭 */
export const AI_LEARNED_RULES_MAX = 400;

const DESC_NEEDLE_MIN = 12;
const DESC_NEEDLE_MAX = 96;
const HAYSTACK_LINE_MIN = 8;
const HAYSTACK_NEEDLE_MAX = 120;
/** 구조 메타 hay 전체가 너무 짧으면 라인 시그니처 학습 생략 */
const HAYSTACK_BODY_MIN = 24;

/** 추론 파이프에서 힌트의 최대 개수 (과다 배지 방지) */
const MAX_HINTS_PER_NODE = 6;

let memoryUserRules: UserBadgeInferenceRule[] = [];

export type UserBadgeInferenceRule = {
  /** `description` | `name` | `metadataHaystack`(기능명세·IA·tech 등 합친 문자열) */
  field: 'description' | 'name' | 'metadataHaystack';
  /** 대소문자 무시 부분 문자열 */
  contains: string;
  /** `resolveImportedBadgeToken`에 넘길 힌트(동의어·표준 토큰 혼용 가능) */
  suggestBadges: string[];
};

export type UserBadgeInferenceConfig = { rules: UserBadgeInferenceRule[] };

function truthy(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'true' || s === 'yes' || s === 'y' || s === '1';
  }
  return false;
}

function haystackFromStructuredMeta(meta: NodeMetadata): string {
  const parts: string[] = [];
  const fs = meta.functionalSpec;
  if (fs && typeof fs === 'object') {
    parts.push(
      String(fs.userTypes ?? ''),
      String(fs.io ?? ''),
      String(fs.exceptions ?? ''),
      String(fs.priority ?? '')
    );
  }
  const ig = meta.iaGrid;
  if (ig && typeof ig === 'object') {
    parts.push(
      String(ig.loginRequired ?? ''),
      String(ig.apiResources ?? ''),
      String(ig.screenType ?? ''),
      String(ig.path ?? ''),
      String(ig.routePattern ?? ''),
      String(ig.authScope ?? ''),
      String(ig.accessLevel ?? '')
    );
  }
  const tech = meta.tech;
  if (Array.isArray(tech)) parts.push(tech.map(String).join(' '));
  else if (tech != null) parts.push(String(tech));
  return parts.join('\n');
}

function normalizeLearningWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** 첫 줄 발췌 — 제목과 중복되거나 너무 짧으면 null */
function pickDescriptionNeedleForLearning(rawDesc: string, name: string): string | null {
  const line = String(rawDesc ?? '').split(/\r?\n/, 1)[0] ?? '';
  let needle = normalizeLearningWhitespace(line);
  if (needle.length < DESC_NEEDLE_MIN) return null;
  if (needle.length > DESC_NEEDLE_MAX) needle = needle.slice(0, DESC_NEEDLE_MAX);
  if (/^[\d\s.|\\/\-_:]+$/.test(needle)) return null;
  const nameT = name.trim();
  const nl = needle.toLowerCase();
  const mt = nameT.toLowerCase();
  if (mt && nl === mt) return null;
  if (mt.length >= 4 && nl.startsWith(mt) && needle.length <= nameT.length + 2) return null;
  return needle;
}

/** 구조화 메타 hay에서 한 줄 시그니처 — 제목과 동일·포함만 한 짧은 줄은 제외 */
function pickHaystackNeedleForLearning(hay: string, name: string): string | null {
  const compact = hay.replace(/\s+/g, ' ').trim();
  if (compact.length < HAYSTACK_BODY_MIN) return null;
  const lines = hay.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const nameT = name.trim().toLowerCase();
  let best: string | null = null;
  let bestLen = 0;
  for (const raw of lines) {
    const line = raw.length > HAYSTACK_NEEDLE_MAX ? raw.slice(0, HAYSTACK_NEEDLE_MAX) : raw;
    if (line.length < HAYSTACK_LINE_MIN) continue;
    const ll = line.toLowerCase();
    if (nameT.length >= 4 && ll === nameT) continue;
    if (nameT.length >= 4 && line.length <= nameT.length + 2 && nameT.includes(ll)) continue;
    if (/^[\d\s.|\\/\-_:]+$/.test(line)) continue;
    if (line.length > bestLen) {
      bestLen = line.length;
      best = line;
    }
  }
  return best;
}

function capAiLearnedRulesList(rules: UserBadgeInferenceRule[]): UserBadgeInferenceRule[] {
  if (rules.length <= AI_LEARNED_RULES_MAX) return rules;
  return rules.slice(-AI_LEARNED_RULES_MAX);
}

/** 외부 JSON v2 등 `treeImportExtras`에 흔한 플래그만 읽는다(전체 JSON 문자열 스캔 비용 회피). */
function hintsFromTreeImportExtras(meta: NodeMetadata): string[] {
  const out: string[] = [];
  const ex = meta.treeImportExtras;
  if (!ex || typeof ex !== 'object' || Array.isArray(ex)) return out;
  const o = ex as Record<string, unknown>;
  if (truthy(o.isTDD) || truthy(o.tdd_required) || truthy(o.tdd)) out.push('TDD');
  if (truthy(o.hasPayment) || truthy(o.payment) || truthy(o.requiresPayment)) out.push('PAYMENT');
  if (truthy(o.hasAuth) || truthy(o.authRequired) || truthy(o.loginRequired)) out.push('AUTH');
  if (truthy(o.realtime) || truthy(o.websocket) || truthy(o.liveSync)) out.push('REALTIME');
  if (truthy(o.hasApi) || truthy(o.api)) out.push('API');
  if (truthy(o.ai) || truthy(o.llm) || truthy(o.genai)) out.push('AI');
  if (truthy(o.mobileFirst) || truthy(o.mobile)) out.push('MOBILE');
  if (truthy(o.i18n) || truthy(o.multilingual)) out.push('I18N');
  if (truthy(o.mvp) || truthy(o.isMvp)) out.push('MVP');
  return out;
}

/** `metadata.iaGrid` screenType·path — UX archetype (keywordHints보다 우선). */
function hintsFromIaGrid(meta: NodeMetadata): string[] {
  const out: string[] = [];
  const ig = meta.iaGrid;
  if (!ig || typeof ig !== 'object') return out;
  const screen = String(ig.screenType ?? '').trim().toLowerCase();
  const path = String(ig.path ?? ig.routePattern ?? '').trim().toLowerCase();
  const blob = `${screen} ${path}`;
  const push = (token: string) => {
    if (!out.includes(token)) out.push(token);
  };

  if (/\b(list|listing|table|grid_view|datagrid)\b/.test(screen) || /\b(list|listing|browse)\b/.test(path)) {
    push('LIST');
  }
  if (/\bform\b/.test(screen) || /\b(form|register|signup|edit)\b/.test(path)) push('FORM');
  if (/\bdashboard\b/.test(screen) || /\bdashboard\b/.test(path)) push('DASH');
  if (/\b(detail|card)\b/.test(screen) || /\b(detail|card)\b/.test(path)) push('CARD');
  if (/\bmodal\b/.test(screen)) push('MODAL');
  if (/\b(popup|dialog)\b/.test(screen)) push('POPUP');

  return out;
}

/**
 * 구조화 메타(hay) + name + desc에서 배지 키워드 힌트를 추론한다.
 * 블록 순서(앞쪽 우선, MAX_HINTS_PER_NODE와 쌍): UX 구조 → UX 컴포넌트 → UX 그리드 → DEV CSS → DEV UI/상태 → DEV 데이터 → DEV 프로세스 → 기존 DEV/UX/PRJ.
 * UX `GRID` vs DEV `CSSGRID`·`BREAKPT` vs `MQUERY`는 패턴을 분리한다(§B.3).
 */
function keywordHints(hay: string, name: string, desc: string): string[] {
  const raw = `${hay}\n${name}\n${desc}`;
  const t = raw.toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  const ko = (subs: string[]) => subs.some((s) => raw.includes(s));
  const push = (token: string) => {
    if (seen.has(token)) return;
    seen.add(token);
    out.push(token);
  };

  // UX — 구조·내비
  if (/\blnb\b/i.test(t) || /\bside\s*bar\b/i.test(t) || ko(['좌측 메뉴', '사이드바', '사이드 네비'])) push('LNB');
  if (/\bsnb\b/i.test(t) || /\bsub\s*nav/i.test(t) || ko(['서브 메뉴', '서브네비'])) push('SNB');
  if (/\bfnb\b/i.test(t) || /\bfooter\s*nav/i.test(t) || ko(['푸터 메뉴', '하단 메뉴', '푸터 내비'])) push('FNB');
  if (/\bhero\b/i.test(t) || ko(['히어로', '메인 배너', '히어로 섹션'])) push('HERO');
  if (
    /\b(gnb|global\s*nav|top\s*nav|menubar)\b/i.test(t) ||
    ko(['글로벌 내비', '상단 메뉴', 'gnb']) ||
    ((/\b(navigation|nav|menu)\b/i.test(t) || ko(['내비', '메뉴'])) && !seen.has('LNB'))
  ) {
    push('GNB');
  }

  // UX — 컴포넌트
  if (/\b(breadcrumb|breadcrumbs)\b/i.test(t) || ko(['브레드크럼', '경로 표시'])) push('BREAD');
  if (/\b(carousel|slider)\b/i.test(t) || ko(['캐러셀', '슬라이더'])) push('CARO');
  if (/\baccordion\b/i.test(t) || ko(['아코디언', '접이'])) push('ACCORD');
  if (/\b(popup|lightbox|pop-up)\b/i.test(t) && !/\bmodal\b/i.test(t)) push('POPUP');
  if (/\b(modal|dialog|bottom\s*sheet)\b/i.test(t) || ko(['바텀시트', '드로어', '모달'])) push('MODAL');
  if (/\b(toast|snackbar)\b/i.test(t) || ko(['토스트', '스낵바', '알림 토스트'])) push('TOAST');
  if (/\b(dropdown|drop-down|select\s*menu)\b/i.test(t) || ko(['드롭다운', '셀렉트 메뉴'])) push('DROP');
  if (/\b(cta|call\s*to\s*action)\b/i.test(t) || ko(['cta', '행동 유도', '주요 버튼'])) push('CTA');
  if (/\b(tab\s*bar|tabbar|\btabs\b)\b/i.test(t) || ko(['탭', '탭바'])) push('TAB');

  // UX — 그리드·반응형(디자인/IA)
  if (
    /\b(grid\s*system|12\s*column|layout\s*grid)\b/i.test(t) ||
    ko(['12컬럼', '그리드 시스템', '레이아웃 그리드'])
  ) {
    push('GRID');
  }
  if (/\bgutter\b/i.test(t) || ko(['거터', '컬럼 간격'])) push('GUTTER');
  if (/\b(columns?|col\s*span)\b/i.test(t) && (seen.has('GRID') || ko(['컬럼']))) push('COL');
  if (/\b(breakpoint|break\s*point)\b/i.test(t) || ko(['브레이크포인트', '반응형 구간'])) push('BREAKPT');
  if (/\b(margin|outer\s*margin)\b/i.test(t) || ko(['외부 여백', '레이아웃 마진'])) push('MARGIN');
  if (/\b(whitespace|white\s*space)\b/i.test(t) || ko(['여백 시스템', '화이트스페이스'])) push('WHSPACE');

  // DEV — 퍼블·CSS
  if (/\b(z-index|zindex|stacking\s*context)\b/i.test(t) || ko(['z-index', 'z인덱스', '레이어 순서'])) push('ZINDEX');
  if (/\b(flexbox|flex\s*layout|display\s*:\s*flex)\b/i.test(t) || ko(['flexbox', 'flex 레이아웃', '플렉스'])) {
    push('FLEX');
  }
  if (
    /\b(css\s*grid|display\s*:\s*grid)\b/i.test(t) ||
    (ko(['css grid', 'display grid']) && /\b(css|display|grid)\b/i.test(t))
  ) {
    push('CSSGRID');
  }
  if (/\b(media\s*query|@media)\b/i.test(t) || ko(['미디어 쿼리', 'media query'])) push('MQUERY');
  if (/\bpadding\b/i.test(t) || ko(['패딩', '내부 여백'])) push('PADDING');
  if (
    /\b\d+(\.\d+)?\s*(rem|em)\b/i.test(t) ||
    /\b(rem|em)\s*(unit|scale|typography)\b/i.test(t) ||
    ko(['상대 단위', 'px vs rem', 'rem 단위'])
  ) {
    push('REM');
  }

  // DEV — UI·상태
  if (
    /\b(component|ui\s*component|reusable\s*block)\b/i.test(t) ||
    ko(['컴포넌트', '재사용 블록', 'ui 컴포넌트'])
  ) {
    push('COMP');
  }
  if (
    /\b(ui\s*state|hover|disabled|active\s*state)\b/i.test(t) ||
    ko(['상태 관리', 'hover', 'disabled', '활성 상태'])
  ) {
    push('STATE');
  }
  if (/\b(hardcod(e|ing)|hard\s*coded)\b/i.test(t) || ko(['하드코딩', '고정값'])) push('HARDCOD');
  if (
    /\b(dynamic\s*interaction|scroll\s*animation|micro\s*interaction)\b/i.test(t) ||
    ko(['동적 인터랙션', '스크롤 애니'])
  ) {
    push('DYNIX');
  }

  if (/\b(dummy\s*data|mock\s*data|fixture)\b/i.test(t) || ko(['더미', '샘플 데이터', '목 데이터'])) {
    push('DUMMY');
  }

  // 기존 DEV·UX·PRJ (품질 유지)
  if (
    /\b(stripe|toss|checkout|billing|payment)\b/i.test(t) ||
    /\bpg\b/i.test(t) ||
    ko(['결제', '청구', '유료'])
  ) {
    push('PAYMENT');
  }
  if (/\b(auth|oauth|jwt|login|session)\b/i.test(t) || ko(['인증', '로그인', '권한'])) push('AUTH');
  if (
    /\b(realtime|websocket|\bws\b|supabase\s*realtime|live)\b/i.test(t) ||
    ko(['실시간', '구독'])
  ) {
    push('REALTIME');
  }
  if (/\b(api|rest|graphql|grpc|openapi|endpoint|rpc)\b/i.test(t) || ko(['웹훅'])) push('API');
  if (/\b(tdd|unit\s*test)\b/i.test(t) || ko(['테스트 주도', '단위 테스트'])) push('TDD');
  if (
    (/\b(form|input\s*field|validation|submit)\b/i.test(t) &&
      (ko(['입력', '유효성', '제출', '폼']) || /\bform\b/i.test(t))) ||
    ko(['입력 폼', '유효성 검증', '폼 제출'])
  ) {
    push('FORM');
  }
  if (
    /\b(listing|pagination|datagrid|data\s*grid)\b/i.test(t) ||
    ko(['목록', '페이지네이션', '리스팅']) ||
    (/\blist\b/i.test(t) && ko(['목록', '리스트']))
  ) {
    push('LIST');
  }
  if (/\b(upload|image|video)\b/i.test(t) || ko(['미디어', '업로드'])) push('MEDIA');
  if (/\b(llm|gpt|claude|genai|generative)\b/i.test(t)) push('AI');
  if (ko(['ai 기능', 'AI 기능'])) push('AI');
  if (/\b(mobile|ios|android)\b/i.test(t) || ko(['모바일', '모바일 우선'])) push('MOBILE');
  if (/\b(i18n|l10n|locale)\b/i.test(t) || ko(['다국어', '번역'])) push('I18N');
  if (/\bmvp\b/i.test(t) || ko(['mvp', '최소 기능'])) push('MVP');
  if (/\b(usp|differentiation)\b/i.test(t) || ko(['차별'])) push('USP');
  if (/\b(wireframe|wire\s*frame)\b/i.test(t) || ko(['와이어프레임'])) push('WIREF');
  if (/\b(prototype|proto\s*type)\b/i.test(t) || ko(['프로토타입', '프로토'])) push('PROTO');
  if (/\bvisual\s*hierarchy\b/i.test(t) || ko(['시각 위계', 'visual hierarchy'])) push('VHIER');
  if (/\baffordance\b/i.test(t) || ko(['어포던스'])) push('AFFORD');

  return out;
}

export function getUserBadgeInferenceRules(): UserBadgeInferenceRule[] {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(USER_RULES_STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as UserBadgeInferenceConfig;
        if (Array.isArray(p?.rules)) return p.rules;
      }
    } catch {
      /* ignore */
    }
  }
  return [...memoryUserRules];
}

/** 브라우저 설정 — 추후 UI에서 호출 가능 */
export function setUserBadgeInferenceRules(rules: UserBadgeInferenceRule[]): void {
  memoryUserRules = [...rules];
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(USER_RULES_STORAGE_KEY, JSON.stringify({ rules: memoryUserRules }));
    } catch {
      /* quota 등 */
    }
  }
}

/** 규칙 초기화(테스트·설정 리셋) */
export function clearBadgeInferenceUserRules(): void {
  memoryUserRules = [];
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(USER_RULES_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

type AiLearnedPersistV1 = { v: 1; updatedAt: string; rules: UserBadgeInferenceRule[] };

function ruleMergeKey(r: UserBadgeInferenceRule): string {
  return `${r.field}\0${String(r.contains).toLowerCase().trim()}`;
}

/** 외부 AI·타 트리 가져오기로 누적되는 메타 매핑(표준 풀로 해석되는 토큰만 저장). */
export function getAiLearnedBadgeInferenceRules(): UserBadgeInferenceRule[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(AI_LEARNED_RULES_STORAGE_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as AiLearnedPersistV1;
    if (p?.v === 1 && Array.isArray(p.rules)) return p.rules;
  } catch {
    /* ignore */
  }
  return [];
}

function saveAiLearnedRules(rules: UserBadgeInferenceRule[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      AI_LEARNED_RULES_STORAGE_KEY,
      JSON.stringify({ v: 1, updatedAt: new Date().toISOString(), rules })
    );
  } catch {
    /* quota */
  }
}

function mergeLearnedRuleLists(
  existing: UserBadgeInferenceRule[],
  incoming: UserBadgeInferenceRule[]
): UserBadgeInferenceRule[] {
  const m = new Map<string, UserBadgeInferenceRule>();
  for (const r of existing) {
    if (!r?.contains || !Array.isArray(r.suggestBadges)) continue;
    const trimmed = String(r.contains).trim();
    // **방어(플랜 D)**: 빈 needle은 저장되지 않도록
    if (!trimmed) continue;
    const k = ruleMergeKey(r);
    m.set(k, {
      field: r.field,
      contains: trimmed,
      suggestBadges: [...r.suggestBadges.map(String)]
    });
  }
  for (const r of incoming) {
    if (!r?.contains || !Array.isArray(r.suggestBadges)) continue;
    const trimmed = String(r.contains).trim();
    // **방어(플랜 D)**: 빈 needle은 저장되지 않도록
    if (!trimmed) continue;
    const k = ruleMergeKey(r);
    const prev = m.get(k);
    const sug = r.suggestBadges.map(String).filter(Boolean);
    if (!prev) {
      m.set(k, { field: r.field, contains: trimmed, suggestBadges: [...new Set(sug)] });
      continue;
    }
    const seen = new Set(prev.suggestBadges.map(String));
    for (const b of sug) {
      if (!seen.has(b)) {
        seen.add(b);
        prev.suggestBadges.push(b);
      }
    }
  }
  return [...m.values()];
}

function flattenResolvedBadgesFromTracks(mb: unknown, pool: ReturnType<typeof getEffectiveBadgePool>): string[] {
  if (!mb || typeof mb !== 'object' || Array.isArray(mb)) return [];
  const b = mb as BadgeSet;
  const tracks = [b.dev, b.ux, b.prj].flatMap((x) => (Array.isArray(x) ? x : []));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tracks) {
    const r = resolveImportedBadgeToken(String(raw), pool);
    if (r && !seen.has(r.upper)) {
      seen.add(r.upper);
      out.push(r.upper);
    }
  }
  return out;
}

export type MergeLearnedBadgeRulesStats = {
  nodesProcessed: number;
  rulesBefore: number;
  rulesAfter: number;
};

/** 가져오기 학습용 노드 스냅샷 — `description`은 선택 */
export type ImportedNodeForBadgeLearning = {
  name?: string;
  description?: string;
  metadata?: unknown;
};

/**
 * 가져온 노드 목록에서 `metadata.badges`가 채워진 항목을 읽어 누적 학습한다.
 * — `name` 전체 일치 규칙(기존)
 * — 조건부: 설명 첫 줄 발췌(`description`), 구조화 메타 한 줄(`metadataHaystack`)
 * 동일 키(field+contains)는 suggestBadges만 합친다. 규칙 수는 `AI_LEARNED_RULES_MAX`로 상한.
 */
export function mergeLearnedBadgeRulesFromImportedNodes(
  nodes: readonly ImportedNodeForBadgeLearning[]
): MergeLearnedBadgeRulesStats {
  const pool = getEffectiveBadgePool();
  const rulesBefore = getAiLearnedBadgeInferenceRules().length;
  const incoming: UserBadgeInferenceRule[] = [];
  let nodesProcessed = 0;

  for (const node of nodes) {
    const name = String(node.name ?? '').trim();
    const meta =
      node.metadata && typeof node.metadata === 'object' && !Array.isArray(node.metadata)
        ? (node.metadata as NodeMetadata)
        : null;
    const mb = meta?.badges;
    const tokens = flattenResolvedBadgesFromTracks(mb, pool);
    if (!tokens.length) continue;
    if (name.length < 4 || name.length > 120) continue;
    if (/^[\d\s.|\\/\-_:]+$/.test(name)) continue;

    incoming.push({ field: 'name', contains: name, suggestBadges: tokens });

    const descRaw = String(node.description ?? '');
    const descNeedle = pickDescriptionNeedleForLearning(descRaw, name);
    if (descNeedle) {
      incoming.push({ field: 'description', contains: descNeedle, suggestBadges: tokens });
    }

    if (meta) {
      const hay = haystackFromStructuredMeta(meta);
      const hayNeedle = pickHaystackNeedleForLearning(hay, name);
      if (hayNeedle) {
        incoming.push({ field: 'metadataHaystack', contains: hayNeedle, suggestBadges: tokens });
      }
    }

    nodesProcessed++;
  }

  let merged = mergeLearnedRuleLists(getAiLearnedBadgeInferenceRules(), incoming);
  merged = capAiLearnedRulesList(merged);
  saveAiLearnedRules(merged);
  return {
    nodesProcessed,
    rulesBefore,
    rulesAfter: merged.length
  };
}

/**
 * `plannode.tree` JSON 객체(또는 `{ nodes: [...] }`만 있는 객체)에서 노드를 꺼내 학습 병합.
 * 브라우저에서 파일 로드·붙여넣기 API 등으로 호출 가능.
 */
export function mergeLearnedBadgeRulesFromPlannodeExportUnknown(obj: unknown): MergeLearnedBadgeRulesStats | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const nodes = o.nodes;
  if (!Array.isArray(nodes)) return null;
  return mergeLearnedBadgeRulesFromImportedNodes(nodes as ImportedNodeForBadgeLearning[]);
}

/** 테스트·디버그용 — AI 학습 규칙만 초기화 */
export function clearAiLearnedBadgeInferenceRules(): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(AI_LEARNED_RULES_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** 사용자 규칙·AI 학습 규칙 공통 매칭 */
export function applyBadgeInferenceRules(
  rules: UserBadgeInferenceRule[],
  hayMeta: string,
  name: string,
  desc: string
): string[] {
  const hayLower = hayMeta.toLowerCase();
  const nameL = name.toLowerCase();
  const descL = desc.toLowerCase();
  const out: string[] = [];
  for (const r of rules) {
    if (!r?.contains || !Array.isArray(r.suggestBadges)) continue;
    const needle = String(r.contains).trim().toLowerCase();
    // **방어(플랜 C)**: 빈/공백-only needle은 모든 문자열에 match하므로 차단
    if (!needle) continue;
    let hit = false;
    if (r.field === 'name') hit = nameL.includes(needle);
    else if (r.field === 'description') hit = descL.includes(needle);
    else hit = hayLower.includes(needle) || nameL.includes(needle) || descL.includes(needle);
    if (hit) out.push(...r.suggestBadges.map(String));
  }
  return out;
}

/**
 * 명시 `badges` / `metadata.badges` 외에 메타에서 끌어올 **평면 힌트 문자열**(동의어·키워드·extras·사용자·AI 학습 규칙).
 * 파일 상단 주석의 **1→2→3→4 순서**로 합친 뒤, 대문자 토큰 단위로 중복 제거(먼저 나온 것 유지).
 * `migrateLegacyBadgesToSet`·`resolveImportedBadgeToken`으로 이어지므로 표준 풀 밖은 자연 제거.
 * 
 * **진공 노드 조기 반환(플랜 A)**: name/desc/structuredMeta 모두 비어 있으면 추론 전체 스킵 → 명시 배지만 유지.
 */
export function inferBadgeHintStringsFromMetadata(n: {
  name?: string;
  description?: string;
  metadata?: NodeMetadata | null;
}): string[] {
  const meta = n.metadata && typeof n.metadata === 'object' && !Array.isArray(n.metadata) ? n.metadata : null;
  const name = String(n.name ?? '').trim();
  const desc = String(n.description ?? '').trim();
  const hayStructured = meta ? haystackFromStructuredMeta(meta as NodeMetadata).trim() : '';
  
  // **진공 노드**: 제목·설명·구조 hay + treeImportExtras 모두 비어 있음
  const extras = meta ? hintsFromTreeImportExtras(meta as NodeMetadata) : [];
  if (!name && !desc && !hayStructured && !extras.length) {
    return []; // 명시 배지만 유지, 추론 전체 스킵
  }

  const fromExtras = extras;
  const fromIaGrid = meta ? hintsFromIaGrid(meta as NodeMetadata) : [];
  const fromKw = keywordHints(hayStructured, name, desc);
  const fromUser = applyBadgeInferenceRules(getUserBadgeInferenceRules(), hayStructured, name, desc);
  const fromAiLearned = applyBadgeInferenceRules(getAiLearnedBadgeInferenceRules(), hayStructured, name, desc);

  const seen = new Set<string>();
  const out: string[] = [];

  // 우선순위: treeImportExtras → iaGrid → keywordHints → 사용자규칙 → AI학습규칙
  for (const x of [...fromExtras, ...fromIaGrid, ...fromKw, ...fromUser, ...fromAiLearned]) {
    const s = String(x).trim();
    if (!s || seen.has(s)) continue;

    // 상한 체크: MAX_HINTS_PER_NODE 초과 시 낮은 우선순위부터 드롭
    if (out.length >= MAX_HINTS_PER_NODE) {
      break;
    }

    seen.add(s);
    out.push(s);
  }
  return out;
}
