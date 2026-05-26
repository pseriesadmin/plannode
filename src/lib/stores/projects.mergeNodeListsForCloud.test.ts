import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mergeNodeListsForCloud,
  mergeNodeListsForCloudByProjectMeta,
  registerRecentlyDeletedNodeIdsForCloudMerge,
  registerRecentlyAddedNodeIdsForCloudMerge,
  unionCollabPreserveLocalNodes,
  mergeNodesForCollabPush
} from './projects';
import type { Node } from '$lib/supabase/client';

const PID = 'proj_merge_cloud_test';

function N(
  id: string,
  updated: string,
  extra?: Partial<Pick<Node, 'parent_id' | 'depth' | 'name'>>
): Node {
  return {
    id,
    project_id: PID,
    name: extra?.name ?? id,
    depth: extra?.depth ?? 0,
    parent_id: extra?.parent_id,
    created_at: updated,
    updated_at: updated
  };
}

describe('mergeNodeListsForCloud', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('plannode_cloud_merge_suppressed_deletes_v1');
    }
  });

  afterEach(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('plannode_cloud_merge_suppressed_deletes_v1');
    }
  });

  it('remoteProjectMetaNewer=true drops local-only ids not in remote', () => {
    const local = [N('a', '2026-01-02T00:00:00.000Z'), N('local_only', '2026-01-03T00:00:00.000Z')];
    const remote = [N('a', '2026-01-01T00:00:00.000Z')];
    const out = mergeNodeListsForCloud(local, remote, true, null);
    expect(out.map((x) => x.id)).toEqual(['a']);
    expect(out[0].updated_at).toBe('2026-01-02T00:00:00.000Z');
  });

  it('remoteProjectMetaNewer=true + preserveLocalNewIds keeps listed local-only ids after remote order', () => {
    const local = [
      N('a', '2026-01-02T00:00:00.000Z'),
      N('keep_me', '2026-01-03T00:00:00.000Z'),
      N('drop_me', '2026-01-04T00:00:00.000Z')
    ];
    const remote = [N('a', '2026-01-01T00:00:00.000Z')];
    const preserve = new Set(['keep_me']);
    const out = mergeNodeListsForCloud(local, remote, true, null, preserve);
    expect(out.map((x) => x.id)).toEqual(['a', 'keep_me']);
    expect(out[1].name).toBe('keep_me');
  });

  it('remoteProjectMetaNewer=true + empty preserveLocalNewIds matches omitting the argument', () => {
    const local = [N('a', '2026-01-02T00:00:00.000Z'), N('local_only', '2026-01-03T00:00:00.000Z')];
    const remote = [N('a', '2026-01-01T00:00:00.000Z')];
    const withEmpty = mergeNodeListsForCloud(local, remote, true, null, new Set());
    const omitted = mergeNodeListsForCloud(local, remote, true, null);
    expect(withEmpty.map((x) => x.id)).toEqual(omitted.map((x) => x.id));
    expect(withEmpty.map((x) => x.id)).toEqual(['a']);
  });

  it('remoteProjectMetaNewer=false ignores preserveLocalNewIds (5th arg no-op)', () => {
    const local = [N('a', '2026-01-02T00:00:00.000Z'), N('tail', '2026-01-03T00:00:00.000Z')];
    const remote = [N('a', '2026-01-01T00:00:00.000Z')];
    const preserve = new Set(['tail']);
    const withPreserve = mergeNodeListsForCloud(local, remote, false, null, preserve);
    const without = mergeNodeListsForCloud(local, remote, false, null);
    expect(withPreserve.map((x) => x.id)).toEqual(without.map((x) => x.id));
  });

  it('remoteProjectMetaNewer=false keeps local-only at tail (unchanged contract)', () => {
    const local = [N('b', '2026-01-02T00:00:00.000Z'), N('only_local', '2026-01-01T00:00:00.000Z')];
    const remote = [N('a', '2026-01-01T00:00:00.000Z'), N('b', '2026-01-01T00:00:00.000Z')];
    const out = mergeNodeListsForCloud(local, remote, false, null);
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'only_local']);
  });

  /** 공유 슬라이스·번들 노드 병합과 동일 분기: `remoteProjectMetaNewer === false` — 엄격 `>` LWW만 흡수 (`projects.ts` 주석). */
  it('remoteProjectMetaNewer=false: keeps local row when remote updated_at is older or equal', () => {
    const tNew = '2026-01-03T00:00:00.000Z';
    const tOld = '2026-01-02T00:00:00.000Z';
    const local = [N('shared', tNew, { name: 'local_wins' })];
    const remote = [N('shared', tOld, { name: 'remote_loses' })];
    const out = mergeNodeListsForCloud(local, remote, false, null);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('local_wins');
  });

  it('remoteProjectMetaNewer=false: overwrites with remote when remote updated_at is strictly newer', () => {
    const tOld = '2026-01-01T00:00:00.000Z';
    const tNew = '2026-01-02T00:00:00.000Z';
    const local = [N('shared', tOld, { name: 'local' })];
    const remote = [N('shared', tNew, { name: 'remote_newer' })];
    const out = mergeNodeListsForCloud(local, remote, false, null);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('remote_newer');
  });

  it('remoteProjectMetaNewer=true: tie on updated_at prefers remote row', () => {
    const t = '2026-01-01T00:00:00.000Z';
    const local = [N('x', t, { name: 'local' })];
    const remote = [N('x', t, { name: 'remote' })];
    const out = mergeNodeListsForCloud(local, remote, true, null);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('remote');
  });

  it('mergeNodeListsForCloudByProjectMeta: remote meta newer drops stale local id (owner delete on shared)', () => {
    const local = [N('keep', '2026-05-18T00:00:00.000Z'), N('owner_deleted', '2026-05-18T00:00:00.000Z')];
    const remote = [N('keep', '2026-05-18T00:00:00.000Z')];
    const out = mergeNodeListsForCloudByProjectMeta(
      local,
      remote,
      '2026-05-18T11:00:00.000Z',
      '2026-05-19T12:00:00.000Z',
      PID
    );
    expect(out.map((x) => x.id)).toEqual(['keep']);
  });

  it('mergeNodeListsForCloudByProjectMeta: remote meta newer preserves local-only id saved with local project touch (concurrent add)', () => {
    const lMeta = '2026-05-19T10:00:00.000Z';
    const rMeta = '2026-05-19T10:00:01.000Z';
    const local = [N('keep', '2026-05-18T00:00:00.000Z'), N('just_added', lMeta)];
    const remote = [N('keep', '2026-05-18T00:00:00.000Z')];
    const out = mergeNodeListsForCloudByProjectMeta(local, remote, lMeta, rMeta, PID);
    expect(out.map((x) => x.id)).toEqual(['keep', 'just_added']);
  });

  it('mergeNodeListsForCloudByProjectMeta: remote meta newer preserves local-only when node ts is before project meta (T1<T2 skew)', () => {
    const nodeTs = '2026-05-19T10:00:00.000Z';
    const lMeta = '2026-05-19T10:00:00.001Z';
    const rMeta = '2026-05-19T10:00:01.000Z';
    const local = [N('keep', '2026-05-18T00:00:00.000Z'), N('just_added', nodeTs)];
    const remote = [N('keep', '2026-05-18T00:00:00.000Z')];
    const out = mergeNodeListsForCloudByProjectMeta(local, remote, lMeta, rMeta, PID);
    expect(out.map((x) => x.id)).toEqual(['keep', 'just_added']);
  });

  it('mergeNodeListsForCloudByProjectMeta: registerRecentlyAdded preserves id even when timestamps would drop it', () => {
    if (typeof window === 'undefined') return;
    registerRecentlyAddedNodeIdsForCloudMerge(PID, ['just_added']);
    const local = [N('keep', '2026-05-18T00:00:00.000Z'), N('just_added', '2026-05-17T00:00:00.000Z')];
    const remote = [N('keep', '2026-05-18T00:00:00.000Z')];
    const out = mergeNodeListsForCloudByProjectMeta(
      local,
      remote,
      '2026-05-19T11:00:00.000Z',
      '2026-05-19T12:00:00.000Z',
      PID
    );
    expect(out.map((x) => x.id)).toEqual(['keep', 'just_added']);
  });

  it('mergeNodeListsForCloudByProjectMeta: remote meta newer preserves collab-only id newer than owner meta', () => {
    const local = [N('keep', '2026-05-18T00:00:00.000Z'), N('collab_new', '2026-05-19T13:00:00.000Z')];
    const remote = [N('keep', '2026-05-18T00:00:00.000Z')];
    const out = mergeNodeListsForCloudByProjectMeta(
      local,
      remote,
      '2026-05-19T11:00:00.000Z',
      '2026-05-19T12:00:00.000Z',
      PID
    );
    expect(out.map((x) => x.id)).toEqual(['keep', 'collab_new']);
  });

  it('mergeNodeListsForCloudByProjectMeta: local meta newer still drops owner-deleted stale local id', () => {
    const ownerMeta = '2026-05-19T12:00:00.000Z';
    const local = [
      N('keep', '2026-05-18T00:00:00.000Z'),
      N('owner_deleted', '2026-05-18T00:00:00.000Z')
    ];
    const remote = [N('keep', '2026-05-18T00:00:00.000Z')];
    const out = mergeNodeListsForCloudByProjectMeta(
      local,
      remote,
      '2026-05-19T14:00:00.000Z',
      ownerMeta,
      PID
    );
    expect(out.map((x) => x.id)).toEqual(['keep']);
  });

  it('mergeNodeListsForCloudByProjectMeta: local meta newer still absorbs strictly newer remote rows', () => {
    const local = [N('keep', '2026-05-18T00:00:00.000Z')];
    const remote = [N('keep', '2026-05-18T00:00:00.000Z'), N('from_owner', '2026-05-19T15:00:00.000Z')];
    const out = mergeNodeListsForCloudByProjectMeta(
      local,
      remote,
      '2026-05-19T14:00:00.000Z',
      '2026-05-19T12:00:00.000Z',
      PID
    );
    expect(out.map((x) => x.id)).toEqual(['keep', 'from_owner']);
  });

  it('mergeNodesForCollabPush keeps owner-only ids when local meta is newer (push path)', () => {
    const local = [N('keep', '2026-05-19T14:00:00.000Z'), N('mine', '2026-05-19T14:00:01.000Z')];
    const owner = [N('keep', '2026-05-19T12:00:00.000Z'), N('theirs_first', '2026-05-19T13:00:00.000Z')];
    const out = mergeNodesForCollabPush(local, owner, PID);
    expect(out.map((x) => x.id)).toEqual(expect.arrayContaining(['keep', 'mine', 'theirs_first']));
    expect(out).toHaveLength(3);
  });

  it('unionCollabPreserveLocalNodes re-appends recent-add ids dropped by merge', () => {
    if (typeof window === 'undefined') return;
    registerRecentlyAddedNodeIdsForCloudMerge(PID, ['just_added']);
    const pre = [N('keep', '2026-05-18T00:00:00.000Z'), N('just_added', '2026-05-19T10:00:00.000Z')];
    const merged = [N('keep', '2026-05-18T00:00:00.000Z')];
    const out = unionCollabPreserveLocalNodes(PID, pre, merged);
    expect(out.map((x) => x.id)).toEqual(['keep', 'just_added']);
  });

  it('suppressRecentDeletesProjectId skips re-adding suppressed remote id when missing locally', () => {
    if (typeof window === 'undefined') return;
    registerRecentlyDeletedNodeIdsForCloudMerge(PID, ['ghost']);
    const local: Node[] = [];
    const remote = [N('ghost', '2026-06-01T00:00:00.000Z')];
    const out = mergeNodeListsForCloud(local, remote, true, PID);
    expect(out.map((x) => x.id)).toEqual([]);
  });
});
