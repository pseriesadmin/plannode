import { get } from 'svelte/store';
import { browser } from '$app/environment';
import {
  uploadWorkspaceToCloud,
  pullOwnWorkspaceIfChanged,
  pullSharedProjectSlicesForBidirectionalSync,
  type UploadWorkspaceResult
} from '$lib/supabase/sync';
import { isSupabaseCloudConfigured } from '$lib/supabase/env';
import {
  workspaceIsDirty,
  markCloudWorkspaceDirty,
  markCloudWorkspaceSyncing,
  markCloudWorkspaceSynced,
  hasCollabStructureOpsPending,
  getCollabStructureOpsPendingProjectIds,
  clearCollabStructureOpsPending,
  hasAnyCloudSyncPending
} from '$lib/stores/workspaceDirty';
import { dedupeProjectsStoreByLatestUpdatedAt, currentProject, projects } from '$lib/stores/projects';
import { authUser } from '$lib/stores/authSession';
import { cancelStructureOpsPersistDebounce, flushStructureOpsPersistForProject } from '$lib/supabase/projectStructureOps';

const CLOUD_FLUSH_MS_DEFAULT = 500;
/** PUSH-P2-03 — 공유 멤버 debounce (구 T0-4 300ms → 500ms, owner flush와 동일) */
const CLOUD_FLUSH_MS_SHARED_COLLAB = 500;
/** COLLAB-PERF-2 E6 — interval 틱 직후 bidirectional 재진입 최소 간격 */
export const MIN_BIDIRECTIONAL_INTERVAL_AFTER_SYNC_MS = 12_000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let bidirectionalBusy = false;
let lastBidirectionalCompletedMs = 0;

/** interval 틱만 — upload/sync 직후 12s 미만이면 스kip (visibility/focus/start는 즉시) */
export function shouldDeferBidirectionalInterval(reason: string): boolean {
  if (reason !== 'interval') return false;
  return Date.now() - lastBidirectionalCompletedMs < MIN_BIDIRECTIONAL_INTERVAL_AFTER_SYNC_MS;
}

function recordBidirectionalSyncCompleted(): void {
  lastBidirectionalCompletedMs = Date.now();
}

function isSharedCollabMemberProject(): boolean {
  const proj = get(currentProject);
  const uid = get(authUser)?.id ?? null;
  const src = proj?.cloud_workspace_source_user_id ?? null;
  return !!(src && uid && src !== uid);
}

/** COLLAB_FLUSH_COALESCE — structure_ops 120ms debounce 취소 · upload 1회에 append+push 배치 */
function coalesceCollabStructureOpsIntoCloudFlush(): void {
  if (!isSharedCollabMemberProject()) return;
  cancelStructureOpsPersistDebounce();
}

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

/** COLLAB-PERF-2 E3 — structure-only pending → append_structure_ops만 (full bundle upsert 생략) */
async function flushCollabStructureOpsPendingOnly(reason: string): Promise<boolean> {
  if (!hasCollabStructureOpsPending()) return true;
  coalesceCollabStructureOpsIntoCloudFlush();
  markCloudWorkspaceSyncing();
  const uid = get(authUser)?.id ?? null;
  if (!uid) return false;

  let allOk = true;
  for (const projectId of getCollabStructureOpsPendingProjectIds()) {
    const proj = get(projects).find((p) => p.id === projectId);
    const src = proj?.cloud_workspace_source_user_id;
    if (!src || src === uid) {
      clearCollabStructureOpsPending(projectId);
      continue;
    }
    const r = await flushStructureOpsPersistForProject(projectId, src);
    if (r.ok) {
      clearCollabStructureOpsPending(projectId);
    } else {
      allOk = false;
      /** E9-2 — pendingPersistOps 유지 · structure-only 재시도 (full bundle dirty 생략) */
      if (import.meta.env.DEV) {
        console.warn('[flushCollabStructureOpsPendingOnly]', reason, projectId);
      }
    }
  }
  if (allOk && !get(workspaceIsDirty)) {
    markCloudWorkspaceSynced();
    bumpModalProjectListSync(reason);
  }
  return allOk;
}

type FlushPrimaryResult = {
  attempted: boolean;
  ok: boolean;
  conflict?: boolean;
  conflictCooldown?: boolean;
  /** E8-3 — 공유 멤버 structure ops 우선 · bundle upsert 이번 틱 생략 */
  bundleDeferred?: boolean;
};

function uploadResultFlags(r: UploadWorkspaceResult): Pick<FlushPrimaryResult, 'conflict' | 'conflictCooldown'> {
  return { conflict: r.conflict, conflictCooldown: r.conflictCooldown };
}

/** COLLAB-PERF-2 E8-3 — 공유 멤버 + structure pending이면 bundle upsert defer */
function shouldDeferBundleForSharedStructureOps(fullDirty: boolean, structPending: boolean): boolean {
  return structPending && fullDirty && isSharedCollabMemberProject();
}
/** COLLAB-PERF-2 E3-2 · E8 — pull/flush 직전 pending (structure-only · shared defer · conflict retry skip) */
async function flushCloudPendingPrimary(reason: string): Promise<FlushPrimaryResult> {
  coalesceCollabStructureOpsIntoCloudFlush();
  const fullDirty = get(workspaceIsDirty);
  const structPending = hasCollabStructureOpsPending();
  if (!fullDirty && !structPending) return { attempted: false, ok: false };

  if (shouldDeferBundleForSharedStructureOps(fullDirty, structPending)) {
    const ok = await flushCollabStructureOpsPendingOnly(`${reason}:primary-ops-defer-bundle`);
    if (import.meta.env.DEV) {
      console.info('[collab-upload-defer] shared structure_ops — skip bundle this tick', reason);
    }
    return { attempted: false, ok, bundleDeferred: true };
  }

  if (structPending && !fullDirty) {
    const ok = await flushCollabStructureOpsPendingOnly(`${reason}:primary-ops`);
    return { attempted: false, ok };
  }

  if (fullDirty) {
    markCloudWorkspaceSyncing();
    const r = await uploadWorkspaceToCloud();
    if (!r.ok && import.meta.env.DEV) {
      console.warn('[runBidirectionalCloudSync]', reason, r.message);
    }
    if (r.ok && !get(workspaceIsDirty) && hasCollabStructureOpsPending()) {
      await flushCollabStructureOpsPendingOnly(`${reason}:primary-post-upload-ops`);
    }
    return { attempted: true, ok: r.ok, ...uploadResultFlags(r) };
  }
  return { attempted: false, ok: false };
}

