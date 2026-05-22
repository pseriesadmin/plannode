import { describe, expect, it } from 'vitest';
import { normalizeBadgeForAliasLookup, resolveImportedBadgeToken } from './badgeImportAliases';
import {
  DEFAULT_DEV_KEYS,
  DEFAULT_PRJ_KEYS,
  DEFAULT_UX_KEYS,
  defaultBadgePool,
} from './badgePoolConfig';

describe('badgeImportAliases', () => {
  const pool = defaultBadgePool();

  it('default pool scale matches BADGE-ALIGN slim DEV pool', () => {
    expect(DEFAULT_DEV_KEYS).toHaveLength(16);
    expect(DEFAULT_DEV_KEYS).not.toContain('CRUD');
    expect(DEFAULT_UX_KEYS).toHaveLength(26);
    expect(DEFAULT_PRJ_KEYS).toHaveLength(9);
    expect(pool.dev).not.toContain('NAVI');
    expect(pool.ux).not.toContain('BUTT');
    expect(pool.ux).not.toContain('FEED');
    expect(pool.ux).toContain('GNB');
    expect(pool.ux).toContain('CTA');
    expect(pool.ux).toContain('TOAST');
  });

  it('normalizes keys for alias lookup', () => {
    expect(normalizeBadgeForAliasLookup('  REST API  ')).toBe('rest_api');
    expect(normalizeBadgeForAliasLookup('GenAI')).toBe('genai');
    expect(normalizeBadgeForAliasLookup('z-index')).toBe('z_index');
  });

  it('resolveImportedBadgeToken: pool exact match still works', () => {
    const hit = resolveImportedBadgeToken('tdd', pool);
    expect(hit).toEqual({ track: 'dev', upper: 'TDD' });
    expect(resolveImportedBadgeToken('GNB', pool)).toEqual({ track: 'ux', upper: 'GNB' });
  });

  it('resolveImportedBadgeToken: synonyms map to canonical track', () => {
    expect(resolveImportedBadgeToken('navigation', pool)).toEqual({ track: 'ux', upper: 'GNB' });
    expect(resolveImportedBadgeToken('REST_API', pool)).toEqual({ track: 'dev', upper: 'API' });
    expect(resolveImportedBadgeToken('websocket', pool)).toEqual({ track: 'dev', upper: 'REALTIME' });
    expect(resolveImportedBadgeToken('Web-Socket', pool)).toEqual({ track: 'dev', upper: 'REALTIME' });
    expect(resolveImportedBadgeToken('jwt_token', pool)).toEqual({ track: 'dev', upper: 'AUTH' });
    expect(resolveImportedBadgeToken('genai', pool)).toEqual({ track: 'prj', upper: 'AI' });
    expect(resolveImportedBadgeToken('billing', pool)).toEqual({ track: 'dev', upper: 'PAYMENT' });
    expect(resolveImportedBadgeToken('ANALYSIS', pool)).toEqual({ track: 'dev', upper: 'API' });
    expect(resolveImportedBadgeToken('COMPETITIVE', pool)).toEqual({ track: 'prj', upper: 'USP' });
  });

  it('legacy NAVI/BUTT/FEED pool tokens resolve via alias to GNB/CTA/TOAST', () => {
    expect(resolveImportedBadgeToken('NAVI', pool)).toEqual({ track: 'ux', upper: 'GNB' });
    expect(resolveImportedBadgeToken('BUTT', pool)).toEqual({ track: 'ux', upper: 'CTA' });
    expect(resolveImportedBadgeToken('FEED', pool)).toEqual({ track: 'ux', upper: 'TOAST' });
    expect(resolveImportedBadgeToken('navi', pool)).toEqual({ track: 'ux', upper: 'GNB' });
    expect(resolveImportedBadgeToken('button', pool)).toEqual({ track: 'ux', upper: 'CTA' });
    expect(resolveImportedBadgeToken('toast', pool)).toEqual({ track: 'ux', upper: 'TOAST' });
  });

  it('resolveImportedBadgeToken: new DEV collaboration aliases', () => {
    expect(resolveImportedBadgeToken('z-index', pool)).toEqual({ track: 'dev', upper: 'ZINDEX' });
    expect(resolveImportedBadgeToken('flexbox', pool)).toEqual({ track: 'dev', upper: 'FLEX' });
    expect(resolveImportedBadgeToken('hardcoding', pool)).toEqual({ track: 'dev', upper: 'HARDCOD' });
    expect(resolveImportedBadgeToken('media_query', pool)).toEqual({ track: 'dev', upper: 'MQUERY' });
  });

  it('deprecated crud and removed DEV env aliases do not resolve in default pool', () => {
    expect(resolveImportedBadgeToken('crud', pool)).toBeNull();
    expect(resolveImportedBadgeToken('pull_request', pool)).toBeNull();
    expect(resolveImportedBadgeToken('json', pool)).toBeNull();
    expect(resolveImportedBadgeToken('staging', pool)).toBeNull();
    expect(resolveImportedBadgeToken('deploy', pool)).toBeNull();
  });

  it('resolveImportedBadgeToken: new UX and PRJ aliases', () => {
    expect(resolveImportedBadgeToken('breadcrumb', pool)).toEqual({ track: 'ux', upper: 'BREAD' });
    expect(resolveImportedBadgeToken('12_column', pool)).toEqual({ track: 'ux', upper: 'GRID' });
    expect(resolveImportedBadgeToken('wireframe', pool)).toEqual({ track: 'prj', upper: 'WIREF' });
    expect(resolveImportedBadgeToken('affordance', pool)).toEqual({ track: 'prj', upper: 'AFFORD' });
  });

  it('returns null for unknown tokens', () => {
    expect(resolveImportedBadgeToken('pg_cron', pool)).toBeNull();
  });
});
