import { describe, expect, it } from 'vitest';
import type { Node } from '$lib/supabase/client';
import {
  buildIaStructureMarkdownFromTree,
  buildPrompt,
  buildWireframesMarkdownFromTree,
  isLayer1ContextSufficient
} from './iaExporter';
import { buildContextFromNodes } from './contextSerializer';
import { runPlannodeIAExport } from './iaExportRunner';

const project = { name: 'Demo App', description: '테스트 프로젝트' };

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
    depth: 0
  }),
  node({
    id: 'n1',
    parent_id: 'p-r',
    node_type: 'module',
    num: '1',
    name: '주문',
    depth: 1
  }),
  node({
    id: 'n1-1',
    parent_id: 'n1',
    node_type: 'feature',
    num: '1.1',
    name: '주문 목록',
    depth: 2,
    description: '목록 화면',
    metadata: {
      iaGrid: {
        path: '/orders',
        routePattern: '/orders',
        devPriority: 'P1',
        linkedScreens: '상세'
      }
    }
  })
];

describe('iaExporter template (P2-A)', () => {
  it('buildIaStructureMarkdownFromTree: 동일 입력 2회 동일', () => {
    const a = buildIaStructureMarkdownFromTree(sampleNodes, project);
    const b = buildIaStructureMarkdownFromTree(sampleNodes, project);
    expect(a).toBe(b);
    expect(a).toContain('# Demo App — 정보 구조(IA)');
    expect(a).toContain('## IA 구조 표');
    expect(a).toContain('```mermaid');
    expect(a).toContain('/orders');
  });

  it('buildWireframesMarkdownFromTree: 동일 입력 2회 동일', () => {
    const a = buildWireframesMarkdownFromTree(sampleNodes, project);
    const b = buildWireframesMarkdownFromTree(sampleNodes, project);
    expect(a).toBe(b);
    expect(a).toContain('# Demo App — 와이어프레임 키트');
    expect(a).toContain('## 화면 목록');
    expect(a).toContain('## 화면별 블록');
    expect(a).toContain('### 1.1 주문 목록');
    expect(a).toContain('[ Header / GNB ]');
  });

  it('빈 nodes면 안내 문구', () => {
    expect(buildIaStructureMarkdownFromTree([], project)).toContain('_노드가 없습니다._');
    expect(buildWireframesMarkdownFromTree([], project)).toContain('_와이어 대상');
  });
});

describe('iaExporter buildPrompt LAYER1 (P2-B)', () => {
  const projectMeta = { name: project.name, description: project.description };

  it('buildPrompt user: currentNodeId=n1-1에 [HIERARCHY CONTEXT]·[CURRENT] 포함', () => {
    const { user } = buildPrompt(sampleNodes, projectMeta, 'PRD', 'root', 'n1-1');
    expect(user).toContain('## 구조 맥락 (LAYER1');
    expect(user).toContain('[HIERARCHY CONTEXT]');
    expect(user).toContain('[CURRENT]');
    expect(user).toContain('주문 목록');
  });

  it('buildPrompt user: currentNodeId=n1(모듈)에도 L1 블록 포함', () => {
    const { user } = buildPrompt(sampleNodes, projectMeta, 'WIREFRAME_SPEC', 'module', 'n1');
    expect(user).toContain('[HIERARCHY CONTEXT]');
    expect(user).toContain('[CURRENT]');
    expect(user).toContain('주문');
  });

  it('회귀: user가 트리 텍스트만으로 구성되지 않음 (구형 user-only 금지)', () => {
    const { user } = buildPrompt(sampleNodes, projectMeta, 'PRD', 'root', 'n1-1');
    const treeOnlyPattern = /^프로젝트:[\s\S]*```[\s\S]*```\s*$/;
    expect(user).not.toMatch(treeOnlyPattern);
    expect(user.indexOf('[HIERARCHY CONTEXT]')).toBeLessThan(user.indexOf('## 기능 트리'));
  });
});

describe('isLayer1ContextSufficient (P2-B)', () => {
  it('루트만·하위 없으면 false', () => {
    const rootOnly = [sampleNodes[0]];
    const ctx = buildContextFromNodes('p-r', rootOnly, {
      name: project.name,
      domain: 'custom',
      techStack: [],
      outputIntents: ['PRD']
    });
    expect(isLayer1ContextSufficient(ctx)).toBe(false);
  });
});

describe('runPlannodeIAExport LAYER1 (P2-B-05)', () => {
  it('루트만·하위 없으면 API 스킵(context_insufficient) · 복사용 L1 포함', async () => {
    const rootOnly = [sampleNodes[0]];
    const res = await runPlannodeIAExport({
      nodes: rootOnly,
      activeProject: project,
      plannodeProjectId: 'p-demo',
      currentNodeId: 'p-r',
      intent: 'IA_STRUCTURE',
      accessToken: 'test-token'
    });
    expect(res.kind).toBe('context_insufficient');
    if (res.kind === 'context_insufficient') {
      expect(res.fallbackClipboard).toContain('[HIERARCHY CONTEXT]');
    }
  });
});
