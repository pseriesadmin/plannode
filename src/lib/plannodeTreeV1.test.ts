import { describe, expect, it } from 'vitest';
import {
  PLANNODE_TREE_UNSUPPORTED_VERSION_MESSAGE,
  PLANNODE_TREE_VERSION_INVALID_MESSAGE,
  PLANNODETREE_EXPORT_ROOT_VERSION,
  parsePlannodeTreeV1ImportText,
  parsePlannodeTreeV1Json
} from './plannodeTreeV1';
import { outlinePlainTextToPlannodeTreeV1 } from './outlineToPlannodeTreeV1';

const minimalTree = {
  format: 'plannode.tree',
  version: 1,
  project: {
    id: 'p-import-test',
    name: 'Import Test',
    author: 't',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    description: ''
  },
  nodes: [
    {
      id: 'root',
      parent_id: null,
      name: 'Root',
      description: '',
      num: '1',
      badges: [],
      node_type: 'detail'
    }
  ]
};

describe('parsePlannodeTreeV1ImportText', () => {
  it('parses raw JSON string', () => {
    const r = parsePlannodeTreeV1ImportText(JSON.stringify(minimalTree));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.project.id).toBe('p-import-test');
      expect(r.nodes).toHaveLength(1);
    }
  });

  it('extracts from markdown with ```json fence', () => {
    const md = `# 백업\n\n아래 블록:\n\n\`\`\`json\n${JSON.stringify(minimalTree, null, 2)}\n\`\`\`\n`;
    const r = parsePlannodeTreeV1ImportText(md);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nodes[0].id).toBe('root');
  });

  it('prefers json-labeled fence over prose fence', () => {
    const badInner = JSON.stringify({ format: 'plannode.tree', version: 1, project: {}, nodes: [] });
    const good = JSON.stringify(minimalTree);
    const md = `\`\`\`\n${badInner}\n\`\`\`\n\n\`\`\`json\n${good}\n\`\`\``;
    const r = parsePlannodeTreeV1ImportText(md);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project.id).toBe('p-import-test');
  });

  it('maps synonym badges through markdown ```json fence (same path as .md 가져오기)', () => {
    const tree = {
      ...minimalTree,
      nodes: [
        {
          id: 'root',
          parent_id: null,
          name: 'Root',
          description: '',
          num: '1',
          badges: ['navigation', 'REST_API', 'billing'],
          node_type: 'root'
        }
      ]
    };
    const md = `# Plannode 백업\n\n\`\`\`json\n${JSON.stringify(tree, null, 2)}\n\`\`\`\n`;
    const r = parsePlannodeTreeV1ImportText(md);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const root = r.nodes[0];
    expect(root.badges.sort()).toEqual(['api', 'navi', 'payment']);
    expect(root.metadata?.badges?.ux).toContain('NAVI');
    expect(root.metadata?.badges?.dev?.sort()).toEqual(['API', 'PAYMENT']);
  });

  it('parsePlannodeTreeV1Json still rejects non-json', () => {
    const r = parsePlannodeTreeV1Json('# only md');
    expect(r.ok).toBe(false);
  });

  it('drops non-standard badges on import (CRAZYSHOT-style noise)', () => {
    const tree = {
      ...minimalTree,
      nodes: [
        {
          id: 'root',
          parent_id: null,
          name: 'Root',
          description: '',
          num: '1',
          badges: ['tdd', 'pg_cron', 'Architecture', 'REALTIME'],
          node_type: 'root'
        }
      ]
    };
    const r = parsePlannodeTreeV1Json(JSON.stringify(tree));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nodes[0].badges.sort()).toEqual(['realtime', 'tdd']);
    expect(r.nodes[0].metadata?.badges).toEqual({
      dev: ['TDD', 'REALTIME'],
      ux: [],
      prj: []
    });
  });

  it('sanitizes metadata.badges tracks and syncs flat badges', () => {
    const tree = {
      ...minimalTree,
      nodes: [
        {
          id: 'root',
          parent_id: null,
          name: 'Root',
          description: '',
          num: '1',
          badges: [],
          metadata: {
            badges: {
              dev: ['TDD', 'INVALID_DEV'],
              ux: ['LIST', 'PDF'],
              prj: ['MVP']
            },
            tech: ['Supabase']
          },
          node_type: 'root'
        }
      ]
    };
    const r = parsePlannodeTreeV1Json(JSON.stringify(tree));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nodes[0].metadata?.tech).toEqual(['Supabase']);
    expect(r.nodes[0].metadata?.badges).toEqual({
      dev: ['TDD'],
      ux: ['LIST'],
      prj: ['MVP']
    });
    expect(r.nodes[0].badges.sort()).toEqual(['list', 'mvp', 'tdd']);
  });

  it('parses JSON from generic fence (no lang line tag)', () => {
    const md = `노트\n\n\`\`\`\n${JSON.stringify(minimalTree)}\n\`\`\`\n`;
    const r = parsePlannodeTreeV1ImportText(md);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project.id).toBe('p-import-test');
  });

  it('parses JSON from ```javascript fence', () => {
    const md = `\`\`\`javascript\n${JSON.stringify(minimalTree)}\n\`\`\``;
    const r = parsePlannodeTreeV1ImportText(md);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nodes).toHaveLength(1);
  });

  it('fails md when fences contain no valid plannode.tree v1', () => {
    const md = `# x\n\n\`\`\`json\n{"a":1}\n\`\`\`\n`;
    const r = parsePlannodeTreeV1ImportText(md);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('펜스');
  });
});

