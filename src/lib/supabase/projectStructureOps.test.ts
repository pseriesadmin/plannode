import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import {
  parseStructureOp,
  STRUCTURE_OPS_BROADCAST_EVENT,
  sendProjectStructureOp,
  resetStructureOpsStateForTest,
  getStructureOpsPendingCount,
  collabPullCanSkipSliceMergeAfterOpsPull,
  setOpLogComplete,
  setStructureOpsPersistAckSeq
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

  it('parses add_node layout_auto without mx/my', () => {
    const op = parseStructureOp({
      v: 1,
      project_id: 'p1',
      client_id: 'c1',
      seq: 1,
      op: {
        type: 'add_node',
        node: {
          id: 'n2',
          parent_id: 'root',
          name: 'New',
          layout_auto: true
        }
      }
    });
    expect(op?.op.type).toBe('add_node');
    if (op?.op.type === 'add_node') {
      expect(op.op.node.layout_auto).toBe(true);
      expect(op.op.node.mx).toBeUndefined();
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
    expect(move?.op).toEqual({
      type: 'move_node',
      node_id: 'n1',
      parent_id: 'p2',
      mx: 1,
      my: 2
    });
  });

  it('DERIVE-NODE-NUM: legacy move_node wire num is stripped at parse', () => {
    const move = parseStructureOp({
      v: 1,
      project_id: 'p1',
      client_id: 'c1',
      seq: 4,
      op: {
        type: 'move_node',
        node_id: 'n2',
        parent_id: 'root',
        mx: 10,
        my: 20,
        num: 'STALE.99'
      }
    });
    expect(move?.op.type).toBe('move_node');
    if (move?.op.type === 'move_node') {
      expect('num' in move.op).toBe(false);
    }
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

describe('collabPullCanSkipSliceMergeAfterOpsPull — BADGE-SYNC-FIX', () => {
  const PID = 'proj-badge-test';
  const UID = 'user-a';

  // localStorage stub (node 환경에서 window/localStorage 없음)
  let store: Record<string, string> = {};
  beforeEach(() => {
    store = {};
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => { store[k] = v; },
        removeItem: (k: string) => { delete store[k]; }
      }
    });
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; }
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('opLogComplete=true + ack<=lastApplied + revisionUnchanged → skip(true)', () => {
    setOpLogComplete(PID, true);
    setStructureOpsPersistAckSeq(PID, 5);
    const result = collabPullCanSkipSliceMergeAfterOpsPull(
      PID, UID,
      { ok: true, applied: 0, lastAppliedSeq: 5 },
      { revisionUnchanged: true }
    );
    expect(result).toBe(true);
  });

  it('BADGE-SYNC-FIX: opLogComplete=true + ack<=lastApplied + revision↑ + applied=0 → slice 필요(false)', () => {
    // 배지 변경: ops 없이 revision만 올라간 경우 — slice merge 생략하면 배지 누락
    setOpLogComplete(PID, true);
    setStructureOpsPersistAckSeq(PID, 5);
    const result = collabPullCanSkipSliceMergeAfterOpsPull(
      PID, UID,
      { ok: true, applied: 0, lastAppliedSeq: 5 },
      { revisionUnchanged: false }
    );
    expect(result).toBe(false);
  });

  it('BADGE-SYNC-FIX: opLogComplete=true + ack<=lastApplied + revision↑ + applied>0 → ops 반영됨(true)', () => {
    // 구조 op가 반영됐으면 배지 외 변경 없음 — skip 허용
    setOpLogComplete(PID, true);
    setStructureOpsPersistAckSeq(PID, 5);
    const result = collabPullCanSkipSliceMergeAfterOpsPull(
      PID, UID,
      { ok: true, applied: 2, lastAppliedSeq: 7 },
      { revisionUnchanged: false }
    );
    expect(result).toBe(true);
  });

  it('opLogComplete=false + revisionUnchanged=true → skip(true)', () => {
    setOpLogComplete(PID, false);
    const result = collabPullCanSkipSliceMergeAfterOpsPull(
      PID, UID,
      { ok: true, applied: 0 },
      { revisionUnchanged: true }
    );
    expect(result).toBe(true);
  });

  it('opLogComplete=false + revisionUnchanged=false + applied=0 → slice 필요(false)', () => {
    setOpLogComplete(PID, false);
    const result = collabPullCanSkipSliceMergeAfterOpsPull(
      PID, UID,
      { ok: true, applied: 0 },
      { revisionUnchanged: false }
    );
    expect(result).toBe(false);
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
