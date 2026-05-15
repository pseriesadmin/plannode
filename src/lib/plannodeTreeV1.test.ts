import { describe, expect, it } from 'vitest';
import {
  PLANNODE_GLOBAL_PROJECT_EXTRAS_NODE_ID,
  PLANNODE_GLOBAL_UNKNOWN_ROOTS_NODE_ID,
  PLANNODE_TREE_UNSUPPORTED_VERSION_MESSAGE,
  PLANNODE_TREE_VERSION_INVALID_MESSAGE,
  PLANNODETREE_EXPORT_ROOT_VERSION,
  isPlannodeJsonGlobalMirrorNode,
  parsePlannodeTreeV1ImportText,
  parsePlannodeTreeV1Json,
  rehoistGlobalMirrorNodes
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

  it('NOW-TREE-JSON-05: reports unknown root keys on success (sorted)', () => {
    const tree = {
      ...minimalTree,
      extra_vendor_root: { foo: 1 },
      another_unknown: 'x'
    };
    const r = parsePlannodeTreeV1Json(JSON.stringify(tree));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.unknownRootKeys).toEqual(['another_unknown', 'extra_vendor_root']);
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

/** NOW-TREE-JSON-02: 루트 `global_*` 등 → 합성 `global` 노드 · v1/v2에서 `detail` 오염 없음 */
describe('plannode.tree global root mirror (NOW-TREE-JSON-02)', () => {
  const baseProject = {
    id: 'p-gmirror',
    name: 'Global mirror',
    author: 't',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    description: ''
  };

  const rootRow = {
    id: 'p-gmirror-r',
    parent_id: null,
    name: 'PRD',
    description: '',
    num: 'PRD',
    badges: [],
    node_type: 'root'
  };

  function treeWithGlobals(version: 1 | 2) {
    return {
      format: 'plannode.tree',
      version,
      project: baseProject,
      nodes: [rootRow],
      global_schema: { tables: ['orders'] },
      global_api: { baseUrl: 'https://api.example' },
      tech_stack: ['SvelteKit', 'Postgres'],
      schema_notes: 'keep rls',
      _import_lock: false
    };
  }

  it('uses root node id from node_type=root when it differs from projectId-r', () => {
    const customRootId = 'p-gmirror-custom-root';
    const tree = {
      format: 'plannode.tree' as const,
      version: 1,
      project: baseProject,
      nodes: [
        {
          id: customRootId,
          parent_id: null,
          name: 'PRD',
          description: '',
          num: 'PRD',
          badges: [],
          node_type: 'root'
        }
      ],
      global_schema: { tables: ['a'] }
    };
    const r = parsePlannodeTreeV1Json(JSON.stringify(tree));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const schema = r.nodes.find((n) => n.id === '__global_schema__');
    expect(schema?.parent_id).toBe(customRootId);
  });

  it('v1: injects synthetic global nodes under project id-r with plannodeGlobal* metadata', () => {
    const r = parsePlannodeTreeV1Json(JSON.stringify(treeWithGlobals(1)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ids = r.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(
      ['__global_api__', '__global_import_lock__', '__global_schema__', '__global_schema_notes__', '__global_tech_stack__', 'p-gmirror-r'].sort()
    );
    const schema = r.nodes.find((n) => n.id === '__global_schema__');
    expect(schema?.node_type).toBe('global');
    expect(schema?.parent_id).toBe('p-gmirror-r');
    expect(schema?.metadata?.plannodeGlobalRootKey).toBe('global_schema');
    expect(schema?.metadata?.plannodeGlobalPayload).toEqual({ tables: ['orders'] });
    const tech = r.nodes.find((n) => n.id === '__global_tech_stack__');
    expect(tech?.node_type).toBe('global');
    expect(tech?.metadata?.plannodeGlobalPayload).toEqual(['SvelteKit', 'Postgres']);
  });

  it('v2: keeps node_type global (not coerced to detail)', () => {
    const r = parsePlannodeTreeV1Json(JSON.stringify(treeWithGlobals(2)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const id of ['__global_schema__', '__global_api__', '__global_tech_stack__']) {
      expect(r.nodes.find((n) => n.id === id)?.node_type).toBe('global');
    }
  });

  it('v2: explicit node_type Global normalizes to global', () => {
    const tree = {
      ...treeWithGlobals(2),
      nodes: [
        rootRow,
        {
          id: 'n-g',
          parent_id: 'p-gmirror-r',
          name: 'G',
          description: '',
          num: 'x',
          badges: [],
          node_type: 'Global'
        }
      ]
    };
    const r = parsePlannodeTreeV1Json(JSON.stringify(tree));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nodes.find((n) => n.id === 'n-g')?.node_type).toBe('global');
  });

  it('skips mirror when synthetic id already present in nodes', () => {
    const tree = treeWithGlobals(1);
    const preExisting = {
      id: '__global_schema__',
      parent_id: 'p-gmirror-r',
      name: 'Already',
      description: '',
      num: 'GLOBAL',
      badges: [],
      node_type: 'global',
      metadata: { plannodeGlobalRootKey: 'global_schema', plannodeGlobalPayload: { custom: true } }
    };
    const r = parsePlannodeTreeV1Json(
      JSON.stringify({
        ...tree,
        nodes: [rootRow, preExisting]
      })
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const schemas = r.nodes.filter((n) => n.id === '__global_schema__');
    expect(schemas).toHaveLength(1);
    expect(schemas[0].metadata?.plannodeGlobalPayload).toEqual({ custom: true });
  });

  it('skips all mirrors when no root row and projectId-r is absent from nodes', () => {
    const badRootId = {
      ...treeWithGlobals(1),
      nodes: [{ ...rootRow, id: 'wrong-root-id', node_type: 'module' }]
    };
    const r = parsePlannodeTreeV1Json(JSON.stringify(badRootId));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nodes).toHaveLength(1);
    expect(r.nodes[0].id).toBe('wrong-root-id');
  });

  it('v1: injects __global_module__ when global_module root key present', () => {
    const tree = { ...treeWithGlobals(1), global_module: { routes: ['/a'] } };
    const r = parsePlannodeTreeV1Json(JSON.stringify(tree));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const m = r.nodes.find((n) => n.id === '__global_module__');
    expect(m?.node_type).toBe('global');
    expect(m?.metadata?.plannodeGlobalPayload).toEqual({ routes: ['/a'] });
  });

  /** `buildPlannodeExportV1`(파일럿)과 동일: 미러 제거 + 루트 키 복원 → 재파싱 동치 */
  it('NOW-TREE-JSON-03: round-trip re-import after hoist matches original mirrors', () => {
    const t = treeWithGlobals(1);
    const r1 = parsePlannodeTreeV1Json(JSON.stringify(t));
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const mirrorsOut = {};
    const plainRows = [];
    for (const n of r1.nodes) {
      const meta = n.metadata;
      const isMirror =
        n.node_type === 'global' &&
        meta &&
        typeof meta === 'object' &&
        Object.prototype.hasOwnProperty.call(meta, 'plannodeGlobalRootKey');
      if (isMirror) {
        const k = String(meta.plannodeGlobalRootKey ?? '').trim();
        if (k) {
          try {
            mirrorsOut[k] = JSON.parse(JSON.stringify(meta.plannodeGlobalPayload));
          } catch {
            mirrorsOut[k] = meta.plannodeGlobalPayload;
          }
        }
        continue;
      }
      plainRows.push({
        id: n.id,
        parent_id: n.parent_id ?? null,
        name: n.name,
        description: n.description ?? '',
        num: n.num ?? '',
        badges: n.badges ?? [],
        ...(meta && Object.keys(meta).length > 0
          ? { metadata: JSON.parse(JSON.stringify(meta)) }
          : {}),
        node_type: n.node_type,
        ...(n.mx != null ? { mx: n.mx } : {}),
        ...(n.my != null ? { my: n.my } : {})
      });
    }
    const body = {
      format: 'plannode.tree',
      version: 1,
      exportedAt: new Date().toISOString(),
      project: t.project,
      ...mirrorsOut,
      nodes: plainRows
    };
    const r2 = parsePlannodeTreeV1Json(JSON.stringify(body));
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.nodes.map((n) => n.id).sort()).toEqual(r1.nodes.map((n) => n.id).sort());
    const g1 = r1.nodes.find((x) => x.id === '__global_schema__');
    const g2 = r2.nodes.find((x) => x.id === '__global_schema__');
    expect(g2?.metadata?.plannodeGlobalPayload).toEqual(g1?.metadata?.plannodeGlobalPayload);
  });

  it('NOW-TREE-JSON-09: unknown root keys aggregate + rehoist + double parse lossless', () => {
    const tree = {
      ...treeWithGlobals(1),
      ai_blob: { n: 1 },
      custom_list: ['x']
    };
    const r1 = parsePlannodeTreeV1Json(JSON.stringify(tree));
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.unknownRootKeys).toBeUndefined();
    const unk = r1.nodes.find((n) => n.id === PLANNODE_GLOBAL_UNKNOWN_ROOTS_NODE_ID);
    expect(unk?.metadata?.plannodeGlobalRootKey).toBe('__unknown_roots__');
    expect(unk?.metadata?.plannodeGlobalPayload).toEqual({
      ai_blob: { n: 1 },
      custom_list: ['x']
    });

    const plainRows = (nodes: (typeof r1 & { ok: true })['nodes']) => {
      const out: Record<string, unknown>[] = [];
      for (const n of nodes) {
        const meta = n.metadata;
        const isMirror =
          n.node_type === 'global' &&
          meta &&
          typeof meta === 'object' &&
          Object.prototype.hasOwnProperty.call(meta, 'plannodeGlobalRootKey');
        if (isMirror) continue;
        out.push({
          id: n.id,
          parent_id: n.parent_id ?? null,
          name: n.name,
          description: n.description ?? '',
          num: n.num ?? '',
          badges: n.badges ?? [],
          ...(meta && Object.keys(meta).length > 0
            ? { metadata: JSON.parse(JSON.stringify(meta)) }
            : {}),
          node_type: n.node_type,
          ...(n.mx != null ? { mx: n.mx } : {}),
          ...(n.my != null ? { my: n.my } : {})
        });
      }
      return out;
    };

    const buildExport = (
      nodes: (typeof r1 & { ok: true })['nodes'],
      project: (typeof r1 & { ok: true })['project']
    ) => {
      const out: Record<string, unknown> = {
        format: 'plannode.tree',
        version: 1,
        exportedAt: new Date().toISOString(),
        project: JSON.parse(JSON.stringify(project)),
        nodes: plainRows(nodes)
      };
      rehoistGlobalMirrorNodes(nodes, out, out.project as Record<string, unknown>);
      return out;
    };

    const body1 = buildExport(r1.nodes, r1.project);
    expect(body1.ai_blob).toEqual({ n: 1 });
    expect(body1.custom_list).toEqual(['x']);

    const r2 = parsePlannodeTreeV1Json(JSON.stringify(body1));
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    const body2 = buildExport(r2.nodes, r2.project);
    const r3 = parsePlannodeTreeV1Json(JSON.stringify(body2));
    expect(r3.ok).toBe(true);
    if (!r3.ok) return;
    expect(r3.nodes.find((n) => n.id === PLANNODE_GLOBAL_UNKNOWN_ROOTS_NODE_ID)?.metadata?.plannodeGlobalPayload).toEqual(
      unk?.metadata?.plannodeGlobalPayload
    );
  });

  it('NOW-TREE-JSON-09: project non-standard fields → __global_project_extras__ + rehoist', () => {
    const tree = {
      format: 'plannode.tree',
      version: 1,
      project: {
        ...baseProject,
        schema_version: 7,
        flags: { beta: true }
      },
      nodes: [rootRow]
    };
    const r = parsePlannodeTreeV1Json(JSON.stringify(tree));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ex = r.nodes.find((n) => n.id === PLANNODE_GLOBAL_PROJECT_EXTRAS_NODE_ID);
    expect(ex?.metadata?.plannodeGlobalRootKey).toBe('__project_extras__');
    expect(ex?.metadata?.plannodeGlobalPayload).toEqual({ schema_version: 7, flags: { beta: true } });

    const plainRows: Record<string, unknown>[] = [];
    for (const n of r.nodes) {
      const meta = n.metadata;
      const isMirror =
        n.node_type === 'global' &&
        meta &&
        typeof meta === 'object' &&
        Object.prototype.hasOwnProperty.call(meta, 'plannodeGlobalRootKey');
      if (isMirror) continue;
      plainRows.push({
        id: n.id,
        parent_id: n.parent_id ?? null,
        name: n.name,
        description: n.description ?? '',
        num: n.num ?? '',
        badges: n.badges ?? [],
        ...(meta && Object.keys(meta).length > 0
          ? { metadata: JSON.parse(JSON.stringify(meta)) }
          : {}),
        node_type: n.node_type
      });
    }
    const out: Record<string, unknown> = {
      format: 'plannode.tree',
      version: 1,
      exportedAt: new Date().toISOString(),
      project: JSON.parse(JSON.stringify(r.project)),
      nodes: plainRows
    };
    rehoistGlobalMirrorNodes(r.nodes, out, out.project as Record<string, unknown>);
    expect((out.project as Record<string, unknown>).schema_version).toBe(7);
    expect((out.project as Record<string, unknown>).flags).toEqual({ beta: true });

    const r2 = parsePlannodeTreeV1Json(JSON.stringify(out));
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.nodes.find((n) => n.id === PLANNODE_GLOBAL_PROJECT_EXTRAS_NODE_ID)?.metadata?.plannodeGlobalPayload).toEqual(
      ex?.metadata?.plannodeGlobalPayload
    );
  });
});

describe('isPlannodeJsonGlobalMirrorNode', () => {
  it('true when node_type global and plannodeGlobalRootKey is non-empty string', () => {
    expect(
      isPlannodeJsonGlobalMirrorNode({
        node_type: 'global',
        metadata: { plannodeGlobalRootKey: 'global_schema' }
      })
    ).toBe(true);
  });
  it('false for global without root key', () => {
    expect(isPlannodeJsonGlobalMirrorNode({ node_type: 'global', metadata: {} })).toBe(false);
  });
  it('false for detail even with plannodeGlobalRootKey', () => {
    expect(
      isPlannodeJsonGlobalMirrorNode({
        node_type: 'detail',
        metadata: { plannodeGlobalRootKey: 'x' }
      })
    ).toBe(false);
  });
  it('false for null', () => {
    expect(isPlannodeJsonGlobalMirrorNode(null)).toBe(false);
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
