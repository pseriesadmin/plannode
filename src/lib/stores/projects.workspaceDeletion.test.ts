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
  releaseDeletedProjectTombstonesAfterUpload,
  getDeletedProjectTombstoneIds,
  deleteProject
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

  it('releaseDeletedProjectTombstonesAfterUpload clears only excluded ids', () => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(
      'plannode_workspace_deleted_project_tombstones_v1',
      JSON.stringify({ a: Date.now(), b: Date.now() })
    );
    releaseDeletedProjectTombstonesAfterUpload(new Set(['a']));
    const left = getDeletedProjectTombstoneIds();
    expect(left.has('a')).toBe(false);
    expect(left.has('b')).toBe(true);
  });

  it('deleteProject registers tombstone in workspaceDeletedProjectSkipIds', () => {
    if (typeof window === 'undefined') return;
    projects.set([P('x', 'X')]);
    deleteProject('x');
    expect(workspaceDeletedProjectSkipIds().has('x')).toBe(true);
  });
});
