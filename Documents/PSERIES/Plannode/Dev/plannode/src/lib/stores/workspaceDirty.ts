import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { isSupabaseCloudConfigured } from '$lib/supabase/env';

/** 클라우드 워크스페이스 upsert 기준 UI 배지 */
export type CloudSyncBadgeState = 'synced' | 'pending' | 'syncing' | 'failed';

export const cloudSyncBadge = writable<CloudSyncBadgeState>('synced');
export const workspaceIsDirty = writable(false);

export function markCloudWorkspaceDirty(): void {
  if (!browser || !isSupabaseCloudConfigured()) return;
  workspaceIsDirty.set(true);
  cloudSyncBadge.set('pending');
}

export function markCloudWorkspaceSynced(): void {
  if (!browser || !isSupabaseCloudConfigured()) return;
  workspaceIsDirty.set(false);
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
