import { describe, expect, it } from 'vitest';
import type { Node } from '$lib/supabase/client';
import { deriveNodeNums } from './nodeNumUtils';

const projectId = 'proj-1';
const now = '2026-06-16T12:00:00.000Z';

function node(partial: Partial<Node> & Pick<Node, 'id'>): Node {
  return {
    project_id: projectId,
    name: partial.name ?? partial.id,
    description: '',
    depth: partial.depth ?? 0,
    created_at: now,
    updated_at: now,
    ...partial
  };
}

describe('deriveNodeNums', () => {
  it('assigns PRD.1 PRD.2 from flat array sibling order', () => {
    const rootId = `${projectId}-r`;
    const nodes: Node[] = [
      node({ id: rootId, parent_id: undefined, node_type: 'root', num: 'PRD', depth: 0 }),
      node({ id: 'n2', parent_id: rootId, num: '9.9', depth: 1 }),
      node({ id: 'n1', parent_id: rootId, num: '1.1', depth: 1 })
    ];
    const out = deriveNodeNums(nodes);
    expect(out.find((n) => n.id === 'n2')?.num).toBe('PRD.1');
    expect(out.find((n) => n.id === 'n1')?.num).toBe('PRD.2');
  });

  it('preserves custom root prefix', () => {
    const rootId = `${projectId}-r`;
    const nodes: Node[] = [
      node({ id: rootId, parent_id: undefined, node_type: 'root', num: 'MAP', depth: 0 }),
      node({ id: 'c1', parent_id: rootId, depth: 1 })
    ];
    const out = deriveNodeNums(nodes);
    expect(out.find((n) => n.id === rootId)?.num).toBe('MAP');
    expect(out.find((n) => n.id === 'c1')?.num).toBe('MAP.1');
  });

  it('derives multi-level depth nums', () => {
    const rootId = `${projectId}-r`;
    const nodes: Node[] = [
      node({ id: rootId, parent_id: undefined, node_type: 'root', num: 'PRD', depth: 0 }),
      node({ id: 'm1', parent_id: rootId, depth: 1 }),
      node({ id: 'f1', parent_id: 'm1', depth: 2 }),
      node({ id: 'f2', parent_id: 'm1', depth: 2 })
    ];
    const out = deriveNodeNums(nodes);
    expect(out.find((n) => n.id === 'm1')?.num).toBe('PRD.1');
    expect(out.find((n) => n.id === 'f1')?.num).toBe('PRD.1.1');
    expect(out.find((n) => n.id === 'f2')?.num).toBe('PRD.1.2');
  });

  it('leaves global nodes unchanged', () => {
    const rootId = `${projectId}-r`;
    const nodes: Node[] = [
      node({ id: rootId, parent_id: undefined, node_type: 'root', num: 'PRD', depth: 0 }),
      node({
        id: '__global_schema__',
        parent_id: rootId,
        node_type: 'global',
        num: 'G-SCHEMA',
        depth: 1
      }),
      node({ id: 'c1', parent_id: rootId, depth: 1 })
    ];
    const out = deriveNodeNums(nodes);
    expect(out.find((n) => n.id === '__global_schema__')?.num).toBe('G-SCHEMA');
    expect(out.find((n) => n.id === 'c1')?.num).toBe('PRD.1');
  });

  it('excludes _deleted from walk but keeps them in output', () => {
    const rootId = `${projectId}-r`;
    const deleted = node({ id: 'gone', parent_id: rootId, num: 'OLD', depth: 1 });
    (deleted as Node & { _deleted: boolean })._deleted = true;
    const nodes: Node[] = [
      node({ id: rootId, parent_id: undefined, node_type: 'root', num: 'PRD', depth: 0 }),
      deleted,
      node({ id: 'keep', parent_id: rootId, depth: 1 })
    ];
    const out = deriveNodeNums(nodes);
    expect(out.find((n) => n.id === 'gone')?.num).toBe('OLD');
    expect(out.find((n) => n.id === 'keep')?.num).toBe('PRD.1');
  });

  it('returns input unchanged when no non-global root', () => {
    const nodes: Node[] = [node({ id: 'g1', parent_id: undefined, node_type: 'global', num: 'X', depth: 0 })];
    expect(deriveNodeNums(nodes)).toEqual(nodes);
  });
});
