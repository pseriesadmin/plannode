import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import type { Project } from '$lib/supabase/client';
import {
  projects,
  gatherWorkspaceBundle,
  mergeWorkspaceBundleFromCloudRemote,
  stripResurrectedDeletedProjectsFromLocal,
  workspaceDeletedProjectSkipIds,
  pruneDeletedProjectTombstonesAgainstCloudProjectIds,
  releaseDeletedProjectMarkersAbsentFromRemoteBundle,
  getDeletedProjectTombstoneIds,
  reconcileDeletedProjectMarkersAgainstServerGhosts,
  deleteProject,
  applyServerProjectDeletionsFromCloud,
  registerServerDeletedProjectId,
  readServerDeletedProjectIdSet,
  clearServerDeletedProjectIdForReimport
} from './projects';

function P(id: string, name: string): Project {
  const now = new Date().toISOString();
  return {
    id,
    name,
    description: '',
    author: '',
    start_date: '',
    end_date: '',
    created_at: now,
    updated_at: now
  };
}

describe('workspace deletion guard (NOW-P0-DEL-WS-06)', () => {
  beforeEach(() => {
    if (typeof window === 'undefined') return;
    localStorage.clear();
    projects.set([]);
  });

  afterEach(() => {
    if (typeof window === 'undefined') return;
    localStorage.clear();
    projects.set([]);
  });

  it('gatherWorkspaceBundle excludes tombstoned project ids', () => {
    if (typeof window === 'undefined') return;
    projects.set([P('keep', 'Keep'), P('gone', 'Gone')]);
    localStorage.setItem(
      'plannode_workspace_deleted_project_tombstones_v1',
      JSON.stringify({ gone: Date.now() })
    );
    const bundle = gatherWorkspaceBundle();
    expect(bundle.projects.map((p) => p.id)).toEqual(['keep']);
    expect(bundle.nodesByProject.gone).toBeUndefined();
  });

  it('mergeWorkspaceBundleFromCloudRemote skips tombstoned remote projects', () => {
    if (typeof window === 'undefined') return;
    projects.set([P('local', 'Local')]);
    localStorage.setItem(
      'plannode_workspace_deleted_project_tombstones_v1',
      JSON.stringify({ ghost: Date.now() })
    );
    mergeWorkspaceBundleFromCloudRemote({
      projects: [P('ghost', 'Ghost'), P('local', 'Local Remote')],
      nodesByProject: { ghost: [], local: [] }
    });
    expect(get(projects).map((p) => p.id)).toEqual(['local']);
  });

  it('stripResurrectedDeletedProjectsFromLocal removes resurrected rows', () => {
    if (typeof window === 'undefined') return;
    projects.set([P('alive', 'Alive'), P('ghost', 'Ghost')]);
    localStorage.setItem('plannode_projects_v3', JSON.stringify(get(projects)));
    localStorage.setItem(
      'plannode_workspace_deleted_project_tombstones_v1',
      JSON.stringify({ ghost: Date.now() })
    );
    const n = stripResurrectedDeletedProjectsFromLocal();
    expect(n).toBe(1);
    expect(get(projects).map((p) => p.id)).toEqual(['alive']);
  });

  it('pruneDeletedProjectTombstonesAgainstCloudProjectIds does not clear tombstone when id absent from cloud', () => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(
      'plannode_workspace_deleted_project_tombstones_v1',
      JSON.stringify({ deleted: Date.now() })
    );
    pruneDeletedProjectTombstonesAgainstCloudProjectIds(new Set());
    expect(getDeletedProjectTombstoneIds().has('deleted')).toBe(true);
  });

  it('releaseDeletedProjectMarkersAbsentFromRemoteBundle clears tombstone when id absent from remote bundle', () => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(
      'plannode_workspace_deleted_project_tombstones_v1',
      JSON.stringify({ gone: Date.now(), keep: Date.now() })
    );
    releaseDeletedProjectMarkersAbsentFromRemoteBundle({
      projects: [P('keep', 'Keep')],
      nodesByProject: { keep: [] }
    });
    const left = getDeletedProjectTombstoneIds();
    expect(left.has('gone')).toBe(false);
    expect(left.has('keep')).toBe(true);
  });

  it('reconcileDeletedProjectMarkersAgainstServerGhosts registers tombstone for server-only ghost', () => {
    if (typeof window === 'undefined') return;
    projects.set([P('alive', 'Alive')]);
    reconcileDeletedProjectMarkersAgainstServerGhosts(
      [P('ghost', 'Ghost Remote'), P('alive', 'Alive Remote')],
      [P('alive', 'Alive')]
    );
    expect(getDeletedProjectTombstoneIds().has('ghost')).toBe(true);
    expect(get(projects).map((p) => p.id)).toEqual(['alive']);
  });

  it('deleteProject registers tombstone in workspaceDeletedProjectSkipIds', () => {
    if (typeof window === 'undefined') return;
    projects.set([P('x', 'X')]);
    deleteProject('x');
    expect(workspaceDeletedProjectSkipIds().has('x')).toBe(true);
  });

  it('mergeWorkspaceBundleFromCloudRemote with empty remote bundle clears all tombstones', () => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(
      'plannode_workspace_deleted_project_tombstones_v1',
      JSON.stringify({ gone: Date.now() })
    );
    mergeWorkspaceBundleFromCloudRemote({ projects: [], nodesByProject: {} });
    expect(getDeletedProjectTombstoneIds().has('gone')).toBe(false);
  });
});

