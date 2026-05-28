import { get, writable } from 'svelte/store';
import { browser } from '$app/environment';
import { isSupabaseCloudConfigured } from '$lib/supabase/env';

/** 클라우드 워크스페이스 upsert 기준 UI 배지 */
export type CloudSyncBadgeState = 'synced' | 'pending' | 'syncing' | 'failed';

export const cloudSyncBadge = writable<CloudSyncBadgeState>('synced');
export const workspaceIsDirty = writable(false);

/** COLLAB-PERF-2 E3 — 공유 멤버 structure CRUD만 pending (full bundle dirty 아님) */
const collabStructureOpsPending = new Map<string, true>();

export function markCloudWorkspaceDirty(): void {
  if (!browser || !isSupabaseCloudConfigured()) return;
  workspaceIsDirty.set(true);
  cloudSyncBadge.set('pending');
}

export function markCollabStructureOpsPending(projectId: string): void {
  if (!browser || !isSupabaseCloudConfigured()) return;
  const pid = projectId.trim();
  if (!pid) return;
  collabStructureOpsPending.set(pid, true);
  cloudSyncBadge.set('pending');
}

export function clearCollabStructureOpsPending(projectId: string): void {
  collabStructureOpsPending.delete(projectId.trim());
  if (collabStructureOpsPending.size === 0 && !get(workspaceIsDirty)) {
    cloudSyncBadge.set('synced');
  }
}

export function getCollabStructureOpsPendingProjectIds(): string[] {
  return [...collabStructureOpsPending.keys()];
}

export function hasCollabStructureOpsPending(projectId?: string): boolean {
  if (projectId) return collabStructureOpsPending.has(projectId.trim());
  return collabStructureOpsPending.size > 0;
}

export function hasAnyCloudSyncPending(): boolean {
  return get(workspaceIsDirty) || hasCollabStructureOpsPending();
}

export function markCloudWorkspaceSynced(): void {
  if (!browser || !isSupabaseCloudConfigured()) return;
  workspaceIsDirty.set(false);
  collabStructureOpsPending.clear();
  cloudSyncBadge.set('synced');
}

export function markCloudWorkspaceSyncing(): void {
  if (!browser || !isSupabaseCloudConfigured()) return;
  cloudSyncBadge.set('syncing');
}

export function markCloudWorkspaceFailed(): void {
  if (!browser || !isSupabaseCloudConfigured()) return;
  cloudSyncBadge.set('failed');
}
