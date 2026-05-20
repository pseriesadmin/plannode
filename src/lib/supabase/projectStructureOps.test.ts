import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import {
  parseStructureOp,
  STRUCTURE_OPS_BROADCAST_EVENT,
  sendProjectStructureOp,
  resetStructureOpsStateForTest,
  getStructureOpsPendingCount
} from './projectStructureOps';

vi.mock('$lib/supabase/env', () => ({
  isSupabaseCloudConfigured: () => true
}));

describe('parseStructureOp', () => {
  it('parses add_node', () => {
    const op = parseStructureOp({
      v: 1,
      project_id: 'p1',
      client_id: 'c1',
      seq: 1,
      op: {
        type: 'add_node',
        node: {
          id: 'n1',
          parent_id: 'root',
          name: 'Feature',
          mx: 10,
          my: 20
        }
      }
    });
    expect(op?.op.type).toBe('add_node');
    if (op?.op.type === 'add_node') {
      expect(op.op.node.id).toBe('n1');
      expect(op.op.node.mx).toBe(10);
    }
  });

  it('parses delete_node and move_node', () => {
    const del = parseStructureOp({
      v: 1,
      project_id: 'p1',
      client_id: 'c1',
      seq: 2,
      op: { type: 'delete_node', node_id: 'n9' }
    });
    expect(del?.op).toEqual({ type: 'delete_node', node_id: 'n9' });

    const move = parseStructureOp({
      v: 1,
      project_id: 'p1',
      client_id: 'c1',
      seq: 3,
      op: {
        type: 'move_node',
        node_id: 'n1',
        parent_id: 'p2',
        mx: 1,
        my: 2,
        num: '1.2'
      }
    });
    expect(move?.op.type).toBe('move_node');
  });

  it('rejects invalid v, missing fields, and bad ordered_ids', () => {
    expect(parseStructureOp({ v: 2, project_id: 'p', client_id: 'c', seq: 0, op: {} })).toBeNull();
    expect(
      parseStructureOp({
        v: 1,
        project_id: '',
        client_id: 'c',
        seq: 0,
        op: { type: 'delete_node', node_id: 'x' }
      })
    ).toBeNull();
    expect(
      parseStructureOp({
        v: 1,
        project_id: 'p',
        client_id: 'c',
        seq: 0,
        op: { type: 'reorder_siblings', parent_id: 'p', ordered_ids: [] }
      })
    ).toBeNull();
  });

  it('unwraps broadcast envelope payload', () => {
    const op = parseStructureOp({
      payload: {
        v: 1,
        project_id: 'p1',
        client_id: 'c1',
        seq: 1,
        op: { type: 'delete_node', node_id: 'n1' }
      }
    });
    expect(op?.project_id).toBe('p1');
  });
});

describe('STRUCTURE_OPS_BROADCAST_EVENT', () => {
  it('matches spike event name', () => {
    expect(STRUCTURE_OPS_BROADCAST_EVENT).toBe('structure-op');
  });
});

describe('sendProjectStructureOp pending queue', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      setTimeout: (fn: () => void, ms?: number) => globalThis.setTimeout(fn, ms),
      clearTimeout: (id: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(id)
    });
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {}
    });
    resetStructureOpsStateForTest();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('queues add_node when channel is not SUBSCRIBED yet', () => {
    expect(getStructureOpsPendingCount()).toBe(0);
    const sent = sendProjectStructureOp('proj-a', {
      type: 'add_node',
      node: {
        id: 'n-new',
        parent_id: 'proj-a-r',
        name: 'Child',
        mx: 0,
        my: 0
      }
    });
    expect(sent).toBe(false);
    expect(getStructureOpsPendingCount()).toBe(1);
  });
});