describe('workspace deletion Phase C (server deletion canon)', () => {
  beforeEach(() => {
    if (typeof window === 'undefined') return;
    localStorage.clear();
    projects.set([]);
  });

  afterEach(() => {
    if (typeof window === 'undefined') return;
    localStorage.clear();
    projects.set([]);
  });

  it('workspaceDeletedProjectSkipIds includes server-deleted ids', () => {
    if (typeof window === 'undefined') return;
    registerServerDeletedProjectId('srv-gone', '2026-06-13T00:00:00.000Z');
    expect(workspaceDeletedProjectSkipIds().has('srv-gone')).toBe(true);
    expect(readServerDeletedProjectIdSet().has('srv-gone')).toBe(true);
  });

  it('applyServerProjectDeletionsFromCloud strips resurrected projects and keeps tombstone until JSON absent', () => {
    if (typeof window === 'undefined') return;
    projects.set([P('alive', 'Alive'), P('gone', 'Gone')]);
    localStorage.setItem(
      'plannode_workspace_deleted_project_tombstones_v1',
      JSON.stringify({ gone: Date.now() })
    );
    const n = applyServerProjectDeletionsFromCloud([
      { project_id: 'gone', deleted_at: '2026-06-13T12:00:00.000Z', deletion_kind: 'owner_remove' }
    ]);
    expect(n).toBe(1);
    expect(get(projects).map((p) => p.id)).toEqual(['alive']);
    expect(getDeletedProjectTombstoneIds().has('gone')).toBe(true);
    expect(readServerDeletedProjectIdSet().has('gone')).toBe(true);
  });

  it('registerServerDeletedProjectId keeps tombstone while stale projects_json may exist', () => {
    if (typeof window === 'undefined') return;
    registerServerDeletedProjectId('gone', '2026-06-13T00:00:00.000Z');
    expect(readServerDeletedProjectIdSet().has('gone')).toBe(true);
    expect(getDeletedProjectTombstoneIds().has('gone')).toBe(true);
    expect(workspaceDeletedProjectSkipIds().has('gone')).toBe(true);
  });

  it('mergeWorkspaceBundleFromCloudRemote skips stale remote ghost when server-deleted', () => {
    if (typeof window === 'undefined') return;
    projects.set([P('local', 'Local')]);
    registerServerDeletedProjectId('ghost', '2026-06-13T00:00:00.000Z');
    mergeWorkspaceBundleFromCloudRemote({
      projects: [P('ghost', 'Ghost Remote'), P('local', 'Local Remote')],
      nodesByProject: { ghost: [], local: [] }
    });
    expect(get(projects).map((p) => p.id)).toEqual(['local']);
  });

  it('gatherWorkspaceBundle excludes server-deleted project ids', () => {
    if (typeof window === 'undefined') return;
    projects.set([P('keep', 'Keep'), P('gone', 'Gone')]);
    registerServerDeletedProjectId('gone', '2026-06-13T00:00:00.000Z');
    const bundle = gatherWorkspaceBundle();
    expect(bundle.projects.map((p) => p.id)).toEqual(['keep']);
    expect(bundle.nodesByProject.gone).toBeUndefined();
  });

  it('clearServerDeletedProjectIdForReimport allows id back into skip set only after reimport clear', () => {
    if (typeof window === 'undefined') return;
    registerServerDeletedProjectId('re', '2026-06-13T00:00:00.000Z');
    expect(workspaceDeletedProjectSkipIds().has('re')).toBe(true);
    clearServerDeletedProjectIdForReimport('re');
    expect(readServerDeletedProjectIdSet().has('re')).toBe(false);
    expect(workspaceDeletedProjectSkipIds().has('re')).toBe(false);
  });
});
