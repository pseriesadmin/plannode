/**
 * 노드 `metadata`·설명 등에서 배지 파이프라인 힌트를 추론한다.
 * - 가져오기·캔버스 표시 공통: `getBadgeSetFromNodeInput`에서 명시 배지와 병합.
 * - 기본 규칙 = 코드에 내장된 "사전 학습" 패턴; 사용자 규칙은 localStorage로 확장.
 *
 * `inferBadgeHintStringsFromMetadata` 힌트 **병합 순서**(민감도·우선권):
 * 1. `treeImportExtras` — 가져온 JSON에 붙은 구조화 플래그(가장 신뢰).
 * 2. `keywordHints` — functionalSpec·iaGrid·tech 합성 문자열 + name + description 에 대한 정규식(본문 우연 일치 가능, §4 비기능).
 * 3. 사용자 규칙(`plannode.badgeInferenceUserRules.v1`) — 부분 문자열 매치, 동일 토큰은 앞선 단계가 먼저 나오면 중복 제거.
 * 4. AI·외부 트리에서 누적 학습한 규칙(`plannode.badgeInferenceAiLearnedRules.v1`) — 가져오기 시 노드 제목·(조건부) 설명 발췌·구조화 메타 haystack으로 매핑 배지 갱신·병합.
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
  if (truthy(o.crud)) out.push('CRUD');
  if (truthy(o.ai) || truthy(o.llm) || truthy(o.genai)) out.push('AI');
  if (truthy(o.mobileFirst) || truthy(o.mobile)) out.push('MOBILE');
  if (truthy(o.i18n) || truthy(o.multilingual)) out.push('I18N');
  if (truthy(o.mvp) || truthy(o.isMvp)) out.push('MVP');
  return out;
}

function keywordHints(hay: string, name: string, desc: string): string[] {
  const raw = `${hay}\n${name}\n${desc}`;
  const t = raw.toLowerCase();
  const out: string[] = [];
  /** `\b`는 ECMAScript에서 ASCII 단어에만 안정적이라 한글 토큰은 부분 문자열로 검사한다. */
  const ko = (subs: string[]) => subs.some((s) => raw.includes(s));

  const push = (tok: string, re: RegExp) => {
    if (re.test(t)) out.push(tok);
  };

  if (
    /\b(stripe|toss|checkout|billing|payment)\b/i.test(t) ||
    /\bpg\b/i.test(t) ||
    ko(['결제', '청구', '유료'])
  ) {
    out.push('PAYMENT');
  }
  if (/\b(auth|oauth|jwt|login|session)\b/i.test(t) || ko(['인증', '로그인', '권한'])) out.push('AUTH');
  if (
    /\b(realtime|websocket|\bws\b|supabase\s*realtime|live)\b/i.test(t) ||
    ko(['실시간', '구독'])
  ) {
    out.push('REALTIME');
  }
  if (/\b(api|rest|graphql|grpc|openapi|endpoint|rpc)\b/i.test(t) || ko(['웹훅'])) out.push('API');
  if (/\b(tdd|unit\s*test)\b/i.test(t) || ko(['테스트 주도', '단위 테스트'])) out.push('TDD');
  push('CRUD', /\bcrud\b/i);
  if (/\b(form|validation)\b/i.test(t) || ko(['입력 폼', '유효성'])) out.push('FORM');
  if (/\b(list|listing|pagination)\b/i.test(t) || ko(['목록', '페이지네이션'])) out.push('LIST');
  if (/\b(modal|dialog|popup)\b/i.test(t) || ko(['바텀시트', '드로어'])) out.push('MODAL');
  if (/\b(navigation|gnb|lnb|sidebar)\b/i.test(t) || ko(['내비', '메뉴'])) out.push('NAVI');
  if (/\b(upload|image|video)\b/i.test(t) || ko(['미디어', '업로드'])) out.push('MEDIA');
  push('AI', /\b(llm|gpt|claude|genai|generative)\b/i);
  if (ko(['ai 기능', 'AI 기능'])) out.push('AI');
  if (/\b(mobile|ios|android|responsive)\b/i.test(t) || ko(['모바일'])) out.push('MOBILE');
  if (/\b(i18n|l10n|locale)\b/i.test(t) || ko(['다국어', '번역'])) out.push('I18N');
  push('MVP', /\bmvp\b/i);
  if (/\b(usp|differentiation)\b/i.test(t) || ko(['차별'])) out.push('USP');
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
    const k = ruleMergeKey(r);
    m.set(k, {
      field: r.field,
      contains: String(r.contains).trim(),
      suggestBadges: [...r.suggestBadges.map(String)]
    });
  }
  for (const r of incoming) {
    if (!r?.contains || !Array.isArray(r.suggestBadges)) continue;
    const k = ruleMergeKey(r);
    const prev = m.get(k);
    const sug = r.suggestBadges.map(String).filter(Boolean);
    if (!prev) {
      m.set(k, { field: r.field, contains: String(r.contains).trim(), suggestBadges: [...new Set(sug)] });
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
    const needle = String(r.contains).toLowerCase();
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
 */
export function inferBadgeHintStringsFromMetadata(n: {
  name?: string;
  description?: string;
  metadata?: NodeMetadata | null;
}): string[] {
  const meta = n.metadata && typeof n.metadata === 'object' && !Array.isArray(n.metadata) ? n.metadata : null;
  const name = String(n.name ?? '');
  const desc = String(n.description ?? '');
  const hayStructured = meta ? haystackFromStructuredMeta(meta as NodeMetadata) : '';

  const fromExtras = meta ? hintsFromTreeImportExtras(meta as NodeMetadata) : [];
  const fromKw = keywordHints(hayStructured, name, desc);
  const fromUser = applyBadgeInferenceRules(getUserBadgeInferenceRules(), hayStructured, name, desc);
  const fromAiLearned = applyBadgeInferenceRules(getAiLearnedBadgeInferenceRules(), hayStructured, name, desc);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of [...fromExtras, ...fromKw, ...fromUser, ...fromAiLearned]) {
    const s = String(x).trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}
