import { describe, expect, it } from 'vitest';
import type { Project } from '$lib/supabase/client';
import { normalizeBadgePool } from '$lib/ai/badgePoolConfig';
import { mergeProjectMetaForCloudSync } from '$lib/stores/projects';

const baseProject = (over: Partial<Project> = {}): Project => ({
  id: 'p1',
  name: 'Test',
  author: 'A',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('mergeProjectMetaForCloudSync badge_pool', () => {
  it('prefers owner remote badge_pool on shared member local even when local updated_at is newer', () => {
    const ownerPool = normalizeBadgePool({ dev: ['API', 'TDD'], ux: ['FORM'], prj: ['MVP'] });
    const local = baseProject({
      updated_at: '2026-05-20T12:00:00.000Z',
      cloud_workspace_source_user_id: 'owner-uid',
      badge_pool: undefined,
    });
    const remote = baseProject({
      updated_at: '2026-05-20T10:00:00.000Z',
      badge_pool: ownerPool,
      cloud_workspace_source_user_id: 'owner-uid',
    });
    const merged = mergeProjectMetaForCloudSync(local, remote);
    expect(merged.badge_pool).toEqual(ownerPool);
  });

  it('uses LWW badge_pool on own workspace (no cloud_workspace_source_user_id)', () => {
    const localPool = normalizeBadgePool({ dev: ['LOCAL'], ux: [], prj: [] });
    const remotePool = normalizeBadgePool({ dev: ['REMOTE'], ux: [], prj: [] });
    const local = baseProject({
      updated_at: '2026-05-20T12:00:00.000Z',
      badge_pool: localPool,
    });
    const remote = baseProject({
      updated_at: '2026-05-20T10:00:00.000Z',
      badge_pool: remotePool,
    });
    const merged = mergeProjectMetaForCloudSync(local, remote);
    expect(merged.badge_pool).toEqual(localPool);
  });

  it('keeps local badge_pool on shared slice when remote has no badge_pool', () => {
    const localPool = normalizeBadgePool({ dev: ['API'], ux: ['LIST'], prj: [] });
    const local = baseProject({
      cloud_workspace_source_user_id: 'owner-uid',
      badge_pool: localPool,
    });
    const remote = baseProject({ badge_pool: undefined });
    const merged = mergeProjectMetaForCloudSync(local, remote);
    expect(merged.badge_pool).toEqual(localPool);
  });
});
