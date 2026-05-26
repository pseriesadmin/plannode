import { describe, expect, it } from 'vitest';
import type { Node } from '$lib/supabase/client';
import {
  PRD_SECTION_KEYS,
  buildPrdL1CoreSummaryPrompt,
  buildPrdSectionEnhanceUserPrompt,
  getPrdSectionAutoBaseline,
  getPrdSectionEnhanceMeta
} from './prdStandardV20';

const project = {
  id: 'p-demo',
  name: 'Demo App',
  author: 'Tester',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  description: '테스트 프로젝트'
};

function node(over: Partial<Node> & Pick<Node, 'id'>): Node {
  return {
    id: over.id,
    project_id: 'p-demo',
    parent_id: over.parent_id,
    name: over.name ?? '노드',
    description: over.description ?? '',
    node_type: over.node_type ?? 'feature',
    num: over.num ?? '1',
    depth: over.depth ?? 0,
    badges: over.badges ?? [],
    mx: over.mx,
    my: over.my,
    metadata: over.metadata,
    created_at: '2026-05-19T00:00:00.000Z',
    updated_at: '2026-05-19T00:00:00.000Z'
  };
}

const sampleNodes: Node[] = [
  node({
    id: 'p-r',
    node_type: 'root',
    num: 'PRD',
    name: 'Demo App',
    depth: 0,
    description: '루트 개요'
  }),
  node({
    id: 'n1',
    parent_id: 'p-r',
    node_type: 'module',
    num: '1',
    name: '주문',
    depth: 1,
    description: '주문 모듈'
  })
];

describe('prdStandardV20 section enhance (NOW-PRD-01)', () => {
  it('PRD_SECTION_KEYS: s1~s5 메타·TARGET_SECTION 라벨 존재', () => {
    for (const key of PRD_SECTION_KEYS) {
      const meta = getPrdSectionEnhanceMeta(key);
      expect(meta.title.length).toBeGreaterThan(0);
      expect(meta.targetLabel.length).toBeGreaterThan(0);
      expect(meta.llmDirective.length).toBeGreaterThan(0);
    }
    expect(getPrdSectionEnhanceMeta('s2').maxTokensHint).toBeGreaterThan(
      getPrdSectionEnhanceMeta('s1').maxTokensHint ?? 0
    );
  });

  it('buildPrdSectionEnhanceUserPrompt: L1·TARGET_SECTION 포함 (s1~s5)', () => {
    for (const key of PRD_SECTION_KEYS) {
      const prompt = buildPrdSectionEnhanceUserPrompt(key, project, sampleNodes, null);
      expect(prompt).toContain('[HIERARCHY CONTEXT]');
      expect(prompt).toContain('[TARGET_SECTION:');
      expect(prompt).toContain(getPrdSectionEnhanceMeta(key).targetLabel);
      expect(prompt).toContain('OutputIntent.PRD');
    }
  });

  it('draft 있을 때 TARGET 본문에 draft 반영', () => {
    const custom = '### CUSTOM_DRAFT_MARKER\n사용자 초안 본문';
    const prompt = buildPrdSectionEnhanceUserPrompt('s3', project, sampleNodes, custom);
    expect(prompt).toContain('CUSTOM_DRAFT_MARKER');
    expect(prompt).not.toContain(getPrdSectionAutoBaseline('s3', project, sampleNodes));
  });

  it('buildPrdL1CoreSummaryPrompt: s1 위임·L1 포함', () => {
    const legacy = buildPrdL1CoreSummaryPrompt(project, sampleNodes, { s1: '### LEGACY_S1' });
    const direct = buildPrdSectionEnhanceUserPrompt('s1', project, sampleNodes, '### LEGACY_S1');
    expect(legacy).toBe(direct);
    expect(legacy).toContain('[HIERARCHY CONTEXT]');
    expect(legacy).toContain('LEGACY_S1');
  });
});
