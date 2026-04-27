/**
 * 표준 배지 풀 — 기본값(DEV/UX/PRJ) + 브라우저 localStorage 오버라이드.
 * `badgePromptInjector`·파일럿 칩·가져오기 정리(sanitize)가 동일 풀을 참조한다.
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

let memoPool: BadgePoolTracks | null = null;

export function clearBadgePoolRuntimeCache(): void {
  memoPool = null;
}

export function loadBadgePoolConfig(): BadgePoolTracks {
  if (typeof localStorage === 'undefined') return defaultBadgePool();
  try {
    const raw = localStorage.getItem(BADGE_POOL_STORAGE_KEY);
    if (!raw) return defaultBadgePool();
    return normalizeBadgePool(JSON.parse(raw));
  } catch {
    return defaultBadgePool();
  }
}

export function getEffectiveBadgePool(): BadgePoolTracks {
  if (memoPool) return memoPool;
  memoPool = loadBadgePoolConfig();
  return memoPool;
}

export function saveBadgePoolConfig(pool: BadgePoolTracks): BadgePoolTracks {
  const normalized = normalizeBadgePool(pool);
  clearBadgePoolRuntimeCache();
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(BADGE_POOL_STORAGE_KEY, JSON.stringify(normalized));
  }
  memoPool = normalized;
  badgePoolRevision.update((n) => n + 1);
  return normalized;
}

export function resetBadgePoolConfigToDefaults(): BadgePoolTracks {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(BADGE_POOL_STORAGE_KEY);
  }
  clearBadgePoolRuntimeCache();
  const d = defaultBadgePool();
  memoPool = d;
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
