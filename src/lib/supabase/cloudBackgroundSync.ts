import { browser } from '$app/environment';
import { isSupabaseCloudConfigured } from '$lib/supabase/env';
import { runBidirectionalCloudSync } from '$lib/supabase/workspacePush';

const INTERVAL_MS = 32000;
/** 사용자 입력 없이 이 시간이 지난 뒤 주기 틱에서 동기 이유를 `idle-long`으로 표시(NOW-75). */
const LONG_IDLE_MS = 5 * 60 * 1000;

let intervalId: ReturnType<typeof setInterval> | null = null;
let lastUserActivityMs = 0;

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
  intervalId = window.setInterval(onIntervalTick, INTERVAL_MS);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onWindowFocus);
}

export function stopCloudBackgroundSync(): void {
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  detachIdleActivityListeners();
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('focus', onWindowFocus);
}