/** pull 직전 재플러시 — E8-2 conflict 시 2차 upload skip · structure-only는 ops flush만 */
async function flushCloudPendingRetryBeforePull(reason: string, primary: FlushPrimaryResult): Promise<void> {
  coalesceCollabStructureOpsIntoCloudFlush();
  const fullDirty = get(workspaceIsDirty);
  const structPending = hasCollabStructureOpsPending();

  if (fullDirty) {
    if (primary.attempted && primary.ok) {
      if (import.meta.env.DEV) {
        console.warn('[runBidirectionalCloudSync] full dirty after primary upload ok — skip 2nd upload', reason);
      }
      return;
    }
    if (primary.bundleDeferred) {
      return;
    }
    if (primary.attempted && !primary.ok && (primary.conflict || primary.conflictCooldown)) {
      if (import.meta.env.DEV) {
        console.info('[runBidirectionalCloudSync] skip retry upload — conflict/cooldown', reason);
      }
      return;
    }
    markCloudWorkspaceSyncing();
    const r = await uploadWorkspaceToCloud();
    if (!r.ok && import.meta.env.DEV) {
      console.warn('[runBidirectionalCloudSync flush before pull]', reason, r.message);
    }
    if (!get(workspaceIsDirty) && hasCollabStructureOpsPending()) {
      await flushCollabStructureOpsPendingOnly(`${reason}:retry-post-upload-ops`);
    }
    return;
  }

  if (structPending) {
    await flushCollabStructureOpsPendingOnly(`${reason}:before-pull-ops`);
  }
}

/** 로컬 변경 후 클라우드 반영(더티·structure pending). 수동 ☁↑와 동일한 upload 사용 */
export async function flushCloudWorkspaceNow(reason: string): Promise<boolean> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (!browser || !isSupabaseCloudConfigured()) return true;

  const fullDirty = get(workspaceIsDirty);
  const structPending = hasCollabStructureOpsPending();
  if (!fullDirty && !structPending) return true;

  coalesceCollabStructureOpsIntoCloudFlush();

  if (shouldDeferBundleForSharedStructureOps(fullDirty, structPending)) {
    return flushCollabStructureOpsPendingOnly(`${reason}:defer-bundle`);
  }

  if (structPending && !fullDirty) {
    return flushCollabStructureOpsPendingOnly(reason);
  }

  markCloudWorkspaceSyncing();
  const r = await uploadWorkspaceToCloud();
  if (r.ok) {
    if (hasCollabStructureOpsPending() && !get(workspaceIsDirty)) {
      await flushCollabStructureOpsPendingOnly(`${reason}:post-upload-ops`);
    }
    bumpModalProjectListSync(reason);
    return true;
  }
  if (import.meta.env.DEV) console.warn('[cloud auto]', reason, r.message);
  return false;
}

/** 짧은 디바운스(탭 전환·연속 출력 등). 공유 멤버는 500ms + structure_ops coalesce(P2-03). */
export function scheduleCloudFlush(reason: string, delayMs?: number): void {
  if (!browser || !isSupabaseCloudConfigured()) return;
  if (!hasAnyCloudSyncPending()) return;
  let ms = delayMs ?? CLOUD_FLUSH_MS_DEFAULT;
  if (isSharedCollabMemberProject()) {
    if (delayMs === undefined) {
      ms = CLOUD_FLUSH_MS_SHARED_COLLAB;
    } else {
      ms = Math.max(delayMs, CLOUD_FLUSH_MS_SHARED_COLLAB);
    }
    coalesceCollabStructureOpsIntoCloudFlush();
  }
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    void flushCloudWorkspaceNow(reason);
  }, ms);
}

/**
 * 자동 동기화: (1) 로컬 더티면 업로드 + 공유 프로젝트는 소유자 행에 merge RPC
 * (2) structure-only pending이면 append_structure_ops만
 * (3) 내 워크스페이스·공유 슬라이스를 서버 기준으로 LWW 풀
 */
export async function runBidirectionalCloudSync(
  reason: string,
  opts?: { idleMs?: number }
): Promise<void> {
  if (!browser || !isSupabaseCloudConfigured()) return;
  if (bidirectionalBusy) return;
  if (shouldDeferBidirectionalInterval(reason)) {
    if (import.meta.env.DEV) {
      console.info('[bidirectional-defer] interval cooldown', reason);
    }
    return;
  }
  bidirectionalBusy = true;
  try {
    const primary = await flushCloudPendingPrimary(reason);
    await flushCloudPendingRetryBeforePull(reason, primary);
    await pullOwnWorkspaceIfChanged();
    await pullSharedProjectSlicesForBidirectionalSync(reason, opts);
    if (!hasAnyCloudSyncPending()) {
      markCloudWorkspaceSynced();
    }
  } finally {
    bidirectionalBusy = false;
    recordBidirectionalSyncCompleted();
    bumpModalProjectListSync(reason);
  }
}
