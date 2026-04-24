import { browser } from '$app/environment';
import { isSupabaseCloudConfigured } from '$lib/supabase/env';
import { runBidirectionalCloudSync } from '$lib/supabase/workspacePush';

const INTERVAL_MS = 32000;

let intervalId: ReturnType<typeof setInterval> | null = null;

function onVisibility() {
  if (document.visibilityState === 'visible') void runBidirectionalCloudSync('visibility');
}

function onWindowFocus() {
  void runBidirectionalCloudSync('focus');
}

/** 로그인 후 주기적 양방향 동기화(업로드·내 워크스페이스 풀·공유 슬라이스 풀) */
export function startCloudBackgroundSync(): void {
  if (!browser || !isSupabaseCloudConfigured()) return;
  stopCloudBackgroundSync();
  void runBidirectionalCloudSync('start');
  intervalId = window.setInterval(() => void runBidirectionalCloudSync('interval'), INTERVAL_MS);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onWindowFocus);
}

export function stopCloudBackgroundSync(): void {
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('focus', onWindowFocus);
}
