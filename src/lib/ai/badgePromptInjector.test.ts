import { describe, it, expect } from 'vitest';
import {
  buildBadgeContext,
  shouldForceSonnet,
  migrateLegacyBadgesToSet,
  flattenBadgeSet,
  BADGE_PROMPT_FRAGMENTS,
  BADGE_LABELS,
  BADGE_COLORS,
  applySanitizeImportedPlannodeNodeV1,
  getBadgeSetFromNodeInput,
  sanitizeNodeBadgesForTreeV1,
} from './badgePromptInjector';
import { DEFAULT_DEV_KEYS, DEFAULT_PRJ_KEYS, DEFAULT_UX_KEYS } from './badgePoolConfig';
import type { BadgeSet } from './types';
import type { Node } from '$lib/supabase/client';

describe('badgePromptInjector', () => {
  describe('buildBadgeContext', () => {
    it('should return empty string for empty badges', () => {
      const badges: BadgeSet = { dev: [], ux: [], prj: [] };
      const result = buildBadgeContext(badges);
      expect(result).toBe('');
    });

    it('should build context for single DEV badge', () => {
      const badges: BadgeSet = { dev: ['TDD'], ux: [], prj: [] };
      const result = buildBadgeContext(badges);
      expect(result).toContain('[BADGE CONTEXT');
      expect(result).toContain('TDD 필수 구간');
      expect(result).toContain('Given/When/Then');
    });

    it('should build context for single UX badge', () => {
      const badges: BadgeSet = { dev: [], ux: ['LIST'], prj: [] };
      const result = buildBadgeContext(badges);
      expect(result).toContain('[BADGE CONTEXT');
      expect(result).toContain('목록형 UI');
      expect(result).toContain('페이지네이션');
    });

    it('should build context for single PRJ badge', () => {
      const badges: BadgeSet = { dev: [], ux: [], prj: ['MVP'] };
      const result = buildBadgeContext(badges);
      expect(result).toContain('[BADGE CONTEXT');
      expect(result).toContain('MVP');
    });

    it('should combine multiple badges in order (DEV, UX, PRJ)', () => {
      const badges: BadgeSet = {
        dev: ['API', 'AUTH'],
        ux: ['FORM', 'MODAL'],
        prj: ['MVP'],
      };
      const result = buildBadgeContext(badges);
      expect(result).toContain('외부 API');
      expect(result).toContain('인증이 필요');
      expect(result).toContain('입력 폼');
      expect(result).toContain('모달');
      expect(result).toContain('MVP');
    });

    it('should include all DEV track badges when specified', () => {
      const badges: BadgeSet = {
        dev: [...DEFAULT_DEV_KEYS],
        ux: [],
        prj: [],
      };
      const result = buildBadgeContext(badges);
      expect(result).toContain('TDD');
      expect(result).toContain('API');
      expect(result).toContain('인증이 필요');
      expect(result).toContain('실시간');
      expect(result).toContain('결제 로직');
    });

    it('should include expanded UX track badges when specified', () => {
      const badges: BadgeSet = {
        dev: [],
        ux: ['GNB', 'CTA', 'TOAST', 'GRID', 'HEAD', 'LIST', 'CARD', 'FORM', 'MODAL', 'DASH', 'MEDIA'],
        prj: [],
      };
      const result = buildBadgeContext(badges);
      expect(result).toContain('GNB');
      expect(result).toContain('CTA');
      expect(result).toContain('토스트');
      expect(result).toContain('그리드 시스템');
      expect(result).toContain('헤더');
      expect(result).toContain('목록형');
    });
  });

  describe('shouldForceSonnet', () => {
    it('should return false for empty badges', () => {
      const badges: BadgeSet = { dev: [], ux: [], prj: [] };
      expect(shouldForceSonnet(badges)).toBe(false);
    });

    it('should return false for low-risk badges', () => {
      const badges: BadgeSet = { dev: ['CRUD'], ux: ['LIST'], prj: ['MVP'] };
      expect(shouldForceSonnet(badges)).toBe(false);
    });

    it('should return true for PAYMENT', () => {
      const badges: BadgeSet = { dev: ['PAYMENT'], ux: [], prj: [] };
      expect(shouldForceSonnet(badges)).toBe(true);
    });

    it('should return true for TDD', () => {
      const badges: BadgeSet = { dev: ['TDD'], ux: [], prj: [] };
      expect(shouldForceSonnet(badges)).toBe(true);
    });

    it('should return true for REALTIME', () => {
      const badges: BadgeSet = { dev: ['REALTIME'], ux: [], prj: [] };
      expect(shouldForceSonnet(badges)).toBe(true);
    });

    it('should return true for AUTH', () => {
      const badges: BadgeSet = { dev: ['AUTH'], ux: [], prj: [] };
      expect(shouldForceSonnet(badges)).toBe(true);
    });

    it('should return true if any high-risk badge present', () => {
      const badges: BadgeSet = { dev: ['API', 'REALTIME'], ux: ['LIST'], prj: [] };
      expect(shouldForceSonnet(badges)).toBe(true);
    });
  });

  describe('migrateLegacyBadgesToSet', () => {
    it('should handle empty array', () => {
      const result = migrateLegacyBadgesToSet([]);
      expect(result).toEqual({ dev: [], ux: [], prj: [] });
    });

    it('should handle null/undefined', () => {
      expect(migrateLegacyBadgesToSet(null as any)).toEqual({ dev: [], ux: [], prj: [] });
      expect(migrateLegacyBadgesToSet(undefined as any)).toEqual({ dev: [], ux: [], prj: [] });
    });

    it('should migrate DEV badges', () => {
      const result = migrateLegacyBadgesToSet(['tdd', 'crud', 'api', 'auth']);
      expect(result.dev).toContain('TDD');
      expect(result.dev).not.toContain('CRUD');
      expect(result.dev).toContain('API');
      expect(result.dev).toContain('AUTH');
    });

    it('should migrate UX badges', () => {
      const result = migrateLegacyBadgesToSet(['list', 'card', 'form']);
      expect(result.ux).toContain('LIST');
      expect(result.ux).toContain('CARD');
      expect(result.ux).toContain('FORM');
    });

    it('should migrate PRJ badges', () => {
      const result = migrateLegacyBadgesToSet(['usp', 'mvp', 'ai']);
      expect(result.prj).toContain('USP');
      expect(result.prj).toContain('MVP');
      expect(result.prj).toContain('AI');
    });

    it('should handle mixed legacy badges', () => {
      const result = migrateLegacyBadgesToSet(['tdd', 'list', 'mvp', 'api', 'card', 'usp']);
      expect(result.dev).toContain('TDD');
      expect(result.dev).toContain('API');
      expect(result.ux).toContain('LIST');
      expect(result.ux).toContain('CARD');
      expect(result.prj).toContain('MVP');
      expect(result.prj).toContain('USP');
    });

    it('should ignore unknown badges', () => {
      const result = migrateLegacyBadgesToSet(['tdd', 'unknown_badge', 'crud']);
      expect(result.dev).toContain('TDD');
      expect(result.dev).not.toContain('CRUD');
      expect(result.dev.length).toBe(1);
    });

    it('should handle case-insensitive input', () => {
      const result = migrateLegacyBadgesToSet(['TDD', 'Crud', 'LiSt']);
      expect(result.dev).toContain('TDD');
      expect(result.dev).not.toContain('CRUD');
      expect(result.ux).toContain('LIST');
    });

    it('maps common external AI synonyms to canonical pool', () => {
      const result = migrateLegacyBadgesToSet([
        'navigation',
        'REST_API',
        'websocket',
        'genai',
        'billing',
        'unknown_vendor',
      ]);
      expect(result.ux).toContain('GNB');
      expect(result.dev).toContain('API');
      expect(result.dev).toContain('REALTIME');
      expect(result.prj).toContain('AI');
      expect(result.dev).toContain('PAYMENT');
      expect(result.dev.length + result.ux.length + result.prj.length).toBe(5);
    });
  });

  describe('flattenBadgeSet', () => {
    it('should flatten empty BadgeSet', () => {
      const badges: BadgeSet = { dev: [], ux: [], prj: [] };
      const result = flattenBadgeSet(badges);
      expect(result).toEqual([]);
    });

    it('should flatten single-track BadgeSet', () => {
      const badges: BadgeSet = { dev: ['TDD', 'API'], ux: [], prj: [] };
      const result = flattenBadgeSet(badges);
      expect(result).toEqual(['tdd', 'api']);
    });

    it('should flatten multi-track BadgeSet', () => {
      const badges: BadgeSet = {
        dev: ['TDD', 'API'],
        ux: ['LIST', 'FORM'],
        prj: ['MVP', 'AI'],
      };
      const result = flattenBadgeSet(badges);
      expect(result).toEqual(['tdd', 'api', 'list', 'form', 'mvp', 'ai']);
    });

    it('should preserve order (dev -> ux -> prj)', () => {
      const badges: BadgeSet = {
        dev: ['PAYMENT'],
        ux: ['MODAL'],
        prj: ['USP'],
      };
      const result = flattenBadgeSet(badges);
      expect(result[0]).toBe('payment');
      expect(result[1]).toBe('modal');
      expect(result[2]).toBe('usp');
    });
  });

  describe('round-trip conversion', () => {
    it('should migrate legacy and flatten back to compatible format', () => {
      const legacy = ['tdd', 'list', 'mvp'];
      const migrated = migrateLegacyBadgesToSet(legacy);
      const flattened = flattenBadgeSet(migrated);

      // Original and flattened should have same contents (order may differ per track)
      expect(flattened).toContain('tdd');
      expect(flattened).toContain('list');
      expect(flattened).toContain('mvp');
    });
  });

  describe('badge prompt fragments', () => {
    it('should define fragments·labels·colors for every default pool token', () => {
      for (const badge of DEFAULT_DEV_KEYS) {
        expect(BADGE_PROMPT_FRAGMENTS[badge]?.length).toBeGreaterThan(0);
        expect(BADGE_LABELS[badge]).toBeTruthy();
        expect(BADGE_COLORS[badge]).toBeDefined();
      }
      for (const badge of DEFAULT_UX_KEYS) {
        expect(BADGE_PROMPT_FRAGMENTS[badge]?.length).toBeGreaterThan(0);
        expect(BADGE_LABELS[badge]).toBeTruthy();
        expect(BADGE_COLORS[badge]).toBeDefined();
      }
      for (const badge of DEFAULT_PRJ_KEYS) {
        expect(BADGE_PROMPT_FRAGMENTS[badge]?.length).toBeGreaterThan(0);
        expect(BADGE_LABELS[badge]).toBeTruthy();
        expect(BADGE_COLORS[badge]).toBeDefined();
      }
      expect(BADGE_PROMPT_FRAGMENTS.NAVI).toBeUndefined();
      expect(BADGE_PROMPT_FRAGMENTS.BUTT).toBeUndefined();
      expect(BADGE_PROMPT_FRAGMENTS.FEED).toBeUndefined();
      expect(BADGE_PROMPT_FRAGMENTS.CRUD).toBeUndefined();
      expect(BADGE_PROMPT_FRAGMENTS.RENDER).toBeUndefined();
    });
  });

  describe('applySanitizeImportedPlannodeNodeV1', () => {
    it('strips non-pool flat badges and keeps node identity', () => {
      const n: Node = {
        id: 'n1',
        project_id: 'p1',
        name: 'N',
        depth: 0,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        badges: ['tdd', 'pg_cron', 'zzz'],
        parent_id: 'root'
      };
      const out = applySanitizeImportedPlannodeNodeV1(n);
      expect(out.id).toBe('n1');
      expect(out.parent_id).toBe('root');
      expect(out.badges).toEqual(['tdd']);
    });

    it('keeps non-badge metadata keys while fixing tracks', () => {
      const n: Node = {
        id: 'n2a',
        project_id: 'p1',
        name: 'N',
        depth: 0,
        created_at: 't',
        updated_at: 't',
        badges: [],
        metadata: {
          functionalSpec: { userTypes: 'guest' },
          badges: { dev: ['TDD', 'NOPE'], ux: ['LIST'], prj: [] }
        }
      };
      const out = applySanitizeImportedPlannodeNodeV1(n);
      expect(out.metadata?.functionalSpec).toEqual({ userTypes: 'guest' });
      expect(out.metadata?.badges).toEqual({ dev: ['TDD'], ux: ['LIST'], prj: [] });
      expect(out.badges.sort()).toEqual(['list', 'tdd']);
    });

    it('re-buckets metadata badges placed in wrong track', () => {
      const n: Node = {
        id: 'n2',
        project_id: 'p1',
        name: 'N',
        depth: 0,
        created_at: 't',
        updated_at: 't',
        badges: [],
        metadata: {
          badges: { dev: ['NAVI', 'FORM', 'CRUD'], ux: [], prj: ['MVP'] }
        }
      };
      const out = applySanitizeImportedPlannodeNodeV1(n);
      expect(out.metadata?.badges?.dev).toEqual([]);
      expect(out.metadata?.badges?.ux?.sort()).toEqual(['FORM', 'GNB']);
      expect(out.metadata?.badges?.prj).toEqual(['MVP']);
      expect(out.badges.sort()).toEqual(['form', 'gnb', 'mvp']);
    });

    it('merges metadata.badges with flat badges and maps synonyms', () => {
      const n: Node = {
        id: 'n3',
        project_id: 'p1',
        name: 'N',
        depth: 0,
        created_at: 't',
        updated_at: 't',
        badges: ['oauth2', 'modal'],
        metadata: {
          badges: { dev: ['TDD'], ux: ['LIST'], prj: [] }
        }
      };
      const out = applySanitizeImportedPlannodeNodeV1(n);
      expect(out.metadata?.badges?.dev?.sort()).toEqual(['AUTH', 'TDD']);
      expect(out.metadata?.badges?.ux?.sort()).toEqual(['LIST', 'MODAL']);
      expect(out.badges.sort()).toEqual(['auth', 'list', 'modal', 'tdd']);
    });
  });

  describe('getBadgeSetFromNodeInput inferHints option', () => {
    it('should merge inference by default (no opts)', () => {
      const set = getBadgeSetFromNodeInput({
        badges: [],
        name: '결제',
        description: 'Stripe webhook',
        metadata: {}
      });
      // 기본값: 추론 on → PAYMENT 포함
      expect(set.dev).toContain('PAYMENT');
    });

    it('should skip inference when opts.inferHints is explicitly false', () => {
      const set = getBadgeSetFromNodeInput(
        {
          badges: [],
          name: '결제',
          description: 'Stripe webhook',
          metadata: {}
        },
        { inferHints: false }
      );
      // 명시 false: 추론 off → 명시 배지만
      expect(set.dev).not.toContain('PAYMENT');
    });

    it('should return only explicit badges when no inference hints (inferHints: false)', () => {
      const set = getBadgeSetFromNodeInput(
        {
          badges: ['tdd'],
          name: '결제 처리',
          description: 'Stripe API',
          metadata: { functionalSpec: { io: 'payment webhook' } }
        },
        { inferHints: false }
      );
      // 명시: TDD, 추론 off → PAYMENT 제외
      expect(set.dev).toContain('TDD');
      expect(set.dev).not.toContain('PAYMENT');
    });

    it('sanitize implicitly disables inference (backward compat)', () => {
      const result = sanitizeNodeBadgesForTreeV1({
        badges: [],
        name: '실시간 업데이트',
        description: 'websocket channel',
        metadata: { functionalSpec: { io: 'realtime' } }
      });
      // sanitize는 inferHints: false 명시 → 명시 배지만
      expect(result.badges).not.toContain('realtime');
      expect(result.badges.length).toBe(0);
    });
  });
});
