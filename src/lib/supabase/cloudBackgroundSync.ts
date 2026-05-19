import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { isSupabaseCloudConfigured } from '$lib/supabase/env';
import { runBidirectionalCloudSync } from '$lib/supabase/workspacePush';
import {
  pollCollabRevisionFallback,
  subscribeCollabRevisionRealtime,
  unsubscribeCollabRevisionRealtime
} from '$lib/supabase/sync';
import { currentProject, type Project } from '$lib/stores/projects';
import { workspaceIsDirty } from '$lib/stores/workspaceDirty';
import { authUser } from '$lib/stores/authSession';

/** 기본 배경 양방향 동기 간격 (비공유·클린 등). */
const INTERVAL_MS_DEFAULT = 32000;
/**
 * 소유자 워크스페이스에 붙은 공유 프로젝트(`cloud_workspace_source_user_id` ≠ 내 uid)이면서
 * 클라우드 더티일 때 — P-8 ≤15s·플랜 §6.1 상한에 맞춘 보조 틱.
 */
const INTERVAL_MS_SHARED_WORKSPACE_DIRTY = 8000;
/** 공유 멤버 프로젝트 열림·클린 — 양방향 틱 보조(P-8 ≤15s) */
const INTERVAL_MS_SHARED_WORKSPACE_OPEN = 10000;
/** collab_meta revision 폴백 poll — Realtime 누락·일시 끊김 대비 (P-8 ≤15s) */
export const COLLAB_FALLBACK_POLL_MS = 4000;
/** 사용자 입력 없이 이 시간이 지난 뒤 주기 틱에서 동기 이유를 `idle-long`으로 표시(NOW-75). */
const LONG_IDLE_MS = 5 * 60 * 1000;

let intervalId: ReturnType<typeof setInterval> | null = null;
let collabFallbackPollId: ReturnType<typeof setInterval> | null = null;
let collabWatchProjectId: string | null = null;
let lastUserActivityMs = 0;
let storeUnsubs: Array<() => void> = [];

function touchActivity(): void {
  lastUserActivityMs = Date.now();
}

function nudgeCollabPullForCurrentProject(reason: string): void {
  const cur = get(currentProject);
  if (!cur?.id) return;
  void pollCollabRevisionFallback(cur).catch(() => {
    /* ignore */
  });
  if (import.meta.env.DEV) {
    console.info('[cloudBackgroundSync] collab pull nudge', reason, cur.id);
  }
}

function onVisibility() {
  if (document.visibilityState !== 'visible') return;
  nudgeCollabPullForCurrentProject('visibility');
  void runBidirectionalCloudSync('visibility');
}

function onWindowFocus() {
  nudgeCollabPullForCurrentProject('focus');
  void runBidirectionalCloudSync('focus');
}

function onIntervalTick(): void {
  const idleMs = Date.now() - lastUserActivityMs;
  const reason = idleMs >= LONG_IDLE_MS ? 'idle-long' : 'interval';
  void runBidirectionalCloudSync(reason);
}

/** 공유 멤버가 소유자 슬라이스에 반영 중이고 로컬이 더티할 때만 짧은 간격. */
function computeBackgroundIntervalMs(): number {
  const dirty = get(workspaceIsDirty);
  if (!dirty) return INTERVAL_MS_DEFAULT;
  const proj = get(currentProject);
  const uid = get(authUser)?.id ?? null;
  const src = proj?.cloud_workspace_source_user_id ?? null;
  const isSharedMemberWorkspace = !!src && !!uid && src !== uid;
  if (isSharedMemberWorkspace) {
    return dirty ? INTERVAL_MS_SHARED_WORKSPACE_DIRTY : INTERVAL_MS_SHARED_WORKSPACE_OPEN;
  }
  return INTERVAL_MS_DEFAULT;
}

function rearmCloudSyncInterval(): void {
  if (!browser) return;
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  const ms = computeBackgroundIntervalMs();
  intervalId = window.setInterval(onIntervalTick, ms);
}

function disarmCollabRevisionWatch(): void {
  unsubscribeCollabRevisionRealtime();
  if (collabFallbackPollId != null) {
    clearInterval(collabFallbackPollId);
    collabFallbackPollId = null;
  }
  collabWatchProjectId = null;
}

/** 현재 프로젝트 1건 — collab_meta Realtime + revision 폴백 poll */
function armCollabRevisionWatch(proj: Project): void {
  disarmCollabRevisionWatch();
  const uid = get(authUser)?.id;
  if (!uid || !proj.id?.trim()) return;

  collabWatchProjectId = proj.id;
  subscribeCollabRevisionRealtime(proj);
  nudgeCollabPullForCurrentProject('collab-arm');

  collabFallbackPollId = window.setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    const cur = get(currentProject);
    if (!cur || cur.id !== collabWatchProjectId) return;
    void pollCollabRevisionFallback(cur);
  }, COLLAB_FALLBACK_POLL_MS);
}

function syncCollabRevisionWatchForProject(proj: Project | null): void {
  if (!browser || !isSupabaseCloudConfigured()) return;
  const uid = get(authUser)?.id;
  if (!uid || !proj?.id) {
    disarmCollabRevisionWatch();
    return;
  }
  if (collabWatchProjectId === proj.id && collabFallbackPollId != null) return;
  armCollabRevisionWatch(proj);
}

function detachStoreDrivenIntervalResync(): void {
  for (const u of storeUnsubs) u();
  storeUnsubs = [];
}

function attachStoreDrivenIntervalResync(): void {
  detachStoreDrivenIntervalResync();
  const onStoreChange = () => {
    if (intervalId == null) return;
    rearmCloudSyncInterval();
  };
  storeUnsubs.push(
    currentProject.subscribe((proj) => {
      onStoreChange();
      syncCollabRevisionWatchForProject(proj);
    })
  );
  storeUnsubs.push(workspaceIsDirty.subscribe(onStoreChange));
  storeUnsubs.push(authUser.subscribe(onStoreChange));
}

let idleListenersAttached = false;

function attachIdleActivityListeners(): void {
  if (!browser || idleListenersAttached) return;
  idleListenersAttached = true;
  const opts: AddEventListenerOptions = { passive: true };
  window.addEventListener('pointerdown', touchActivity, opts);
  window.addEventListener('keydown', touchActivity, opts);
  window.addEventListener('wheel', touchActivity, opts);
}

function detachIdleActivityListeners(): void {
  if (!browser || !idleListenersAttached) return;
  idleListenersAttached = false;
  window.removeEventListener('pointerdown', touchActivity);
  window.removeEventListener('keydown', touchActivity);
  window.removeEventListener('wheel', touchActivity);
}

/** 로그인 후 주기적 양방향 동기화(업로드·내 워크스페이스 풀·공유 슬라이스 풀) */
export function startCloudBackgroundSync(): void {
  if (!browser || !isSupabaseCloudConfigured()) return;
  stopCloudBackgroundSync();
  touchActivity();
  attachIdleActivityListeners();
  void runBidirectionalCloudSync('start');
  rearmCloudSyncInterval();
  attachStoreDrivenIntervalResync();
  syncCollabRevisionWatchForProject(get(currentProject));
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onWindowFocus);
}

export function stopCloudBackgroundSync(): void {
  detachStoreDrivenIntervalResync();
  disarmCollabRevisionWatch();
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  detachIdleActivityListeners();
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('focus', onWindowFocus);
}
