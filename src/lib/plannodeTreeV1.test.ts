import { describe, expect, it } from 'vitest';
import { parsePlannodeTreeV1ImportText, parsePlannodeTreeV1Json } from './plannodeTreeV1';

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
});
