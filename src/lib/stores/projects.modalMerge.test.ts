import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mergeModalListCloudCanon,
  registerPendingWorkspaceDeletion,
  pruneOwnedProjectGhostHideAgainstCloudCanon,
  registerOwnedProjectGhostHideForModal
} from './projects';
import type { Project } from '$lib/supabase/client';

function P(id: string, name: string, updated: string): Project {
  const now = new Date().toISOString();
  return {
    id,
    name,
    description: '',
    author: '',
    start_date: '',
    end_date: '',
    created_at: now,
    updated_at: updated
  };
}

describe('mergeModalListCloudCanon', () => {
  beforeEach(() => {
    // 테스트마다 pending·고스트-hide·톰브스톤 초기화
    if (typeof window !== 'undefined') {
      localStorage.removeItem('plannode_workspace_pending_delete_ids_v1');
      localStorage.removeItem('plannode_workspace_modal_owned_ghost_hide_v1');
      localStorage.removeItem('plannode_workspace_deleted_project_tombstones_v1');
    }
  });

  afterEach(() => {
    // 테스트 후 정리
    if (typeof window !== 'undefined') {
      localStorage.removeItem('plannode_workspace_pending_delete_ids_v1');
      localStorage.removeItem('plannode_workspace_modal_owned_ghost_hide_v1');
      localStorage.removeItem('plannode_workspace_deleted_project_tombstones_v1');
    }
  });

  it('orders by cloud snapshot first and appends local-only ids', () => {
    const cloud = [P('a', 'A', '2026-01-01T00:00:00.000Z'), P('b', 'B', '2026-01-02T00:00:00.000Z')];
    const local = [
      P('b', 'B-local', '2026-01-03T00:00:00.000Z'),
      P('c', 'C-only', '2026-01-01T12:00:00.000Z')
    ];
    const m = mergeModalListCloudCanon(cloud, local);
    expect(m.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(m[1].name).toBe('B-local');
    expect(m[2].name).toBe('C-only');
  });

  it('prefers cloud meta when local updated_at is older', () => {
    const cloud = [P('x', 'CloudName', '2026-06-01T00:00:00.000Z')];
    const local = [P('x', 'OldLocal', '2026-01-01T00:00:00.000Z')];
    const m = mergeModalListCloudCanon(cloud, local);
    expect(m).toHaveLength(1);
    expect(m[0].name).toBe('CloudName');
  });

  it('excludes pending deletion ids from both cloud and local lists', () => {
    const cloud = [
      P('a', 'Keep', '2026-01-01T00:00:00.000Z'),
      P('del-this', 'ToDelete', '2026-01-02T00:00:00.000Z')
    ];
    const local = [
      P('local-del', 'LocalDelete', '2026-01-01T00:00:00.000Z'),
      P('c', 'LocalKeep', '2026-01-01T12:00:00.000Z')
    ];

    if (typeof window !== 'undefined') {
      registerPendingWorkspaceDeletion('del-this');
      registerPendingWorkspaceDeletion('local-del');
      expect(mergeModalListCloudCanon(cloud, local).map((x) => x.id)).toEqual(['a', 'c']);
    } else {
      expect(mergeModalListCloudCanon(cloud, local).map((x) => x.id)).toEqual(['a', 'del-this', 'local-del', 'c']);
    }
  });

  it('excludes tombstoned ids from cloud and local-only append (browser LS)', () => {
    if (typeof window === 'undefined') return;
    const ts = Date.now();
    localStorage.setItem('plannode_workspace_deleted_project_tombstones_v1', JSON.stringify({ tomb1: ts }));
    const cloud = [
      P('a', 'A', '2026-01-01T00:00:00.000Z'),
      P('tomb1', 'Ghost', '2026-01-02T00:00:00.000Z')
    ];
    const local = [P('tomb1', 'LocalOnly', '2026-01-03T00:00:00.000Z'), P('c', 'C', '2026-01-04T00:00:00.000Z')];
    expect(mergeModalListCloudCanon(cloud, local).map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('hides ghost ids when viewerUid is set and ghost-hide marker is registered (browser LS)', () => {
    const uid = 'u-test-ghost';
    if (typeof window === 'undefined') return;
    registerOwnedProjectGhostHideForModal(uid, 'gone');
    let cloud = [
      P('a', 'A', '2026-01-01T00:00:00.000Z'),
      P('gone', 'Ghost', '2026-01-02T00:00:00.000Z')
    ];
    const local: typeof cloud = [];
    expect(mergeModalListCloudCanon(cloud, local, uid).map((x) => x.id)).toEqual(['a']);
    // 서버 목록에 아직 고스트가 있음 → 마커 유지 → 계속 숨김
    pruneOwnedProjectGhostHideAgainstCloudCanon(uid, new Set(['a', 'gone']));
    expect(mergeModalListCloudCanon(cloud, local, uid).map((x) => x.id)).toEqual(['a']);
    // 정본에서 id 제거 확인됨 → 마커 prune → 새 fetch 시 고스트 행 없음 전제로 동일 결과
    pruneOwnedProjectGhostHideAgainstCloudCanon(uid, new Set(['a']));
    cloud = [P('a', 'A', '2026-01-01T00:00:00.000Z')];
    expect(mergeModalListCloudCanon(cloud, local, uid).map((x) => x.id)).toEqual(['a']);
  });
});

/**
 * 정책 7·8 (프로젝트 삭제) 테스트
 * - registerPendingWorkspaceDeletion / getPendingWorkspaceDeletionIds는 localStorage 기반이므로 SSR 테스트에 부적합
 * - GATE C 수동 검증으로 진행:
 *   1. 소유자 삭제 → 목록 부활 0회 확인
 *   2. 공유자: 경고 모달·저장 차단·로컬 purge
 *   3. Presence 피어 메타 병합 유지
 */