/** NOW-56: `version` 2 raw JSON · md 펜스 · v1 회귀 · 미지원 version 메시지 */
describe('plannode.tree file version 2 (import)', () => {
  const minimalTreeV2 = {
    format: 'plannode.tree',
    version: 2,
    project: {
      id: 'p-v2-import',
      name: 'V2 Import',
      author: 't',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      description: ''
    },
    nodes: [
      {
        id: 'p-v2-import-r',
        parent_id: null,
        name: '루트',
        description: '',
        num: '0',
        badges: [],
        node_type: 'service',
        level: 1,
        externalOnly: { a: 1 }
      },
      {
        id: 'n-fg',
        parent_id: 'p-v2-import-r',
        name: '기능 묶음',
        description: '',
        num: '1',
        badges: [],
        node_type: 'feature_group'
      }
    ]
  };

  it('parses raw JSON with version 2 and normalizes node_type', () => {
    const r = parsePlannodeTreeV1Json(JSON.stringify(minimalTreeV2));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.id).toBe('p-v2-import');
    const root = r.nodes.find((n) => n.id === 'p-v2-import-r');
    const child = r.nodes.find((n) => n.id === 'n-fg');
    expect(root?.node_type).toBe('module');
    expect(child?.node_type).toBe('feature');
  });

  it('stores unknown node keys under metadata.treeImportExtras for v2 only', () => {
    const r = parsePlannodeTreeV1Json(JSON.stringify(minimalTreeV2));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const root = r.nodes.find((n) => n.id === 'p-v2-import-r');
    expect(root?.metadata?.treeImportExtras).toEqual({
      level: 1,
      externalOnly: { a: 1 }
    });
    const child = r.nodes.find((n) => n.id === 'n-fg');
    expect(child?.metadata?.treeImportExtras).toBeUndefined();
  });

  it('extracts version 2 from markdown ```json fence', () => {
    const md = `# 백업 v2\n\n\`\`\`json\n${JSON.stringify(minimalTreeV2, null, 2)}\n\`\`\`\n`;
    const r = parsePlannodeTreeV1ImportText(md);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nodes.find((n) => n.id === 'n-fg')?.node_type).toBe('feature');
  });

  it('accepts version 3 through 5 like version 2 (extras + feature_group)', () => {
    for (const v of [3, 4, 5] as const) {
      const tree = { ...minimalTreeV2, version: v };
      const r = parsePlannodeTreeV1Json(JSON.stringify(tree));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const root = r.nodes.find((n) => n.id === 'p-v2-import-r');
      expect(root?.metadata?.treeImportExtras).toEqual({
        level: 1,
        externalOnly: { a: 1 }
      });
      expect(r.nodes.find((n) => n.id === 'n-fg')?.node_type).toBe('feature');
    }
  });

  it('rejects version 6+ with unsupported message', () => {
    const bad = { ...minimalTree, version: 6 };
    const r = parsePlannodeTreeV1Json(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(PLANNODE_TREE_UNSUPPORTED_VERSION_MESSAGE);
  });

  it('rejects non-integer version with shared invalid message', () => {
    const bad = { ...minimalTree, version: '2' as unknown as number };
    const r = parsePlannodeTreeV1Json(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(PLANNODE_TREE_VERSION_INVALID_MESSAGE);
  });

  it('rejects missing version', () => {
    const { version: _v, ...rest } = minimalTree;
    const r = parsePlannodeTreeV1Json(JSON.stringify(rest));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(PLANNODE_TREE_VERSION_INVALID_MESSAGE);
  });

  it('v1 import still parses unchanged (regression)', () => {
    const r = parsePlannodeTreeV1Json(JSON.stringify(minimalTree));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nodes[0].node_type).toBe('detail');
  });

  it('v1 ignores unknown node keys (no treeImportExtras)', () => {
    const tree = {
      ...minimalTree,
      nodes: [
        {
          ...minimalTree.nodes[0],
          strayKey: 'gone'
        }
      ]
    };
    const r = parsePlannodeTreeV1Json(JSON.stringify(tree));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nodes[0].metadata?.treeImportExtras).toBeUndefined();
  });

  it('NOW-58: app export root version constant stays 1 (pilot re-export contract)', () => {
    expect(PLANNODETREE_EXPORT_ROOT_VERSION).toBe(1);
  });
});

/** NOW-53: 평문 헤딩( docx→mammoth 산출물 가정 ) → outline → parse와 동일 sanitize·깊이 계약 */
describe('outline → plannode.tree v1 (import stack)', () => {
  it('outline output nodes have badges arrays and depth (sanitized import shape)', () => {
    const plain = `# A\n## B\n`;
    const r = outlinePlainTextToPlannodeTreeV1(plain, { projectName: 'Outline import' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const n of r.nodes) {
      expect(Array.isArray(n.badges)).toBe(true);
      expect(typeof n.depth).toBe('number');
      expect(n.project_id).toBe(r.project.id);
    }
    const root = r.nodes.find((x) => x.parent_id == null);
    expect(root?.node_type).toBe('root');
  });
});
