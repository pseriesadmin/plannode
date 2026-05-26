import { get } from 'svelte/store';
import { browser } from '$app/environment';
import {
  uploadWorkspaceToCloud,
  pullOwnWorkspaceIfChanged,
  pullSharedProjectSlicesIfNewer
} from '$lib/supabase/sync';
import { isSupabaseCloudConfigured } from '$lib/supabase/env';
import { workspaceIsDirty, markCloudWorkspaceSyncing, markCloudWorkspaceSynced } from '$lib/stores/workspaceDirty';
import { dedupeProjectsStoreByLatestUpdatedAt, currentProject } from '$lib/stores/projects';
import { authUser } from '$lib/stores/authSession';

const CLOUD_FLUSH_MS_DEFAULT = 500;
const CLOUD_FLUSH_MS_SHARED_COLLAB = 300;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let bidirectionalBusy = false;

/** `sync.ts` collab revision pull — `runBidirectionalCloudSync` 업로드와 직렬화 */
export function isCloudBidirectionalSyncBusy(): boolean {
  return bidirectionalBusy;
}

function bumpModalProjectListSync(reason: string): void {
  if (!browser) return;
  try {
    dedupeProjectsStoreByLatestUpdatedAt();
    window.dispatchEvent(new CustomEvent('plannode-modal-project-list-sync', { detail: { reason } }));
  } catch {
    /* ignore */
  }
}

/** 로컬 변경 후 클라우드 반영(더티일 때만). 수동 ☁↑와 동일한 upload 사용 */
export async function flushCloudWorkspaceNow(reason: string): Promise<boolean> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (!browser || !isSupabaseCloudConfigured()) return true;
  if (!get(workspaceIsDirty)) return true;
  markCloudWorkspaceSyncing();
  const r = await uploadWorkspaceToCloud();
  if (r.ok) {
    bumpModalProjectListSync(reason);
    return true;
  }
  if (import.meta.env.DEV) console.warn('[cloud auto]', reason, r.message);
  return false;
}

/** 짧은 디바운스(탭 전환·연속 출력 등). 공유 멤버 프로젝트는 300ms(T0-4). */
export function scheduleCloudFlush(reason: string, delayMs?: number): void {
  if (!browser || !isSupabaseCloudConfigured()) return;
  if (!get(workspaceIsDirty)) return;
  let ms = delayMs ?? CLOUD_FLUSH_MS_DEFAULT;
  if (delayMs === undefined) {
    const proj = get(currentProject);
    const uid = get(authUser)?.id ?? null;
    const src = proj?.cloud_workspace_source_user_id ?? null;
    if (src && uid && src !== uid) {
      ms = CLOUD_FLUSH_MS_SHARED_COLLAB;
    }
  }
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    void flushCloudWorkspaceNow(reason);
  }, ms);
}

/**
 * 자동 동기화: (1) 로컬 더티면 업로드 + 공유 프로젝트는 소유자 행에 merge RPC
 * (2) 내 워크스페이스·공유 슬라이스를 서버 기준으로 LWW 풀
 *
 * **RISK 2 완화(동기화 순서):** pullOwnWorkspaceIfChanged 전에 로컬 더티 확정 플러시.
 * 업로드 중 네트워크 지연 시 pullOwnWorkspaceIfChanged가 옛 스냅샷(더티 상태의 로컬 변경 전)을
 * 읽는 것을 방지하고, 항상 서버 최신 메타를 기준으로 병합하도록 보장한다.
 */
export async function runBidirectionalCloudSync(reason: string): Promise<void> {
  if (!browser || !isSupabaseCloudConfigured()) return;
  if (bidirectionalBusy) return;
  bidirectionalBusy = true;
  try {
    if (get(workspaceIsDirty)) {
      markCloudWorkspaceSyncing();
      const r = await uploadWorkspaceToCloud();
      if (!r.ok && import.meta.env.DEV) {
        console.warn('[runBidirectionalCloudSync]', reason, r.message);
      }
    }
    /** 풀 직전: 남은 더티(업로드 재시도 대기) 한 번 더 플러시 → 로컬이 서버 최신 메타 기준 병합 보장 */
    if (get(workspaceIsDirty)) {
      const r = await uploadWorkspaceToCloud();
      if (!r.ok && import.meta.env.DEV) {
        console.warn('[runBidirectionalCloudSync flush before pull]', reason, r.message);
      }
    }
    await pullOwnWorkspaceIfChanged();
    await pullSharedProjectSlicesIfNewer();
    if (!get(workspaceIsDirty)) {
      markCloudWorkspaceSynced();
    }
  } finally {
    bidirectionalBusy = false;
    bumpModalProjectListSync(reason);
  }
}
