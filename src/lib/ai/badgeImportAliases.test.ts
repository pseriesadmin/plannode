import { describe, expect, it } from 'vitest';
import { normalizeBadgeForAliasLookup, resolveImportedBadgeToken } from './badgeImportAliases';
import { defaultBadgePool } from './badgePoolConfig';

describe('badgeImportAliases', () => {
  const pool = defaultBadgePool();

  it('normalizes keys for alias lookup', () => {
    expect(normalizeBadgeForAliasLookup('  REST API  ')).toBe('rest_api');
    expect(normalizeBadgeForAliasLookup('GenAI')).toBe('genai');
  });

  it('resolveImportedBadgeToken: pool exact match still works', () => {
    const hit = resolveImportedBadgeToken('tdd', pool);
    expect(hit).toEqual({ track: 'dev', upper: 'TDD' });
  });

  it('resolveImportedBadgeToken: synonyms map to canonical track', () => {
    expect(resolveImportedBadgeToken('navigation', pool)).toEqual({ track: 'ux', upper: 'NAVI' });
    expect(resolveImportedBadgeToken('REST_API', pool)).toEqual({ track: 'dev', upper: 'API' });
    expect(resolveImportedBadgeToken('websocket', pool)).toEqual({ track: 'dev', upper: 'REALTIME' });
    expect(resolveImportedBadgeToken('Web-Socket', pool)).toEqual({ track: 'dev', upper: 'REALTIME' });
    expect(resolveImportedBadgeToken('jwt_token', pool)).toEqual({ track: 'dev', upper: 'AUTH' });
    expect(resolveImportedBadgeToken('genai', pool)).toEqual({ track: 'prj', upper: 'AI' });
    expect(resolveImportedBadgeToken('billing', pool)).toEqual({ track: 'dev', upper: 'PAYMENT' });
    expect(resolveImportedBadgeToken('ANALYSIS', pool)).toEqual({ track: 'dev', upper: 'API' });
    expect(resolveImportedBadgeToken('COMPETITIVE', pool)).toEqual({ track: 'prj', upper: 'USP' });
  });

  it('returns null for unknown tokens', () => {
    expect(resolveImportedBadgeToken('pg_cron', pool)).toBeNull();
  });
});
