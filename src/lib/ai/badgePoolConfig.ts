/**
 * 표준 배지 풀 — 기본값(DEV/UX/PRJ) + 브라우저 localStorage 오버라이드.
 * 프로젝트 `badge_pool`이 있으면 해당 프로젝트 우선(`registerProjectBadgePoolLookup`).
 * `badgePromptInjector`·파일럿 칩·가져오기 정리(sanitize)가 `getEffectiveBadgePool()`을 참조한다.
 */

import { writable } from 'svelte/store';

export const BADGE_POOL_STORAGE_KEY = 'plannode.standardBadgePool.v1';

export const DEFAULT_DEV_KEYS = ['TDD', 'CRUD', 'API', 'AUTH', 'REALTIME', 'PAYMENT'] as const;
export const DEFAULT_UX_KEYS = [
  'NAVI',
  'HEAD',
  'LIST',
  'CARD',
  'FORM',
  'BUTT',
  'MODAL',
  'FEED',
  'DASH',
  'MEDIA',
] as const;
export const DEFAULT_PRJ_KEYS = ['USP', 'MVP', 'AI', 'I18N', 'MOBILE'] as const;

/** 트랙별 허용 배지 토큰(대문자) */
export type BadgePoolTracks = {
  dev: string[];
  ux: string[];
  prj: string[];
};

const TOKEN_RE = /^[A-Z][A-Z0-9]{1,14}$/;

const GLOBAL_MEMO_KEY = '__device__';

type ProjectBadgePoolLookup = (projectId: string) => BadgePoolTracks | null | undefined;
type CurrentProjectIdLookup = () => string | null;

let projectBadgePoolLookup: ProjectBadgePoolLookup | null = null;
let currentProjectIdLookup: CurrentProjectIdLookup | null = null;
const memoByKey = new Map<string, BadgePoolTracks>();

/** `projects.ts` 부트 시 등록 — 순환 import 방지용 콜백 */
export function registerProjectBadgePoolLookup(fn: ProjectBadgePoolLookup): void {
  projectBadgePoolLookup = fn;
}

/** 현재 열린 프로젝트 id — 인자 없는 `getEffectiveBadgePool()`용 */
export function registerCurrentProjectIdLookup(fn: CurrentProjectIdLookup): void {
  currentProjectIdLookup = fn;
}

export function defaultBadgePool(): BadgePoolTracks {
  return {
    dev: [...DEFAULT_DEV_KEYS],
    ux: [...DEFAULT_UX_KEYS],
    prj: [...DEFAULT_PRJ_KEYS],
  };
}

export function isValidBadgeToken(raw: string): boolean {
  const s = String(raw).trim().toUpperCase();
  return TOKEN_RE.test(s);
}

function uniqUpperTokens(arr: readonly string[], max = 40): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    const u = String(x).trim().toUpperCase();
    if (!TOKEN_RE.test(u) || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= max) break;
  }
  return out;
}

export function normalizeBadgePool(input: unknown): BadgePoolTracks {
  const d = defaultBadgePool();
  if (!input || typeof input !== 'object') return d;
  const o = input as Record<string, unknown>;
  return {
    dev: Array.isArray(o.dev) ? uniqUpperTokens(o.dev as string[]) : d.dev,
    ux: Array.isArray(o.ux) ? uniqUpperTokens(o.ux as string[]) : d.ux,
    prj: Array.isArray(o.prj) ? uniqUpperTokens(o.prj as string[]) : d.prj,
  };
}

export function clearBadgePoolRuntimeCache(projectId?: string): void {
  if (projectId) {
    memoByKey.delete(projectId);
    return;
  }
  memoByKey.clear();
}

function loadDeviceBadgePoolConfig(): BadgePoolTracks {
  if (typeof localStorage === 'undefined') return defaultBadgePool();
  try {
    const raw = localStorage.getItem(BADGE_POOL_STORAGE_KEY);
    if (!raw) return defaultBadgePool();
    return normalizeBadgePool(JSON.parse(raw));
  } catch {
    return defaultBadgePool();
  }
}

function resolvePoolCacheKey(projectId: string | null | undefined): string {
  return projectId ? projectId : GLOBAL_MEMO_KEY;
}

function loadPoolForCacheKey(cacheKey: string, projectId: string | null | undefined): BadgePoolTracks {
  if (projectId && projectBadgePoolLookup) {
    const fromProject = projectBadgePoolLookup(projectId);
    if (fromProject) return fromProject;
  }
  return loadDeviceBadgePoolConfig();
}

/**
 * 유효 배지 풀 — 프로젝트 `badge_pool` → 기기 전역 LS → 기본 21개.
 * @param projectId 생략 시 `registerCurrentProjectIdLookup`으로 연 프로젝트 사용.
 */
export function getEffectiveBadgePool(projectId?: string | null): BadgePoolTracks {
  const pid =
    projectId === undefined ? (currentProjectIdLookup?.() ?? null) : projectId;
  const cacheKey = resolvePoolCacheKey(pid);
  const hit = memoByKey.get(cacheKey);
  if (hit) return hit;
  const pool = loadPoolForCacheKey(cacheKey, pid);
  memoByKey.set(cacheKey, pool);
  return pool;
}

export function loadBadgePoolConfig(): BadgePoolTracks {
  return loadDeviceBadgePoolConfig();
}

export function saveBadgePoolConfig(pool: BadgePoolTracks): BadgePoolTracks {
  const normalized = normalizeBadgePool(pool);
  clearBadgePoolRuntimeCache();
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(BADGE_POOL_STORAGE_KEY, JSON.stringify(normalized));
  }
  memoByKey.set(GLOBAL_MEMO_KEY, normalized);
  badgePoolRevision.update((n) => n + 1);
  return normalized;
}

export function resetBadgePoolConfigToDefaults(): BadgePoolTracks {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(BADGE_POOL_STORAGE_KEY);
  }
  clearBadgePoolRuntimeCache();
  const d = defaultBadgePool();
  memoByKey.set(GLOBAL_MEMO_KEY, d);
  badgePoolRevision.update((n) => n + 1);
  return d;
}

/** UI·테스트에서 풀 변경 알림 */
export const badgePoolRevision = writable(0);

export function poolToSets(pool: BadgePoolTracks): {
  dev: Set<string>;
  ux: Set<string>;
  prj: Set<string>;
} {
  return {
    dev: new Set(pool.dev.map((x) => String(x).toUpperCase())),
    ux: new Set(pool.ux.map((x) => String(x).toUpperCase())),
    prj: new Set(pool.prj.map((x) => String(x).toUpperCase())),
  };
}

/** 레거시 평면 배열 토큰 → 트랙 (풀에 정의된 표기로 정규화) */
export function resolveLegacyTokenToTrack(
  pool: BadgePoolTracks,
  lower: string
): { track: keyof BadgePoolTracks; upper: string } | null {
  const L = lower.trim().toLowerCase();
  if (!L) return null;
  const tryTrack = (track: keyof BadgePoolTracks): string | null => {
    for (const u of pool[track]) {
      if (String(u).toLowerCase() === L) return String(u).toUpperCase();
    }
    return null;
  };
  const d = tryTrack('dev');
  if (d) return { track: 'dev', upper: d };
  const x = tryTrack('ux');
  if (x) return { track: 'ux', upper: x };
  const p = tryTrack('prj');
  if (p) return { track: 'prj', upper: p };
  return null;
}
