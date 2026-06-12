import { describe, expect, it } from 'vitest';
import type { Node } from '$lib/supabase/client';
import { replayStructureOpsOnNodes } from './projects';

const projectId = 'proj-1';
const rootId = `${projectId}-r`;

function baseNodes(): Node[] {
  const now = '2026-05-26T10:00:00.000Z';
  return [
    {
      id: rootId,
      project_id: projectId,
      parent_id: null,
      name: 'Root',
      description: '',
      node_type: 'root',
      num: 'PRD',
      created_at: now,
      updated_at: now
    }
  ];
}

describe('replayStructureOpsOnNodes', () => {
  it('add_node appends new id', () => {
    const out = replayStructureOpsOnNodes(baseNodes(), [
      {
        type: 'add_node',
        node: {
          id: 'n1',
          parent_id: rootId,
          name: 'A',
          mx: 10,
          my: 20
        }
      }
    ], projectId);
    expect(out.some((n) => n.id === 'n1')).toBe(true);
    expect(out).toHaveLength(2);
  });

  it('concurrent add from two clients preserves both ids', () => {
    let list = baseNodes();
    list = replayStructureOpsOnNodes(list, [
      {
        type: 'add_node',
        node: { id: 'nA', parent_id: rootId, name: 'A', mx: 1, my: 1 }
      }
    ], projectId);
    list = replayStructureOpsOnNodes(list, [
      {
        type: 'add_node',
        node: { id: 'nB', parent_id: rootId, name: 'B', mx: 2, my: 2 }
      }
    ], projectId);
    expect(list.map((n) => n.id).sort()).toEqual([rootId, 'nA', 'nB'].sort());
  });

  it('update_node patches fields', () => {
    let list = replayStructureOpsOnNodes(baseNodes(), [
      {
        type: 'add_node',
        node: { id: 'n1', parent_id: rootId, name: '', mx: 0, my: 0 }
      }
    ], projectId);
    list = replayStructureOpsOnNodes(
      list,
      [
        {
          type: 'update_node',
          node: {
            id: 'n1',
            name: 'Saved',
            description: 'Body',
            updated_at: '2026-05-26T10:01:00.000Z'
          }
        }
      ],
      projectId
    );
    const n1 = list.find((n) => n.id === 'n1');
    expect(n1?.name).toBe('Saved');
    expect(n1?.description).toBe('Body');
  });

  it('delete_node removes subtree', () => {
    let list = replayStructureOpsOnNodes(baseNodes(), [
      {
        type: 'add_node',
        node: { id: 'n1', parent_id: rootId, name: 'P', mx: 0, my: 0 }
      }
    ], projectId);
    list = replayStructureOpsOnNodes(list, [
      {
        type: 'add_node',
        node: { id: 'n2', parent_id: 'n1', name: 'C', mx: 0, my: 0 }
      }
    ], projectId);
    list = replayStructureOpsOnNodes(list, [{ type: 'delete_node', node_id: 'n1' }], projectId);
    expect(list.some((n) => n.id === 'n1' || n.id === 'n2')).toBe(false);
  });

  it('[Fix-ORPHAN] add_node with unknown parent_id is skipped (no orphan)', () => {
    const list = replayStructureOpsOnNodes(baseNodes(), [
      { type: 'add_node', node: { id: 'n-ghost', parent_id: 'nonexistent-parent', name: 'ghost', layout_auto: true } }
    ], projectId);
    expect(list.find((n) => n.id === 'n-ghost')).toBeUndefined();
  });

  it('update_node with badges patches badges, no-badge op preserves existing', () => {
    let list = replayStructureOpsOnNodes(baseNodes(), [
      {
        type: 'add_node',
        node: { id: 'n1', parent_id: rootId, name: 'X', mx: 0, my: 0 }
      }
    ], projectId);
    // badges 포함 op → 패치
    list = replayStructureOpsOnNodes(list, [
      {
        type: 'update_node',
        node: { id: 'n1', name: 'X', badges: ['BE', 'FE'], updated_at: '2026-06-04T10:00:00.000Z' }
      }
    ], projectId);
    const after = list.find((n) => n.id === 'n1');
    expect(after?.badges).toEqual(['BE', 'FE']);

    // badges 키 없는 op → 기존 배지 유지
    list = replayStructureOpsOnNodes(list, [
      {
        type: 'update_node',
        node: { id: 'n1', name: 'X-renamed', updated_at: '2026-06-04T10:01:00.000Z' }
      }
    ], projectId);
    const preserved = list.find((n) => n.id === 'n1');
    expect(preserved?.name).toBe('X-renamed');
    expect(preserved?.badges).toEqual(['BE', 'FE']);
  });

  it('[Fix-ORPHAN] add_node parent added in same batch resolves on 2nd pass', () => {
    // n-parent 추가 후 n-child 추가 순서지만, n-child가 n-parent보다 먼저 처리됨
    const list = replayStructureOpsOnNodes(baseNodes(), [
      { type: 'add_node', node: { id: 'n-child', parent_id: 'n-parent', name: 'child', layout_auto: true } },
      { type: 'add_node', node: { id: 'n-parent', parent_id: rootId, name: 'parent', layout_auto: true } }
    ], projectId);
    expect(list.find((n) => n.id === 'n-parent')).toBeDefined();
    expect(list.find((n) => n.id === 'n-child')).toBeDefined();
  });

  it('reorder_siblings reorders flat array under parent', () => {
    let list = replayStructureOpsOnNodes(baseNodes(), [
      { type: 'add_node', node: { id: 'n1', parent_id: rootId, name: 'A', mx: 0, my: 0 } },
      { type: 'add_node', node: { id: 'n2', parent_id: rootId, name: 'B', mx: 0, my: 10 } },
      { type: 'add_node', node: { id: 'n3', parent_id: rootId, name: 'C', mx: 0, my: 20 } }
    ], projectId);
    list = replayStructureOpsOnNodes(
      list,
      [{ type: 'reorder_siblings', parent_id: rootId, ordered_ids: ['n3', 'n1', 'n2'] }],
      projectId
    );
    const childOrder = list.filter((n) => n.parent_id === rootId).map((n) => n.id);
    expect(childOrder).toEqual(['n3', 'n1', 'n2']);
  });
});
