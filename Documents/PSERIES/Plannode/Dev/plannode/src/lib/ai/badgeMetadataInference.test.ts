import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import {
  inferBadgeHintStringsFromMetadata,
  setUserBadgeInferenceRules,
  getUserBadgeInferenceRules,
  clearBadgeInferenceUserRules,
  mergeLearnedBadgeRulesFromImportedNodes,
  clearAiLearnedBadgeInferenceRules,
  getAiLearnedBadgeInferenceRules,
  AI_LEARNED_RULES_MAX,
  type UserBadgeInferenceRule
} from './badgeMetadataInference';
import { applySanitizeImportedPlannodeNodeV1, getBadgeSetFromNodeInput } from './badgePromptInjector';
import type { Node } from '$lib/supabase/client';
import { clearBadgePoolRuntimeCache } from './badgePoolConfig';

const lsMockStore: Record<string, string> = {};

describe('badgeMetadataInference', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'localStorage',
      {
        getItem: (k: string) => (Object.prototype.hasOwnProperty.call(lsMockStore, k) ? lsMockStore[k] : null),
        setItem: (k: string, v: string) => {
          lsMockStore[k] = v;
        },
        removeItem: (k: string) => {
          delete lsMockStore[k];
        },
        clear: () => {
          for (const k of Object.keys(lsMockStore)) delete lsMockStore[k];
        },
        key: () => null,
        get length() {
          return Object.keys(lsMockStore).length;
        }
      } as Storage
    );
    clearBadgePoolRuntimeCache();
  });

  afterEach(() => {
    clearBadgeInferenceUserRules();
    clearAiLearnedBadgeInferenceRules();
    for (const k of Object.keys(lsMockStore)) delete lsMockStore[k];
    vi.unstubAllGlobals();
    clearBadgePoolRuntimeCache();
  });

  it('infers PAYMENT from functionalSpec text', () => {
    const hints = inferBadgeHintStringsFromMetadata({
      name: '주문',
      description: '',
      metadata: {
        functionalSpec: {
          io: 'Toss Payments v2 웹훅',
          userTypes: 'guest'
        }
      }
    });
    expect(hints).toContain('PAYMENT');
  });

  it('reads treeImportExtras boolean flags', () => {
    const hints = inferBadgeHintStringsFromMetadata({
      name: 'X',
      metadata: {
        treeImportExtras: { isTDD: true, realtime: true, ai: true }
      }
    });
    expect(hints).toEqual(expect.arrayContaining(['TDD', 'REALTIME', 'AI']));
  });

  it('merges into getBadgeSetFromNodeInput when explicit badges sparse', () => {
    const set = getBadgeSetFromNodeInput({
      badges: [],
      name: '결제 콜백',
      description: 'Stripe webhook 처리',
      metadata: {}
    });
    expect(set.dev).toContain('PAYMENT');
  });

  it('user rules in localStorage extend hints', () => {
    setUserBadgeInferenceRules([
      { field: 'name', contains: 'ACME', suggestBadges: ['USP', 'MVP'] }
    ]);
    expect(getUserBadgeInferenceRules()).toHaveLength(1);
    const hints = inferBadgeHintStringsFromMetadata({
      name: 'ACME 전략',
      description: '',
      metadata: {}
    });
    expect(hints).toEqual(expect.arrayContaining(['USP', 'MVP']));
  });

  it('sanitize persists inferred badges on import-shaped node', () => {
    const n: Node = {
      id: 'n1',
      project_id: 'p1',
      name: '실시간 대시보드',
      description: 'Supabase realtime 구독',
      depth: 0,
      created_at: 't',
      updated_at: 't',
      badges: [],
      metadata: { functionalSpec: { io: 'websocket channel' } }
    };
    const out = applySanitizeImportedPlannodeNodeV1(n);
    expect(out.badges.length).toBeGreaterThan(0);
    expect(out.metadata?.badges?.dev).toContain('REALTIME');
  });

  it('hint merge order: treeImportExtras before keywordHints when tokens differ', () => {
    const hints = inferBadgeHintStringsFromMetadata({
      name: '폼',
      description: '입력 폼 validation 유효성',
      metadata: {
        treeImportExtras: { isTDD: true },
        functionalSpec: {}
      }
    });
    expect(hints.indexOf('TDD')).toBeLessThan(hints.indexOf('FORM'));
  });

  it('hint merge order: extras and keywords dedupe same token once', () => {
    const hints = inferBadgeHintStringsFromMetadata({
      name: 'Stripe',
      description: '',
      metadata: {
        treeImportExtras: { hasPayment: true },
        functionalSpec: { io: 'Stripe API' }
      }
    });
    expect(hints.filter((x) => x === 'PAYMENT')).toHaveLength(1);
  });

  it('merges AI-learned rules from imported nodes (cumulative) and matches by node name', () => {
    mergeLearnedBadgeRulesFromImportedNodes([
      {
        name: 'PART 1 | 경쟁사 초정밀 분석',
        metadata: {
          badges: { dev: ['ANALYSIS'], ux: [], prj: ['COMPETITIVE'] }
        }
      }
    ]);
    expect(getAiLearnedBadgeInferenceRules().length).toBeGreaterThan(0);
    const hints = inferBadgeHintStringsFromMetadata({
      name: 'PART 1 | 경쟁사 초정밀 분석',
      description: '',
      metadata: {}
    });
    expect(hints).toEqual(expect.arrayContaining(['API', 'USP']));
  });

  it('AI-learned rules accumulate suggestBadges for same name key', () => {
    mergeLearnedBadgeRulesFromImportedNodes([
      { name: 'Feature X', metadata: { badges: { dev: ['API'], ux: [], prj: [] } } }
    ]);
    mergeLearnedBadgeRulesFromImportedNodes([
      { name: 'Feature X', metadata: { badges: { dev: [], ux: [], prj: ['USP'] } } }
    ]);
    const rule = getAiLearnedBadgeInferenceRules().find((r) => r.contains === 'Feature X');
    expect(rule?.suggestBadges.sort()).toEqual(['API', 'USP']);
  });

  it('AI-learned description needle matches when title differs', () => {
    mergeLearnedBadgeRulesFromImportedNodes([
      {
        name: 'PART 9 | 결제 연동 스펙',
        description:
          'Stripe Checkout Sessions 및 webhook signature 검증으로 결제 상태 동기화합니다. 최소 12자 이상 본문.',
        metadata: {
          badges: { dev: ['PAYMENT'], ux: [], prj: [] }
        }
      }
    ]);
    const hints = inferBadgeHintStringsFromMetadata({
      name: 'Renamed node title only',
      description:
        'Stripe Checkout Sessions 및 webhook signature 검증으로 결제 상태 동기화합니다. 최소 12자 이상 본문.',
      metadata: {}
    });
    expect(hints).toContain('PAYMENT');
  });

  it('AI-learned metadataHaystack needle matches iaGrid path when title generic', () => {
    mergeLearnedBadgeRulesFromImportedNodes([
      {
        name: 'Generic screen title here',
        description: '',
        metadata: {
          badges: { dev: ['LIST'], ux: [], prj: [] },
          iaGrid: {
            path: '/api/v2/products/catalog/browse-with-pagination',
            screenType: 'list'
          }
        }
      }
    ]);
    const hints = inferBadgeHintStringsFromMetadata({
      name: 'Different title',
      description: '',
      metadata: {
        iaGrid: {
          path: '/api/v2/products/catalog/browse-with-pagination',
          screenType: 'list'
        }
      }
    });
    expect(hints).toContain('LIST');
  });

  it('caps AI learned rules at AI_LEARNED_RULES_MAX dropping oldest', () => {
    const filler: UserBadgeInferenceRule[] = [];
    for (let i = 0; i < AI_LEARNED_RULES_MAX; i++) {
      filler.push({ field: 'name', contains: `cap-fill-${i}`, suggestBadges: ['API'] });
    }
    lsMockStore['plannode.badgeInferenceAiLearnedRules.v1'] = JSON.stringify({
      v: 1,
      updatedAt: new Date().toISOString(),
      rules: filler
    });
    mergeLearnedBadgeRulesFromImportedNodes([
      {
        name: 'ZZZ newest unique node',
        metadata: { badges: { dev: ['FORM'], ux: [], prj: [] } }
      }
    ]);
    const rules = getAiLearnedBadgeInferenceRules();
    expect(rules.length).toBe(AI_LEARNED_RULES_MAX);
    expect(rules.some((r) => r.contains === 'ZZZ newest unique node')).toBe(true);
    expect(rules.some((r) => r.contains === 'cap-fill-0')).toBe(false);
  });
});
