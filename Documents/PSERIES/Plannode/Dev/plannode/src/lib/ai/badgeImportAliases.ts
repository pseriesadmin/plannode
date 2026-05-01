/**
 * 외부 AI·타 도구 JSON의 배지 문자열 → 표준 21개 풀(DEV/UX/PRJ) 토큰.
 * `resolveLegacyTokenToTrack`으로 잡히지 않는 동의어만 여기서 보강한다.
 */

import type { BadgePoolTracks } from './badgePoolConfig';
import { poolToSets, resolveLegacyTokenToTrack } from './badgePoolConfig';

/** 공백·하이픈·슬래시 등을 `_`로 묶어 소문자 키로 통일 */
export function normalizeBadgeForAliasLookup(raw: string): string {
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/['`]/g, '')
    .replace(/[\s/]+/g, '_')
    .replace(/-+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

const ALIAS_GROUPS: readonly (readonly [readonly string[], string])[] = [
  [['tdd', 'unit_test', 'unittest', 'unit_tests', 'testing', 'test_driven'], 'TDD'],
  [['crud'], 'CRUD'],
  [
    [
      'api',
      'rest',
      'rest_api',
      'restapi',
      'restful',
      'graphql',
      'grpc',
      'openapi',
      'swagger',
      'endpoint',
      'endpoints',
      'http_api'
    ],
    'API'
  ],
  [
    ['auth', 'authentication', 'login', 'oauth', 'oauth2', 'jwt', 'jwt_token', 'session', 'sessions'],
    'AUTH'
  ],
  [
    [
      'realtime',
      'real_time',
      'websocket',
      'websockets',
      'web_socket',
      'ws',
      'sse',
      'live',
      'streaming',
      'supabase_realtime'
    ],
    'REALTIME'
  ],
  [['payment', 'payments', 'billing', 'checkout', 'stripe', 'toss', 'pg'], 'PAYMENT'],
  [['navi', 'navigation', 'nav', 'menu', 'gnb', 'lnb', 'sidebar', 'menubar'], 'NAVI'],
  [['head', 'header', 'topbar', 'top_bar'], 'HEAD'],
  [['list', 'listing', 'table', 'datagrid', 'data_grid', 'grid_view'], 'LIST'],
  [['card', 'cards', 'tile', 'tiles'], 'CARD'],
  [['form', 'forms', 'input', 'inputs'], 'FORM'],
  [['butt', 'button', 'buttons', 'cta', 'ctas'], 'BUTT'],
  [['modal', 'modals', 'dialog', 'dialogs', 'popup', 'popups', 'sheet', 'bottom_sheet'], 'MODAL'],
  [['feed', 'feedback', 'toast', 'toasts', 'alert', 'alerts', 'notification', 'notifications'], 'FEED'],
  [['dash', 'dashboard', 'dashboards', 'charts', 'kpi', 'kpis', 'analytics'], 'DASH'],
  [['media', 'image', 'images', 'upload', 'file_upload', 'attachments'], 'MEDIA'],
  [['usp', 'unique_selling', 'differentiation'], 'USP'],
  [['mvp'], 'MVP'],
  [
    ['competitive', 'competition', 'competitor', 'competitors', 'benchmark'],
    'USP'
  ],
  [['analysis', 'analytical', 'analyze', 'analyse'], 'API'],
  [['ai', 'llm', 'gpt', 'copilot', 'genai', 'gen_ai', 'generative_ai'], 'AI'],
  [['i18n', 'l10n', 'translation', 'translations', 'multilingual', 'locale', 'locales'], 'I18N'],
  [['mobile', 'responsive', 'ios', 'android', 'smartphone'], 'MOBILE']
] as const;

function buildImportAliasMap(): Readonly<Record<string, string>> {
  const m: Record<string, string> = {};
  for (const [keys, canon] of ALIAS_GROUPS) {
    for (const k of keys) {
      const nk = normalizeBadgeForAliasLookup(k);
      if (nk) m[nk] = canon;
    }
  }
  return m;
}

/** 동의어 키(정규화됨) → 표준 토큰 대문자 */
export const IMPORT_BADGE_ALIAS_TO_CANONICAL: Readonly<Record<string, string>> =
  buildImportAliasMap();

/**
 * 단일 문자열을 표준 풀의 한 토큰 + 트랙으로 해석한다.
 * 1) 풀에 정의된 표기(대소문자 무시) 2) 동의어 표
 */
export function resolveImportedBadgeToken(
  raw: string,
  pool: BadgePoolTracks
): { track: keyof BadgePoolTracks; upper: string } | null {
  const exact = resolveLegacyTokenToTrack(pool, raw);
  if (exact) return exact;

  const key = normalizeBadgeForAliasLookup(raw);
  if (!key) return null;
  const canonical = IMPORT_BADGE_ALIAS_TO_CANONICAL[key];
  if (!canonical) return null;

  const sets = poolToSets(pool);
  if (sets.dev.has(canonical)) return { track: 'dev', upper: canonical };
  if (sets.ux.has(canonical)) return { track: 'ux', upper: canonical };
  if (sets.prj.has(canonical)) return { track: 'prj', upper: canonical };
  return null;
}
