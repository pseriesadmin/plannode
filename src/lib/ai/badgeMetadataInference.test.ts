import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import {
  inferBadgeHintStringsFromMetadata,
  setUserBadgeInferenceRules,
  getUserBadgeInferenceRules,
  clearBadgeInferenceUserRules,
  mergeLearnedBadgeRulesFromImportedNodes,
  clearAiLearnedBadgeInferenceRules,
  getAiLearnedBadgeInferenceRules,
  clearBadgeInferenceRulesRuntimeCache,
  AI_LEARNED_RULES_MAX,
  type UserBadgeInferenceRule
} from './badgeMetadataInference';
import { applySanitizeImportedPlannodeNodeV1, getBadgeSetFromNodeInput } from './badgePromptInjector';
import type { Node } from '$lib/supabase/client';
import { clearBadgePoolRuntimeCache } from './badgePoolConfig';

const lsMockStore: Record<string, string> = {};
const AI_LEARNED_LS_KEY = 'plannode.badgeInferenceAiLearnedRules.v1';
const USER_RULES_LS_KEY = 'plannode.badgeInferenceUserRules.v1';

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
    clearBadgeInferenceRulesRuntimeCache();
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
    // 추론 파이프 검증: 기본값(opts 없음)으로 추론 병합
    const set = getBadgeSetFromNodeInput(
      {
        badges: [],
        name: '결제 콜백',
        description: 'Stripe webhook 처리',
        metadata: {}
      }
      // opts 미지정 → 기본값(추론 on)
    );
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

  it('sanitize returns empty badges when no explicit badges (no infer)', () => {
    // 정책: sanitize는 { inferHints: false }로 명시되므로 추론 off
    // 명시 배지가 없으면 → sanitize 후에도 비어 있음
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
    // sanitize는 inferHints: false이므로 명시 배지만 남음 → 비어 있음
    expect(out.badges.length).toBe(0);
    expect(out.metadata?.badges).toBeUndefined();
  });

  it('hint merge order: treeImportExtras before iaGrid before keywordHints', () => {
    const hints = inferBadgeHintStringsFromMetadata({
      name: '폼',
      description: '',
      metadata: {
        treeImportExtras: { isTDD: true },
        iaGrid: { screenType: 'list' },
        functionalSpec: { userTypes: 'input form validation' }
      }
    });
    expect(hints).toContain('TDD');
    expect(hints).toContain('LIST');
    expect(hints).toContain('FORM');
    expect(hints.indexOf('TDD')).toBeLessThan(hints.indexOf('LIST'));
    expect(hints.indexOf('LIST')).toBeLessThan(hints.indexOf('FORM'));
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

  // 진공 노드 회귀: 제목·설명 없으면 추론 전체 스킵
  it('returns empty hints for vacuum node (no name, desc, or structured meta)', () => {
    const hints = inferBadgeHintStringsFromMetadata({
      name: '',
      description: '',
      metadata: { badges: { dev: [], ux: [], prj: [] } }
    });
    expect(hints).toEqual([]);
  });

  // 빈 needle 규칙 방어
  it('does not match rules with empty/whitespace-only contains', () => {
    setUserBadgeInferenceRules([
      { field: 'name', contains: '   ', suggestBadges: ['API', 'TDD'] }
    ]);
    const hints = inferBadgeHintStringsFromMetadata({
      name: 'some node',
      description: 'description',
      metadata: {}
    });
    // 빈 needle은 무시되어야 함
    expect(hints).not.toContain('API');
    expect(hints).not.toContain('TDD');
  });

  // 자유텍스트 UX 복원 케이스: keywordHints(hay+name+desc)에서 보수적 매칭
  it('infers UX badge LIST from name with structured keyword', () => {
    const hints = inferBadgeHintStringsFromMetadata({
      name: '목록',
      description: '',
      metadata: {}
    });
    // keywordHints에서 '목록' 키워드를 포함하므로 LIST 추론 기대
    expect(hints).toContain('LIST');
  });

  it('infers UX badge GNB from description (legacy NAVI 키워드 경로 제거)', () => {
    const hints = inferBadgeHintStringsFromMetadata({
      name: '',
      description: '메뉴 화면',
      metadata: {}
    });
    expect(hints).toContain('GNB');
    expect(hints).not.toContain('NAVI');
  });

  it('infers GNB·ZINDEX·FLEX from mixed UX/DEV description (GATE C 시나리오 1)', () => {
    const hints = inferBadgeHintStringsFromMetadata({
      name: '',
      description: 'GNB, z-index, flexbox로 정렬',
      metadata: {}
    });
    expect(hints).toEqual(expect.arrayContaining(['GNB', 'ZINDEX', 'FLEX']));
    expect(hints.length).toBeLessThanOrEqual(6);
  });

  it('infers UX GRID·GUTTER·BREAKPT from layout copy (GATE C 시나리오 2)', () => {
    const hints = inferBadgeHintStringsFromMetadata({
      name: '',
      description: '12컬럼 그리드, gutter, breakpoint',
      metadata: {}
    });
    expect(hints).toEqual(expect.arrayContaining(['GRID', 'GUTTER', 'BREAKPT']));
    expect(hints).not.toContain('CSSGRID');
  });

  it('infers DEV MQUERY from responsive implementation copy (GATE C 시나리오 3)', () => {
    const hints = inferBadgeHintStringsFromMetadata({
      name: '',
      description: 'media query로 반응형',
      metadata: {}
    });
    expect(hints).toContain('MQUERY');
  });

  it('disambiguates CSSGRID vs UX GRID', () => {
    const devHints = inferBadgeHintStringsFromMetadata({
      name: '',
      description: 'display: grid와 flexbox 레이아웃',
      metadata: {}
    });
    expect(devHints).toContain('CSSGRID');
    expect(devHints).toContain('FLEX');

    const uxHints = inferBadgeHintStringsFromMetadata({
      name: '',
      description: '12컬럼 그리드 시스템과 거터',
      metadata: {}
    });
    expect(uxHints).toContain('GRID');
    expect(uxHints).not.toContain('CSSGRID');
  });

  // 긍정 케이스: 구조 메타에서 DEV 배지
  it('infers PAYMENT from structured metadata hint', () => {
    const hints = inferBadgeHintStringsFromMetadata({
      name: 'Order',
      description: '',
      metadata: {
        functionalSpec: { io: 'stripe webhook' }
      }
    });
    expect(hints).toContain('PAYMENT');
  });

  // 상한 케이스
  it('iaGrid screenType list maps to LIST (structure before keywords)', () => {
    const hints = inferBadgeHintStringsFromMetadata({
      name: '화면',
      description: '짧은 설명',
      metadata: { iaGrid: { screenType: 'list' } }
    });
    expect(hints[0]).toBe('LIST');
    expect(hints).toContain('LIST');
  });

  it('does not infer CRUD from description mentioning CRUD API (GATE C 3)', () => {
    const hints = inferBadgeHintStringsFromMetadata({
      name: '',
      description: 'CRUD API 설계',
      metadata: {}
    });
    expect(hints).not.toContain('CRUD');
    expect(hints).toContain('API');
  });

  it('treeImportExtras crud flag does not emit CRUD hint', () => {
    const hints = inferBadgeHintStringsFromMetadata({
      name: 'Node',
      metadata: { treeImportExtras: { crud: true } }
    });
    expect(hints).not.toContain('CRUD');
  });

  it('does not infer removed DEV env/process tokens from description (BADGE-ALIGN)', () => {
    const hints = inferBadgeHintStringsFromMetadata({
      name: '배포',
      description: 'json staging localhost deploy hotfix pull request PR',
      metadata: {}
    });
    for (const removed of ['JSON', 'LOCAL', 'STAGING', 'PROD', 'DEPLOY', 'HOTFIX', 'PR', 'CRUD']) {
      expect(hints).not.toContain(removed);
    }
  });

  describe('PERF-RENDER-P1 rules runtime cache', () => {
    it('getAiLearnedBadgeInferenceRules reads AI localStorage once per stable raw', () => {
      lsMockStore[AI_LEARNED_LS_KEY] = JSON.stringify({
        v: 1,
        updatedAt: 't',
        rules: [{ field: 'name', contains: 'cached-node', suggestBadges: ['API'] }]
      });
      clearBadgeInferenceRulesRuntimeCache();
      const getItemSpy = vi.spyOn(localStorage, 'getItem');
      for (let i = 0; i < 100; i++) {
        getAiLearnedBadgeInferenceRules();
      }
      const aiCalls = getItemSpy.mock.calls.filter((c) => c[0] === AI_LEARNED_LS_KEY);
      expect(aiCalls).toHaveLength(1);
      getItemSpy.mockRestore();
    });

    it('getUserBadgeInferenceRules reads user localStorage once when LS raw is absent', () => {
      setUserBadgeInferenceRules([{ field: 'name', contains: 'MEM', suggestBadges: ['MVP'] }]);
      delete lsMockStore[USER_RULES_LS_KEY];
      clearBadgeInferenceRulesRuntimeCache();
      const getItemSpy = vi.spyOn(localStorage, 'getItem');
      for (let i = 0; i < 100; i++) {
        getUserBadgeInferenceRules();
      }
      const userCalls = getItemSpy.mock.calls.filter((c) => c[0] === USER_RULES_LS_KEY);
      expect(userCalls).toHaveLength(1);
      expect(getUserBadgeInferenceRules()[0]?.contains).toBe('MEM');
      getItemSpy.mockRestore();
    });

    it('clearAiLearnedBadgeInferenceRules invalidates AI cache (next read hits localStorage again)', () => {
      mergeLearnedBadgeRulesFromImportedNodes([
        { name: 'Cache Invalidate Alpha', metadata: { badges: { dev: ['API'], ux: [], prj: [] } } }
      ]);
      clearBadgeInferenceRulesRuntimeCache();
      const getItemSpy = vi.spyOn(localStorage, 'getItem');
      getAiLearnedBadgeInferenceRules();
      getAiLearnedBadgeInferenceRules();
      expect(getItemSpy.mock.calls.filter((c) => c[0] === AI_LEARNED_LS_KEY)).toHaveLength(1);
      clearAiLearnedBadgeInferenceRules();
      expect(getAiLearnedBadgeInferenceRules()).toEqual([]);
      expect(getItemSpy.mock.calls.filter((c) => c[0] === AI_LEARNED_LS_KEY)).toHaveLength(2);
      getItemSpy.mockRestore();
    });

    it('mergeLearnedBadgeRulesFromImportedNodes refreshes AI cache after invalidate', () => {
      mergeLearnedBadgeRulesFromImportedNodes([
        { name: 'Merge Cache First Unique', metadata: { badges: { dev: ['TDD'], ux: [], prj: [] } } }
      ]);
      clearBadgeInferenceRulesRuntimeCache();
      getAiLearnedBadgeInferenceRules();
      mergeLearnedBadgeRulesFromImportedNodes([
        { name: 'Merge Cache Second Unique', metadata: { badges: { dev: ['AUTH'], ux: [], prj: [] } } }
      ]);
      const rules = getAiLearnedBadgeInferenceRules();
      expect(rules.some((r) => r.contains === 'Merge Cache Second Unique')).toBe(true);
    });
  });

  it('caps hints at MAX_HINTS_PER_NODE = 6', () => {
    // 10개의 힌트를 유도하되, 상한이 6개로 제한되어야 함
    setUserBadgeInferenceRules([
      { field: 'name', contains: 'test1', suggestBadges: ['API'] },
      { field: 'name', contains: 'test2', suggestBadges: ['TDD'] },
      { field: 'name', contains: 'test3', suggestBadges: ['AUTH'] },
      { field: 'name', contains: 'test4', suggestBadges: ['PAYMENT'] },
    ]);
    const hints = inferBadgeHintStringsFromMetadata({
      name: 'test1 test2 test3 test4',
      description: '',
      metadata: {
        treeImportExtras: { auth: true, realtime: true },
        functionalSpec: { io: 'form validation' }
      }
    });
    // 상한 적용: 최대 6개
    expect(hints.length).toBeLessThanOrEqual(6);
  });
});
