/**
 * 외부 AI·타 도구 JSON의 배지 문자열 → 표준 배지 풀(DEV/UX/PRJ) 토큰.
 * `resolveLegacyTokenToTrack`으로 잡히지 않는 동의어만 여기서 보강한다.
 * 레거시 NAVI/BUTT/FEED 풀 토큰은 제거되었으며 alias로 GNB/CTA/TOAST에 매핑한다.
 * `crud`→CRUD 등 풀 밖 canonical alias는 가져오기 해석용(deprecated) — 풀에 없으면 null.
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
  /** @deprecated 풀에 CRUD 없음 — resolve 후 canonical이 풀 밖이면 null */
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
      'http_api',
    ],
    'API',
  ],
  [
    ['auth', 'authentication', 'login', 'oauth', 'oauth2', 'jwt', 'jwt_token', 'session', 'sessions'],
    'AUTH',
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
      'supabase_realtime',
    ],
    'REALTIME',
  ],
  [['payment', 'payments', 'billing', 'checkout', 'stripe', 'toss', 'pg'], 'PAYMENT'],
  [['zindex', 'z_index', 'z-index', 'layer_order', 'stacking_context'], 'ZINDEX'],
  [['flexbox', 'flex_layout', 'flex_box'], 'FLEX'],
  [['css_grid', 'display_grid', 'cssgrid', 'grid_layout_impl'], 'CSSGRID'],
  [['media_query', 'media_queries', 'mediaquery', 'at_media'], 'MQUERY'],
  [['padding', 'inner_padding'], 'PADDING'],
  [['rem', 'em', 'relative_unit', 'px_vs_rem'], 'REM'],
  [['component', 'components', 'ui_component', 'reusable_block'], 'COMP'],
  [['ui_state', 'hover_state', 'disabled_state', 'active_state'], 'STATE'],
  [['hardcoding', 'hardcode', 'hard_coded', 'hard_coding'], 'HARDCOD'],
  [
    ['dynamic_interaction', 'dynamic_ui', 'scroll_animation', 'micro_interaction', 'dynix'],
    'DYNIX',
  ],
  [['dummy_data', 'dummy', 'mock_data', 'sample_data', 'fixture_data'], 'DUMMY'],
  [
    ['navi', 'navigation', 'nav', 'menu', 'global_nav', 'top_nav', 'menubar', 'global_navigation'],
    'GNB',
  ],
  [['gnb', 'global_navigation_bar'], 'GNB'],
  [['lnb', 'left_nav', 'left_navigation', 'side_navigation', 'sidebar', 'side_nav', 'sidenav'], 'LNB'],
  [['snb', 'sub_nav', 'subnavigation', 'sub_navigation'], 'SNB'],
  [['fnb', 'footer_nav', 'footer_menu', 'bottom_nav', 'footer_navigation'], 'FNB'],
  [['hero', 'hero_section', 'hero_banner'], 'HERO'],
  [['breadcrumb', 'breadcrumbs', 'bread_crumb'], 'BREAD'],
  [['carousel', 'caro', 'slider', 'image_slider'], 'CARO'],
  [['accordion', 'accord', 'collapse_panel'], 'ACCORD'],
  [['modal', 'modals', 'dialog', 'dialogs', 'sheet', 'bottom_sheet'], 'MODAL'],
  [['popup', 'popups', 'pop_up', 'lightbox'], 'POPUP'],
  [
    ['toast', 'toasts', 'snackbar', 'snack_bar', 'feed', 'feedback', 'alert', 'alerts', 'notification', 'notifications'],
    'TOAST',
  ],
  [['dropdown', 'drop_down', 'select_menu', 'dropmenu'], 'DROP'],
  [['butt', 'button', 'buttons', 'cta', 'ctas', 'call_to_action'], 'CTA'],
  [['tab', 'tabs', 'tab_bar', 'tabbar'], 'TAB'],
  [['grid_system', 'layout_grid', 'column_grid', '12_column'], 'GRID'],
  [['column', 'columns', 'col_span'], 'COL'],
  [['gutter', 'gutters', 'grid_gutter'], 'GUTTER'],
  [['margin', 'margins', 'outer_margin', 'page_margin'], 'MARGIN'],
  [['breakpoint', 'breakpoints', 'break_point', 'responsive_breakpoint'], 'BREAKPT'],
  [['whitespace', 'white_space', 'spacing_system'], 'WHSPACE'],
  [['head', 'header', 'topbar', 'top_bar'], 'HEAD'],
  [['list', 'listing', 'table', 'datagrid', 'data_grid', 'grid_view'], 'LIST'],
  [['card', 'cards', 'tile', 'tiles'], 'CARD'],
  [['form', 'forms', 'input', 'inputs'], 'FORM'],
  [['dash', 'dashboard', 'dashboards', 'charts', 'kpi', 'kpis', 'analytics'], 'DASH'],
  [['media', 'image', 'images', 'upload', 'file_upload', 'attachments'], 'MEDIA'],
  [['usp', 'unique_selling', 'differentiation'], 'USP'],
  [['mvp'], 'MVP'],
  [['competitive', 'competition', 'competitor', 'competitors', 'benchmark'], 'USP'],
  [['analysis', 'analytical', 'analyze', 'analyse'], 'API'],
  [['ai', 'llm', 'gpt', 'copilot', 'genai', 'gen_ai', 'generative_ai'], 'AI'],
  [['i18n', 'l10n', 'translation', 'translations', 'multilingual', 'locale', 'locales'], 'I18N'],
  [['mobile', 'responsive', 'ios', 'android', 'smartphone'], 'MOBILE'],
  [['wireframe', 'wire_frame', 'wireframes'], 'WIREF'],
  [['prototype', 'protototype', 'proto_type'], 'PROTO'],
  [['visual_hierarchy', 'visual_hierarchy_design', 'vhierarchy'], 'VHIER'],
  [['affordance', 'affordances'], 'AFFORD'],
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
