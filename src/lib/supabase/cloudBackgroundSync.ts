import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { isSupabaseCloudConfigured } from '$lib/supabase/env';
import { runBidirectionalCloudSync } from '$lib/supabase/workspacePush';
import { currentProject } from '$lib/stores/projects';
import { workspaceIsDirty } from '$lib/stores/workspaceDirty';
import { authUser } from '$lib/stores/authSession';

/** 기본 배경 양방향 동기 간격 (비공유·클린 등). */
const INTERVAL_MS_DEFAULT = 32000;
/**
 * 소유자 워크스페이스에 붙은 공유 프로젝트(`cloud_workspace_source_user_id` ≠ 내 uid)이면서
 * 클라우드 더티일 때 — P-8 ≤15s·플랜 §6.1 상한에 맞춘 보조 틱.
 */
const INTERVAL_MS_SHARED_WORKSPACE_DIRTY = 12000;
/** 사용자 입력 없이 이 시간이 지난 뒤 주기 틱에서 동기 이유를 `idle-long`으로 표시(NOW-75). */
const LONG_IDLE_MS = 5 * 60 * 1000;

let intervalId: ReturnType<typeof setInterval> | null = null;
let lastUserActivityMs = 0;
let storeUnsubs: Array<() => void> = [];

function touchActivity(): void {
  lastUserActivityMs = Date.now();
}

function onVisibility() {
  if (document.visibilityState === 'visible') void runBidirectionalCloudSync('visibility');
}

function onWindowFocus() {
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
  if (isSharedMemberWorkspace) return INTERVAL_MS_SHARED_WORKSPACE_DIRTY;
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
  storeUnsubs.push(currentProject.subscribe(onStoreChange));
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
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onWindowFocus);
}

export function stopCloudBackgroundSync(): void {
  detachStoreDrivenIntervalResync();
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  detachIdleActivityListeners();
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('focus', onWindowFocus);
}
