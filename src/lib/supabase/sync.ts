import { get } from 'svelte/store';
import { supabase } from '$lib/supabase/client';
import {
  gatherWorkspaceBundle,
  mergeWorkspaceBundleFromCloudRemote,
  mergeNodeListsForCloud,
  mergeNodeListsForCloudByProjectMeta,
  loadProjectNodesFromLocalStorage,
  loadLocalNodesForCollabMerge,
  unionCollabPreserveLocalNodes,
  mergeNodesForCollabPush,
  collabPushProjectMetaAvoidingServerPrune,
  reinjectCollabPreservedNodesAfterPullMerge,
  replaceWorkspaceFromBundle,
  upsertImportedPlannodeTreeV1,
  projects,
  currentProject,
  nodes,
  selectProject,
  projectWorkspaceNodesJsonSnapshot,
  clearPendingWorkspaceDeletions,
  releaseDeletedProjectTombstonesAfterUpload,
  workspaceDeletedProjectSkipIds,
  getDeletedProjectTombstoneIds,
  mergeProjectMetaForCloudSync,
  reconcileProjectRecord,
  replayStructureOpsOnNodes,
  type WorkspaceBundle
} from '$lib/stores/projects';
import { recordNodeDiffToChangeLog } from '$lib/stores/nodeChangeLog';
import {
  flushStructureOpsPersistForProject,
  flushAllPendingStructureOpsPersist,
  fetchStructureOpsSince,
  getStructureOpsPersistAckSeq,
  setStructureOpsPersistAckSeq,
  collabPushCanSkipSliceMergeAfterOpsFlush,
  collabPullCanSkipSliceMergeAfterOpsPull,
  structureOpsPersistFlushKey,
  hasPendingStructureOpsPersistForProject,
  setOpLogComplete,
  bootstrapStructureOpsFromSnapshot,
  subscribeStructureOpsRealtime,
  unsubscribeStructureOpsRealtime,
  type StructureOpsPullResult
} from '$lib/supabase/projectStructureOps';
import {
  ensureOwnerAclRowForMyProject,
  fetchProjectSliceFromCloud,
  trySelectProject,
  normalizeAclEmail,
  isUsableAclProjectId,
  isUsableCollabWorkspaceUserId
} from '$lib/supabase/projectAcl';
import type { Node, Project } from '$lib/supabase/client';
import { isSupabaseCloudConfigured } from '$lib/supabase/env';
import { isWorkspaceMissingOrCacheError, WORKSPACE_SETUP_MSG } from '$lib/supabase/aclErrors';
import { markCloudWorkspaceSynced, markCloudWorkspaceFailed } from '$lib/stores/workspaceDirty';
import { getAuthEmail, getAuthUserId } from '$lib/stores/authSession';
import { captureNodeSnapshot } from '$lib/stores/nodeSnapshotHistory';
import { scheduleAppendProjectWorkspaceHistoryAfterCloudUploadSuccess } from '$lib/supabase/projectWorkspaceHistory';
import {
  CLOUD_MERGE_SLICE_LOCK_TTL_SECONDS,
  CLOUD_MERGE_SLICE_MAX_ATTEMPTS,
  CLOUD_MERGE_SLICE_RETRY_BACKOFF_MS
} from '$lib/plannodeCollabLimits';

export { isSupabaseCloudConfigured };

/** pull 병합 직전 파일럿→스토어 flush (pilotBridge 등록 · 순환 import 방지) */
let flushPilotNodesBeforeCollabMerge: (() => void) | undefined;

export function registerFlushPilotNodesBeforeCollabMerge(fn: () => void): void {
  flushPilotNodesBeforeCollabMerge = fn;
}

function maybeFlushPilotBeforeCollabMerge(projectId: string): void {
  const cur = get(currentProject);
  if (cur?.id !== projectId) return;
  try {
    flushPilotNodesBeforeCollabMerge?.();
  } catch {
    /* ignore */
  }
}

/** T0-1 — push/pull 직전 파일럿 flush 후 스토어+LS 병합 노드 목록 */
function collabNodesForPush(projectId: string): Node[] {
  maybeFlushPilotBeforeCollabMerge(projectId);
  return loadLocalNodesForCollabMerge(projectId);
}

/** EPIC E — since ack seq 이후 structure ops pull + replay · 스토어 merge 즉시 · 캔버스 hydrate는 interaction guard 시 defer */
export async function pullStructureOpsForProject(project: Project): Promise<StructureOpsPullResult> {
  const none: StructureOpsPullResult = { ok: false, applied: 0 };
  if (typeof window === 'undefined' || !isSupabaseCloudConfigured()) return none;
  const uid = getAuthUserId();
  if (!uid || !project?.id) return none;
  const src = project.cloud_workspace_source_user_id;
  // Phase 1B: src === uid guard 제거 — owner도 자신의 workspace에서 op pull 가능
  if (!src) return none;
  // ACL 없는 고아 프로젝트: 이미 403이 확인된 경우 fetch 자체 생략
  if (isCollabProjectForbidden(src, project.id)) return none;

  const since = getStructureOpsPersistAckSeq(project.id);
  const bundle = await fetchStructureOpsSince(src, project.id, since);
  if (!bundle) return none;

  if (bundle.last_applied_seq > since) {
    setStructureOpsPersistAckSeq(project.id, bundle.last_applied_seq);
  }

  // Phase 4: op_log_complete 서버 응답 → localStorage 캐시 갱신
  if (bundle.op_log_complete) {
    setOpLogComplete(project.id, true);
  }

  const meta: StructureOpsPullResult = {
    ok: true,
    applied: 0,
    lastAppliedSeq: bundle.last_applied_seq,
    revision: bundle.revision
  };

  if (!bundle.ops.length) return meta;

  maybeFlushPilotBeforeCollabMerge(project.id);
  const local = loadLocalNodesForCollabMerge(project.id);
  const replayed = replayStructureOpsOnNodes(
    local,
    bundle.ops.map((row) => row.op),
    project.id
  );
  // 클라우드 pull 변경 로그 — upsert 전에 op 기반 diff 기록(과부하 없음: Map O(n), localStorage 소량)
  recordNodeDiffToChangeLog(project.id, local, replayed);
  const ref = get(projects).find((p) => p.id === project.id) ?? project;
  upsertImportedPlannodeTreeV1(ref, replayed, { openAfter: false, markDirty: false });
  if (get(currentProject)?.id === project.id) {
    const latest = get(projects).find((p) => p.id === project.id);
    if (latest) selectProject(latest);
  }
  return { ...meta, applied: bundle.ops.length };
}

/** PUSH-P2-01 — push `revision_stale` 후: structure_ops 우선 · full slice는 해당 프로젝트만 fallback */
async function recoverCollabProjectAfterRevisionStale(projectId: string): Promise<void> {
  const ref = get(projects).find((p) => p.id === projectId);
  if (!ref) return;
  maybeFlushPilotBeforeCollabMerge(projectId);
  const prePull = loadLocalNodesForCollabMerge(projectId);

  const opsResult = await pullStructureOpsForProject(ref);
  if (opsResult.applied > 0) {
    if (import.meta.env.DEV) {
      console.info('[recoverCollabProjectAfterRevisionStale] structure_ops applied', { projectId });
    }
  } else {
    const merged = await mergeSharedProjectSliceFromCloudIfApplicable(ref);
    if (import.meta.env.DEV) {
      console.info('[recoverCollabProjectAfterRevisionStale] slice fallback', {
        projectId,
        merged
      });
    }
  }

  reinjectCollabPreservedNodesAfterPullMerge(projectId, prePull);
}

/** EPIC E — 공유 멤버 pending structure ops → 소유자 op log */
export async function appendStructureOpsToOwner(
  projectId: string,
  workspaceUserId: string,
  baseRevision: number | null = null
): Promise<{ ok: boolean; flushed: number }> {
  const r = await flushStructureOpsPersistForProject(projectId, workspaceUserId, baseRevision);
  return { ok: r.ok, flushed: r.flushed };
}

/** pull·poll — revision+ack 경량 판정 실패 시에만 full slice hash 비교 (fallback) */
async function collabRemoteSliceHashDiffers(
  workspaceUserId: string,
  projectId: string
): Promise<boolean> {
  const slice = await fetchProjectSliceFromCloud(workspaceUserId, projectId);
  if (!slice) return false;
  const local = loadLocalNodesForCollabMerge(projectId);
  return (
    projectWorkspaceNodesJsonSnapshot(slice.nodes) !== projectWorkspaceNodesJsonSnapshot(local)
  );
}

type CollabPullLightAssessment = {
  pullNeeded: boolean;
  viaLightweight: boolean;
  ackSeq: number;
  lastAppliedSeq?: number;
  pendingOpsSinceAck?: number;
};

/** COLLAB-PERF-2 E2 — revision 동일 + since ack 이후 ops 0 + ack ≤ last_applied → pull 불필요 (slice fetch 0)
 *  COLLAB_META_DRIFT: ackSeq > last_applied_seq 이면 meta drift → hash check 경로로 위임 (viaLightweight: false) */
async function assessCollabPullByRevisionAndOpsAck(
  workspaceUserId: string,
  projectId: string,
  remoteRev: number,
  cachedRev: number | null
): Promise<CollabPullLightAssessment> {
  const ackSeq = getStructureOpsPersistAckSeq(projectId);
  if (cachedRev === null || cachedRev !== remoteRev) {
    return { pullNeeded: true, viaLightweight: true, ackSeq };
  }

  const bundle = await fetchStructureOpsSince(workspaceUserId, projectId, ackSeq);
  if (!bundle) {
    return { pullNeeded: true, viaLightweight: false, ackSeq };
  }

  if (bundle.ops.length === 0) {
    // COLLAB_META_DRIFT: ackSeq > last_applied_seq → meta가 뒤처짐 → hash check에 위임
    const metaDrift = ackSeq > bundle.last_applied_seq;
    if (!metaDrift) {
      return { pullNeeded: false, viaLightweight: true, ackSeq, lastAppliedSeq: bundle.last_applied_seq };
    }
    return { pullNeeded: true, viaLightweight: false, ackSeq, lastAppliedSeq: bundle.last_applied_seq };
  }

  return {
    pullNeeded: true,
    viaLightweight: true,
    ackSeq,
    lastAppliedSeq: bundle.last_applied_seq,
    pendingOpsSinceAck: bundle.ops.length
  };
}

async function collabSliceOutOfSyncAfterPull(
  workspaceUserId: string,
  projectId: string,
  opsResult: StructureOpsPullResult,
  sliceMerged: boolean
): Promise<boolean> {
  if (sliceMerged || opsResult.applied > 0) return false;
  if (opsResult.ok && opsResult.lastAppliedSeq !== undefined) {
    const ackSeq = getStructureOpsPersistAckSeq(projectId);
    // COLLAB_META_DRIFT: ackSeq > lastAppliedSeq 이면 drift → hash check 진행
    if (ackSeq <= opsResult.lastAppliedSeq) return false;
  }
  return collabRemoteSliceHashDiffers(workspaceUserId, projectId);
}

/** COLLAB-PERF P0-02 — revision 동일·hash 불일치 poll 연속 N회 시 pull 생략
 * [Fix-6] 3→5: concurrent push 경쟁 조건에서 일시적 불일치 허용 범위 확대 */
const COLLAB_HASH_MISMATCH_MAX_POLL_STREAK = 5;
/** [Fix-6] 이 streak에 도달하면 자동 복구 pull 1회 시도 */
const COLLAB_HASH_MISMATCH_AUTO_RECOVER_AT = 3;
const collabHashMismatchPollStreak = new Map<string, number>();
const collabPollPausedToastAt = new Map<string, number>();

function resetCollabHashMismatchPollStreak(workspaceUserId: string, projectId: string): void {
  collabHashMismatchPollStreak.delete(collabRevisionCacheKey(workspaceUserId, projectId));
}

/** visibility/focus nudge 등 — poll pause 해제(다음 poll에서 pull 재개) */
export function resetCollabHashMismatchPollPauseForProject(project: Project): void {
  if (typeof window === 'undefined' || !project?.id) return;
  const uid = getAuthUserId();
  if (!uid) return;
  const workspaceUserId = project.cloud_workspace_source_user_id ?? uid;
  resetCollabHashMismatchPollStreak(workspaceUserId, project.id);
}

function notifyCollabPollPausedManualSyncToast(projectId: string, projectName: string | undefined): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const prev = collabPollPausedToastAt.get(projectId) ?? 0;
  if (now - prev < MERGE_SLICE_WARN_COOLDOWN_MS) return;
  collabPollPausedToastAt.set(projectId, now);
  const nm = projectName?.trim() ?? '';
  const label = nm ? `「${nm.length > 40 ? `${nm.slice(0, 40)}…` : nm}」` : '공유 프로젝트';
  try {
    window.dispatchEvent(
      new CustomEvent('plannode-pilot-toast', {
        detail: {
          message: `${label}: 자동 동기화 확인을 잠시 쉬었어. 탭을 나갔다 돌아오거나 노드를 한 번 저장하면 다시 맞출게.`
        }
      })
    );
  } catch {
    /* ignore */
  }
}

function markCollabRevisionCachedIfSynced(
  workspaceUserId: string,
  projectId: string,
  remoteRev: number,
  changed: boolean,
  hashDiffers: boolean
): void {
  if (changed || !hashDiffers) {
    setCachedCollabRevision(workspaceUserId, projectId, remoteRev);
  }
}

/**
 * 동기·공유 슬라이스(NOW-68·EPIC A): `plannode_workspace` **번들 본문**은 Realtime 미구독(pull/RPC).
 * `plannode_project_collab_meta.revision` 만 postgres_changes **신호** → `pullCollabSliceForProject`.
 * OT/CRDT 없음. `plannode-architecture.mdc` §10.6·§10.7.
 */

const TABLE = 'plannode_workspace';

/** 내 plannode_workspace 행의 `updated_at` 캐시 — 자동 풀 시 불필요한 전체 병합 방지 */
export const OWN_WORKSPACE_REMOTE_TS_KEY = 'plannode_own_workspace_remote_updated_at';

async function requireSessionUserId(): Promise<{ userId: string | null; error?: string }> {
  const { data: sess } = await supabase.auth.getSession();
  const id = sess.session?.user?.id;
  if (!id) return { userId: null, error: '이메일 로그인이 필요해. 먼저 로그인해줘.' };
  return { userId: id };
}

function normalizeBundle(row: {
  projects_json: unknown;
  nodes_by_project_json: unknown;
}): WorkspaceBundle | null {
  const projects = row.projects_json;
  const nodesRaw = row.nodes_by_project_json;
  if (!Array.isArray(projects)) return null;
  if (typeof nodesRaw !== 'object' || nodesRaw === null || Array.isArray(nodesRaw)) return null;
  const nodesByProject: Record<string, Node[]> = {};
  for (const [k, v] of Object.entries(nodesRaw as Record<string, unknown>)) {
    nodesByProject[k] = Array.isArray(v) ? (v as Node[]) : [];
  }
  return { projects: projects as Project[], nodesByProject };
}

/** 업로드 직전: 서버 `updated_at`이 내가 마지막으로 맞춘 값과 다르면(다른 기기·탭) LWW로 로컬에 먼저 병합 */
async function mergeRemoteWorkspaceBeforeUpload(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('updated_at, projects_json, nodes_by_project_json')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return;

  const remoteTs = String((data as { updated_at?: string }).updated_at ?? '');
  if (!remoteTs) return;

  let prev = '';
  try {
    prev = localStorage.getItem(OWN_WORKSPACE_REMOTE_TS_KEY) ?? '';
  } catch {
    prev = '';
  }

  const bundle = normalizeBundle(data as { projects_json: unknown; nodes_by_project_json: unknown });
  if (!bundle?.projects?.length) return;

  if (remoteTs === prev) return;

  mergeWorkspaceBundleFromCloudRemote(bundle);
  try {
    localStorage.setItem(OWN_WORKSPACE_REMOTE_TS_KEY, remoteTs);
  } catch {
    /* ignore */
  }
}

function isWorkspaceUpsertRpcMissing(err: { message?: string; code?: string; details?: string } | null): boolean {
  if (!err) return false;
  const m = (String(err.message ?? '') + ' ' + String(err.details ?? '')).toLowerCase();
  const c = String(err.code ?? '');
  return (
    c === 'PGRST202' ||
    c === 'PGRST301' ||
    /\b404\b/.test(m) ||
    m.includes('not found') ||
    m.includes('could not find') ||
    /function public\.plannode_workspace_upsert_workspace_bundle/i.test(String(err.message ?? ''))
  );
}

/** revision/락 RPC 미배포 시 조용히 생략 (docs/supabase/plannode_project_collab_revision_lock.sql) */
function isCollabRevisionRpcMissing(err: { message?: string; code?: string; details?: string; status?: number } | null): boolean {
  if (!err) return false;
  const m = (String(err.message ?? '') + ' ' + String(err.details ?? '')).toLowerCase();
  const c = String(err.code ?? '');
  const status = (err as { status?: number }).status;
  return (
    status === 404 ||
    c === 'PGRST202' ||
    c === 'PGRST301' ||
    /\b404\b/.test(m) ||
    m.includes('not found') ||
    m.includes('could not find') ||
    /plannode_project_collab_get_revision/i.test(String(err.message ?? '')) ||
    /plannode_project_collab_try_acquire_lock/i.test(String(err.message ?? '')) ||
    /plannode_project_collab_release_lock/i.test(String(err.message ?? '')) ||
    /plannode_project_collab_merge_atomic/i.test(String(err.message ?? ''))
  );
}

function rpcBigintToNumber(data: unknown): number | null {
  if (data == null) return null;
  if (typeof data === 'number' && Number.isFinite(data)) return data;
  if (typeof data === 'string') {
    const n = Number(data);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Phase-4: merge_atomic 미지원 환경 감지 — 모듈 스코프로 유지해 호출마다 404 재시도 방지
// SQL 적용 전 환경에서 매 push마다 404 추가 왕복이 생기는 Bug-1 수정
let _mergeAtomicUnsupported = false;

/** `revision_stale` 예외의 `detail`(현재 서버 revision 문자열) → 재시도 `p_base_revision` 힌트 */
function parseStaleRevisionFromCollabError(err: {
  message?: string;
  details?: string;
}): number | null {
  return rpcBigintToNumber(String(err.details ?? '').trim() || null);
}

type UpsertBundleRpcResult = {
  ok?: boolean;
  reason?: string;
  server_updated_at?: string | null;
  collab_revision_bumps?: unknown;
};

type CollabRevisionBumpRow = {
  project_id?: string;
  revision?: number;
};

function parseCollabRevisionBumps(raw: unknown): CollabRevisionBumpRow[] {
  if (!Array.isArray(raw)) return [];
  const out: CollabRevisionBumpRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const project_id = String(r.project_id ?? '').trim();
    const revision = Number(r.revision);
    if (!project_id || !Number.isFinite(revision)) continue;
    out.push({ project_id, revision: Math.floor(revision) });
  }
  return out;
}

/** PUSH-P2-04 — owner upsert·fallback bump RPC 결과 → revision 캐시·hash streak reset */
function applyOwnerCollabRevisionBumps(workspaceUserId: string, bumps: CollabRevisionBumpRow[]): void {
  if (!bumps.length) return;
  for (const row of bumps) {
    const pid = row.project_id;
    const rev = row.revision;
    if (!pid || rev == null) continue;
    setCachedCollabRevision(workspaceUserId, pid, rev);
    collabHashMismatchPollStreak.delete(collabRevisionCacheKey(workspaceUserId, pid));
    if (import.meta.env.DEV) {
      console.info('[applyOwnerCollabRevisionBumps]', pid, rev);
    }
  }
}

async function bumpOwnerCollabRevisionsAfterFallbackUpload(
  userId: string,
  bundle: WorkspaceBundle
): Promise<void> {
  const ids = bundle.projects.map((p) => p.id).filter(Boolean);
  if (!ids.length) return;
  const { data, error } = await supabase.rpc('plannode_bump_owner_collab_revisions_for_projects', {
    p_project_ids: ids
  });
  if (error) {
    if (import.meta.env.DEV && !isCollabRevisionRpcMissing(error)) {
      console.warn('[bumpOwnerCollabRevisionsAfterFallbackUpload]', error.message);
    }
    return;
  }
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  applyOwnerCollabRevisionBumps(userId, parseCollabRevisionBumps(root?.bumped));
}

/**
 * merge/lock RPC는 ACL에 JWT 이메일(및 세션 헬퍼) 일치까지 요구함 — project_id·workspace 소스만 맞고
 * 현재 사용자 이메일 행이 없으면 함수 본문에서 42501 forbidden → PostgREST 403.
 * SELECT 사전 검사도 동일 축(email)으로 해 불필요한 RPC 폭주를 줄인다.
 */
async function canPushMergeSliceForProject(projectId: string, workspaceUserId: string): Promise<boolean> {
  if (!isUsableAclProjectId(projectId) || !isUsableCollabWorkspaceUserId(workspaceUserId)) {
    return false;
  }
  const email = getAuthEmail();
  if (!email) return false;
  const em = normalizeAclEmail(email);
  const { data, error } = await supabase
    .from('plannode_project_acl')
    .select('id')
    .eq('project_id', projectId)
    .eq('workspace_source_user_id', workspaceUserId)
    .eq('email', em)
    .limit(1);
  if (error || !data?.length) return false;
  return true;
}

/** ACL 없는 고아 프로젝트 — 세션 단위 403 영구 차단 (키: workspaceUserId:projectId).
 * DB에 ACL row가 없거나 email 불일치로 revision/ops RPC가 403을 반환하면 등록 →
 * 이후 폴링에서 제외해 6초마다 반복 에러 방지. */
const _collabForbiddenProjects = new Set<string>();

function markCollabProjectForbidden(workspaceUserId: string, projectId: string): void {
  _collabForbiddenProjects.add(`${workspaceUserId}:${projectId}`);
  if (import.meta.env.DEV) {
    console.info('[collab] project marked forbidden (no valid ACL) — polling skipped:', projectId);
  }
}

function isCollabProjectForbidden(workspaceUserId: string, projectId: string): boolean {
  return _collabForbiddenProjects.has(`${workspaceUserId}:${projectId}`);
}

function isCollabRevisionRpcForbidden(err: { message?: string; code?: string; status?: number } | null): boolean {
  if (!err) return false;
  const m = String(err.message ?? '').toLowerCase();
  const status = (err as { status?: number }).status;
  return status === 403 || m.includes('forbidden') || m.includes('42501');
}

/** collab_meta.revision — Realtime·폴백 poll 중복 pull 방지 (키: workspaceUserId:projectId) */
const collabRevisionCache = new Map<string, number>();

function collabRevisionCacheKey(workspaceUserId: string, projectId: string): string {
  return `${workspaceUserId}:${projectId}`;
}

export function getCachedCollabRevision(workspaceUserId: string, projectId: string): number | null {
  const v = collabRevisionCache.get(collabRevisionCacheKey(workspaceUserId, projectId));
  return v === undefined ? null : v;
}

export function setCachedCollabRevision(workspaceUserId: string, projectId: string, revision: number): void {
  collabRevisionCache.set(collabRevisionCacheKey(workspaceUserId, projectId), revision);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function fetchCollabRevision(workspaceUserId: string, projectId: string): Promise<number | null> {
  if (!workspaceUserId || !UUID_REGEX.test(workspaceUserId)) return null;
  if (isCollabProjectForbidden(workspaceUserId, projectId)) return null;
  const { data, error } = await supabase.rpc('plannode_project_collab_get_revision', {
    p_workspace_user_id: workspaceUserId,
    p_project_id: projectId
  });
  if (error) {
    if (isCollabRevisionRpcForbidden(error)) {
      // ACL 없는 고아 프로젝트: 세션 단위 차단 (매 6초 403 폭탄 방지)
      markCollabProjectForbidden(workspaceUserId, projectId);
    } else if (error.code === 'PGRST202' || (error as { status?: number }).status === 400) {
      // 파라미터 타입 불일치(uuid 형식 오류 등): 세션 단위 차단
      markCollabProjectForbidden(workspaceUserId, projectId);
    } else if (!isCollabRevisionRpcMissing(error) && import.meta.env.DEV) {
      console.warn('[fetchCollabRevision]', projectId, error.message);
    }
    return null;
  }
  return rpcBigintToNumber(data);
}

const mergeSliceWarnAt = new Map<string, number>();
const mergeSliceUserToastAt = new Map<string, number>();
const mergeLockUserToastAt = new Map<string, number>();
const mergeRevisionStaleToastAt = new Map<string, number>();
const MERGE_SLICE_WARN_COOLDOWN_MS = 120_000;

function collabErrorBlob(err: { message?: string; details?: string; code?: string } | null): string {
  if (!err) return '';
  return `${String(err.message ?? '')} ${String(err.details ?? '')} ${String(err.code ?? '')}`.toLowerCase();
}

function isMergeLockOrBusyError(err: { message?: string; details?: string } | null): boolean {
  const s = collabErrorBlob(err);
  return s.includes('merge_locked') || s.includes('locked_by_other');
}

function isRevisionStaleError(err: { message?: string; details?: string } | null): boolean {
  return collabErrorBlob(err).includes('revision_stale');
}

function isForbiddenMergeError(err: { message?: string; details?: string; code?: string } | null): boolean {
  const s = collabErrorBlob(err);
  return s.includes('forbidden') || s.includes('42501') || s.includes('pgrst301');
}

function notifyMergeLockBusyToastThrottled(projectId: string, projectName: string | undefined): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const prev = mergeLockUserToastAt.get(projectId) ?? 0;
  if (now - prev < MERGE_SLICE_WARN_COOLDOWN_MS) return;
  mergeLockUserToastAt.set(projectId, now);
  const nm = projectName?.trim() ?? '';
  const label = nm ? `「${nm.length > 40 ? `${nm.slice(0, 40)}…` : nm}」` : '이 공유 프로젝트';
  try {
    window.dispatchEvent(
      new CustomEvent('plannode-pilot-toast', {
        detail: {
          message: `${label}: 다른 멤버가 동시에 올리는 중이야. 잠시 후 자동으로 다시 시도할게.`
        }
      })
    );
  } catch {
    /* ignore */
  }
}

function notifyRevisionStaleSyncedToastThrottled(projectId: string, projectName: string | undefined): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const prev = mergeRevisionStaleToastAt.get(projectId) ?? 0;
  if (now - prev < MERGE_SLICE_WARN_COOLDOWN_MS) return;
  mergeRevisionStaleToastAt.set(projectId, now);
  const nm = projectName?.trim() ?? '';
  const label = nm ? `「${nm.length > 40 ? `${nm.slice(0, 40)}…` : nm}」` : '공유 프로젝트';
  try {
    window.dispatchEvent(
      new CustomEvent('plannode-pilot-toast', {
        detail: {
          message: `${label}: 소유자 쪽이 더 최신이어서 먼저 가져왔어. 화면 확인 후 필요하면 한 번 더 저장해줘.`
        }
      })
    );
  } catch {
    /* ignore */
  }
}

function notifyMergeSliceFailureToastThrottled(
  projectId: string,
  projectName: string | undefined,
  err: { message?: string; details?: string; code?: string } | null
): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const prev = mergeSliceUserToastAt.get(projectId) ?? 0;
  if (now - prev < MERGE_SLICE_WARN_COOLDOWN_MS) return;
  mergeSliceUserToastAt.set(projectId, now);
  const nm = projectName?.trim() ?? '';
  const label = nm ? `「${nm.length > 40 ? `${nm.slice(0, 40)}…` : nm}」` : '공유 프로젝트';
  let message = `${label}: 클라우드에 반영하지 못했어. 연결을 확인하거나 잠시 후 다시 저장해줘.`;
  if (isForbiddenMergeError(err)) {
    message = `${label}: 편집 권한이 없거나 로그인이 만료됐을 수 있어. 다시 로그인한 뒤 시도해줘.`;
  } else if (isRevisionStaleError(err)) {
    message = `${label}: 서버 쪽이 더 앞서 있어. 잠시 후 다시 저장하거나, 목록에서 새로고침해줘.`;
  } else {
    const blob = collabErrorBlob(err);
    if (blob.includes('pgrst202') || blob.includes('could not find') || blob.includes('function public.plannode_workspace_merge')) {
      message = `${label}: 서버 함수가 아직 맞지 않아. docs/supabase/plannode_project_collab_revision_lock.sql 를 실행했는지 확인해줘.`;
    }
  }
  try {
    window.dispatchEvent(
      new CustomEvent('plannode-pilot-toast', {
        detail: { message }
      })
    );
  } catch {
    /* ignore */
  }
}

function warnMergeSliceThrottled(projectId: string, message: string): void {
  if (!import.meta.env.DEV) return;
  const now = Date.now();
  const prev = mergeSliceWarnAt.get(projectId) ?? 0;
  if (now - prev < MERGE_SLICE_WARN_COOLDOWN_MS) return;
  mergeSliceWarnAt.set(projectId, now);
  console.warn(
    '[uploadWorkspaceToCloud] 소유자 워크스페이스에 공유 프로젝트 반영 실패(merge RPC·ACL):',
    projectId,
    message,
    '→ Supabase에서 docs/supabase/plannode_project_collab_revision_lock.sql(또는 acl_jwt_fix) 실행·ACL workspace_source_user_id 확인.'
  );
}

async function pushProjectSlicesToOwners(bundle: WorkspaceBundle, userId: string): Promise<void> {
  const pushTargetIds: string[] = [];
  for (const p of bundle.projects) {
    const src = p.cloud_workspace_source_user_id;
    if (!src || src === userId) continue;
    pushTargetIds.push(p.id);
  }
  if (!pushTargetIds.length) return;

  /** push 전 pull이 unpushed recent-add를 지우지 않도록 pre-merge 스냅 + flush (push 대상만) */
  const prePullByProject = new Map<string, Node[]>();
  for (const pid of pushTargetIds) {
    const p = get(projects).find((x) => x.id === pid);
    if (!p) continue;
    maybeFlushPilotBeforeCollabMerge(p.id);
    prePullByProject.set(p.id, loadLocalNodesForCollabMerge(p.id));
  }
  await pullSharedProjectSlicesIfNewer(pushTargetIds);
  for (const [pid, pre] of prePullByProject) {
    reinjectCollabPreservedNodesAfterPullMerge(pid, pre);
  }
  const structureOpsBatchFlush = await flushAllPendingStructureOpsPersist();
  for (const p of bundle.projects) {
    const src = p.cloud_workspace_source_user_id;
    if (!src || src === userId) continue;
    const can = await canPushMergeSliceForProject(p.id, src);
    if (!can) continue;

    // Phase-4 (2026-05-31): plannode_project_collab_merge_atomic 우선 사용
    // get_revision + try_acquire_lock + merge + release_lock → 1회 왕복으로 통합
    // atomic RPC 미지원(구 DB) 시 기존 4-RPC 경로로 fallback
    // _mergeAtomicUnsupported: 모듈 스코프 — SQL 미적용 환경에서 매 push 404 추가 왕복 방지(Bug-1)
    let lastErr: { message?: string; details?: string; code?: string } | null = null;
    let revisionStaleNotifiedThisPush = false;
    let revisionHintFromStale: number | null = null;

    for (let attempt = 0; attempt < CLOUD_MERGE_SLICE_MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        const delay =
          CLOUD_MERGE_SLICE_RETRY_BACKOFF_MS * attempt + Math.floor(Math.random() * 220);
        await new Promise((r) => setTimeout(r, delay));
      }

      const fresh = gatherWorkspaceBundle();
      const proj = fresh.projects.find((x) => x.id === p.id);
      if (!proj) break;

      // structure ops 경로: atomic RPC 진입 전에도 동일하게 처리
      let baseRevision: number | null = revisionHintFromStale;
      if (baseRevision === null && !revisionStaleNotifiedThisPush && _mergeAtomicUnsupported
          && UUID_REGEX.test(src) && !isCollabProjectForbidden(src, p.id)) {
        const { data: revData, error: revErr } = await supabase.rpc('plannode_project_collab_get_revision', {
          p_workspace_user_id: src,
          p_project_id: p.id
        });
        if (!revErr) {
          const rn = rpcBigintToNumber(revData);
          if (rn !== null) baseRevision = rn;
        } else {
          if (isCollabRevisionRpcForbidden(revErr) || (revErr as { status?: number }).status === 400) {
            markCollabProjectForbidden(src, p.id);
          } else if (!isCollabRevisionRpcMissing(revErr) && import.meta.env.DEV) {
            console.warn('[pushProjectSlicesToOwners] plannode_project_collab_get_revision', revErr.message);
          }
        }
      }

      const opsFlush = await flushStructureOpsPersistForProject(p.id, src, baseRevision ?? undefined);
      structureOpsBatchFlush.set(structureOpsPersistFlushKey(src, p.id), opsFlush);

      if (collabPushCanSkipSliceMergeAfterOpsFlush(p.id, src, structureOpsBatchFlush, opsFlush)) {
        if (import.meta.env.DEV) {
          console.info('[pushProjectSlicesToOwners] structure_ops-only — skip slice merge', p.id);
        }
        lastErr = null;
        revisionHintFromStale = null;
        break;
      }

      maybeFlushPilotBeforeCollabMerge(p.id);
      const prePushLocal = loadLocalNodesForCollabMerge(p.id);
      let pushNodes = collabNodesForPush(p.id);
      if (!pushNodes.length) {
        pushNodes = prePushLocal.length ? prePushLocal : (fresh.nodesByProject[p.id] ?? []);
      }

      let ownerSlice = getPullPushSliceCache(src, p.id) ?? await fetchProjectSliceFromCloud(src, p.id);
      if (!ownerSlice) {
        await new Promise((r) => setTimeout(r, 280));
        ownerSlice = await fetchProjectSliceFromCloud(src, p.id);
      }
      let pushProj: Project;
      let useDeltaOnly = false;
      if (!ownerSlice) {
        if (import.meta.env.DEV) {
          console.warn('[pushProjectSlicesToOwners] owner slice fetch failed — delta-only LWW push', p.id);
        }
        pushNodes = mergeNodesForCollabPush(pushNodes, [], p.id);
        pushProj = proj;
        useDeltaOnly = true;
      } else {
        pushNodes = mergeNodesForCollabPush(pushNodes, ownerSlice.nodes, p.id);
        pushProj = collabPushProjectMetaAvoidingServerPrune(proj, ownerSlice.project, pushNodes, ownerSlice.nodes);
      }
      const { cloud_workspace_source_user_id: _cw, ...meta } = pushProj;

      // ── atomic RPC 경로 (Phase-4) ──────────────────────────────────────────────
      if (!_mergeAtomicUnsupported) {
        const { data: atomicData, error: atomicErr } = await supabase.rpc(
          'plannode_project_collab_merge_atomic',
          {
            p_workspace_user_id: src,
            p_project_id:        p.id,
            p_project:           meta,
            p_nodes:             pushNodes,
            p_base_revision:     baseRevision,
            p_lock_ttl_seconds:  CLOUD_MERGE_SLICE_LOCK_TTL_SECONDS,
            p_use_delta:         useDeltaOnly
          }
        );

        // DB에 새 RPC가 없으면 구 경로로 fallback (1회만 판단)
        // Supabase JS 에러 객체 구조: { message, code, details, hint } — HTTP status는 별도 필드 없이
        // message/details에 "404"·"not found"·"PGRST202"로 노출됨
        if (import.meta.env.DEV && atomicErr) {
          console.warn('[pushProjectSlicesToOwners] merge_atomic err dump', JSON.stringify(atomicErr));
        }
        const isAtomicMissing = atomicErr != null && isCollabRevisionRpcMissing(atomicErr);
        if (isAtomicMissing) {
          _mergeAtomicUnsupported = true;
          if (import.meta.env.DEV) {
            console.info('[pushProjectSlicesToOwners] merge_atomic unsupported — fallback to legacy path');
          }
          // 아래 legacy 경로 재실행을 위해 attempt 반복
          attempt--;
          continue;
        }

        if (!atomicErr && atomicData && typeof atomicData === 'object') {
          const res = atomicData as { ok?: boolean; error?: string; revision?: number };
          if (res.ok) {
            if (typeof res.revision === 'number') {
              setCachedCollabRevision(src, p.id, res.revision);
            }
            lastErr = null;
            revisionHintFromStale = null;
            break;
          }
          const errType = String(res.error ?? '');
          if (errType === 'revision_stale') {
            const hinted = typeof res.revision === 'number' ? res.revision : null;
            if (hinted !== null) revisionHintFromStale = hinted;
            await recoverCollabProjectAfterRevisionStale(p.id);
            const dedupUntil = modalSavePushStaleToastDedupUntil.get(p.id) ?? 0;
            if (!revisionStaleNotifiedThisPush && Date.now() >= dedupUntil) {
              revisionStaleNotifiedThisPush = true;
              notifyRevisionStaleSyncedToastThrottled(p.id, proj.name);
            }
            continue;
          }
          if (errType === 'merge_locked') {
            notifyMergeLockBusyToastThrottled(p.id, proj.name);
            lastErr = { message: 'merge_locked' };
            continue;
          }
          lastErr = { message: errType };
          continue;
        }

        if (atomicErr) {
          lastErr = atomicErr;
          const msg = String(atomicErr.message ?? '');
          const det = String((atomicErr as { details?: string }).details ?? '');
          if (msg.includes('revision_stale') || det.includes('revision_stale')) {
            const hinted = parseStaleRevisionFromCollabError(atomicErr);
            if (hinted !== null) revisionHintFromStale = hinted;
            await recoverCollabProjectAfterRevisionStale(p.id);
            const dedupUntil = modalSavePushStaleToastDedupUntil.get(p.id) ?? 0;
            if (!revisionStaleNotifiedThisPush && Date.now() >= dedupUntil) {
              revisionStaleNotifiedThisPush = true;
              notifyRevisionStaleSyncedToastThrottled(p.id, proj.name);
            }
            continue;
          }
          if (msg.includes('merge_locked') || det.includes('merge_locked')) {
            notifyMergeLockBusyToastThrottled(p.id, proj.name);
            continue;
          }
        }
        continue;
      }

      // ── legacy 4-RPC 경로 (atomic 미지원 환경 fallback) ──────────────────────
      let lockHeld = false;
      const { data: lockData, error: lockErr } = await supabase.rpc('plannode_project_collab_try_acquire_lock', {
        p_workspace_user_id: src,
        p_project_id: p.id,
        p_ttl_seconds: CLOUD_MERGE_SLICE_LOCK_TTL_SECONDS
      });
      if (!lockErr && lockData && typeof lockData === 'object' && 'ok' in lockData) {
        const ok = (lockData as { ok?: boolean }).ok === true;
        const reason = String((lockData as { reason?: string }).reason ?? '');
        if (ok) {
          lockHeld = true;
        } else if (reason === 'locked_by_other') {
          notifyMergeLockBusyToastThrottled(p.id, proj.name);
          lastErr = { message: 'merge_locked' };
          continue;
        }
      } else if (lockErr && !isCollabRevisionRpcMissing(lockErr) && import.meta.env.DEV) {
        console.warn('[pushProjectSlicesToOwners] plannode_project_collab_try_acquire_lock', lockErr.message);
      }

      try {
        const rpcName = useDeltaOnly
          ? 'plannode_workspace_merge_project_slice_deltas'
          : 'plannode_workspace_merge_project_slice';
        const rpcArgs = useDeltaOnly
          ? { p_workspace_user_id: src, p_project_id: p.id, p_project: meta, p_node_deltas: pushNodes, p_base_revision: baseRevision }
          : { p_workspace_user_id: src, p_project_id: p.id, p_project: meta, p_nodes: pushNodes, p_base_revision: baseRevision };
        const { error: mErr } = await supabase.rpc(rpcName, rpcArgs);
        if (!mErr) {
          lastErr = null;
          revisionHintFromStale = null;
          break;
        }
        lastErr = mErr;
        const msg = String(mErr.message ?? '');
        const det = String((mErr as { details?: string }).details ?? '');
        if (msg.includes('revision_stale') || det.includes('revision_stale')) {
          const hinted = parseStaleRevisionFromCollabError(mErr);
          if (hinted !== null) revisionHintFromStale = hinted;
          await recoverCollabProjectAfterRevisionStale(p.id);
          const dedupUntil = modalSavePushStaleToastDedupUntil.get(p.id) ?? 0;
          if (!revisionStaleNotifiedThisPush && Date.now() >= dedupUntil) {
            revisionStaleNotifiedThisPush = true;
            notifyRevisionStaleSyncedToastThrottled(p.id, proj.name);
          }
          continue;
        }
        if (msg.includes('merge_locked') || det.includes('merge_locked')) {
          notifyMergeLockBusyToastThrottled(p.id, proj.name);
          continue;
        }
      } finally {
        if (lockHeld) {
          const { error: relErr } = await supabase.rpc('plannode_project_collab_release_lock', {
            p_workspace_user_id: src,
            p_project_id: p.id
          });
          if (relErr && !isCollabRevisionRpcMissing(relErr) && import.meta.env.DEV) {
            console.warn('[pushProjectSlicesToOwners] plannode_project_collab_release_lock', relErr.message);
          }
        }
      }
    }
    if (lastErr) {
      console.warn(
        '[pushProjectSlicesToOwners] plannode_workspace_merge_project_slice',
        p.id,
        lastErr.message,
        (lastErr as { details?: string; code?: string }).details ?? '',
        (lastErr as { code?: string }).code ?? ''
      );
      warnMergeSliceThrottled(p.id, lastErr.message ?? '');
      if (!isMergeLockOrBusyError(lastErr)) {
        notifyMergeSliceFailureToastThrottled(p.id, p.name, lastErr);
      }
    }
  }
}

export type UploadWorkspaceResult = {
  ok: boolean;
  message: string;
  /** RPC `reason: conflict` 또는 재시도 한도 소진 */
  conflict?: boolean;
  /** E8-1 — conflict exhaustion 후 쿨다운 구간( dirty 유지 · RPC 생략) */
  conflictCooldown?: boolean;
};

/** COLLAB-PERF-2 E8-1 — conflict exhaustion 후 upload RPC 최소 간격 */
export const UPLOAD_CONFLICT_COOLDOWN_MS = 30_000;

let lastUploadConflictExhaustedAt = 0;

export function shouldDeferWorkspaceUploadDueToConflict(): boolean {
  return Date.now() - lastUploadConflictExhaustedAt < UPLOAD_CONFLICT_COOLDOWN_MS;
}

function recordUploadConflictExhausted(): void {
  lastUploadConflictExhaustedAt = Date.now();
}

function clearUploadConflictCooldown(): void {
  lastUploadConflictExhaustedAt = 0;
}

/** 로컬 전체 → Supabase 한 행 upsert(RPC 조건부 갱신 우선, 충돌 시 병합 후 최대 1회 재시도) */
export async function uploadWorkspaceToCloud(): Promise<UploadWorkspaceResult> {
  if (!isSupabaseCloudConfigured()) {
    return { ok: false, message: 'Supabase URL/키가 .env에 없어.' };
  }
  const { userId, error: authErr } = await requireSessionUserId();
  if (!userId) return { ok: false, message: authErr || '로그인 실패' };

  if (shouldDeferWorkspaceUploadDueToConflict()) {
    if (import.meta.env.DEV) {
      console.info('[uploadWorkspaceToCloud] conflict cooldown — upload deferred');
    }
    return {
      ok: false,
      message: '클라우드 버전 충돌. 잠시 후 다시 동기화할게.',
      conflict: true,
      conflictCooldown: true
    };
  }

  /** COLLAB-PERF-2 E7 — conflict 즉시 재시도 1회만 · 2회 실패 시 다음 틱 위임 */
  const MAX_ATTEMPTS = 2;
  let lastConflict = false;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await mergeRemoteWorkspaceBeforeUpload(userId);

    const excludedFromBundle = workspaceDeletedProjectSkipIds();
    const bundle = gatherWorkspaceBundle();
    for (const p of bundle.projects) {
      if (p.owner_user_id === userId) {
        const acl = await ensureOwnerAclRowForMyProject(p.id);
        if (!acl.ok && import.meta.env.DEV) {
          console.warn('[uploadWorkspaceToCloud] 소유자 ACL 보장 실패:', p.id, acl.message);
        }
      }
    }

    const payload = {
      user_id: userId,
      projects_json: bundle.projects,
      nodes_by_project_json: bundle.nodesByProject,
      updated_at: new Date().toISOString()
    };

    const { data: pre } = await supabase.from(TABLE).select('updated_at').eq('user_id', userId).maybeSingle();
    const expectedTs =
      pre && (pre as { updated_at?: string }).updated_at != null
        ? String((pre as { updated_at: string }).updated_at)
        : null;

    const { data: rpcData, error: rpcError } = await supabase.rpc('plannode_workspace_upsert_workspace_bundle', {
      p_projects_json: bundle.projects,
      p_nodes_by_project_json: bundle.nodesByProject,
      p_expected_server_updated_at: expectedTs
    });

    if (rpcError) {
      if (isWorkspaceUpsertRpcMissing(rpcError)) {
        const { error } = await supabase.from(TABLE).upsert(payload, { onConflict: 'user_id' });
        if (error) {
          markCloudWorkspaceFailed();
          if (isWorkspaceMissingOrCacheError(error)) {
            if (import.meta.env.DEV) {
              console.info('[plannode cloud upload] 워크스페이스 테이블·스키마 설정 필요(PGRST205). SQL 실행 후 NOTIFY 권장.');
            }
            return { ok: false, message: WORKSPACE_SETUP_MSG };
          }
          console.error('[plannode cloud upload]', error);
          return {
            ok: false,
            message:
              error.code === '42P01'
                ? '테이블이 없어. docs/supabase/plannode_workspace.sql 을 실행해줘.'
                : error.message
          };
        }
        await pushProjectSlicesToOwners(bundle, userId);
        await bumpOwnerCollabRevisionsAfterFallbackUpload(userId, bundle);
        try {
          localStorage.setItem(OWN_WORKSPACE_REMOTE_TS_KEY, payload.updated_at);
        } catch {
          /* ignore */
        }
        releaseDeletedProjectTombstonesAfterUpload(excludedFromBundle);
        clearPendingWorkspaceDeletions();
        markCloudWorkspaceSynced();
        scheduleAppendProjectWorkspaceHistoryAfterCloudUploadSuccess();
        return { ok: true, message: '클라우드에 올렸어 ✓' };
      }
      markCloudWorkspaceFailed();
      console.error('[plannode cloud upload] RPC', rpcError);
      return { ok: false, message: rpcError.message };
    }

    const res = rpcData as UpsertBundleRpcResult | null;
    if (res?.ok === false && res.reason === 'conflict') {
      lastConflict = true;
      if (attempt < MAX_ATTEMPTS - 1) continue;
      markCloudWorkspaceFailed();
      recordUploadConflictExhausted();
      if (import.meta.env.DEV) {
        console.info('[uploadWorkspaceToCloud] conflict — 재시도 한도, 다음 틱 위임');
      }
      return {
        ok: false,
        message: '클라우드 버전 충돌. 잠시 후 다시 동기화할게.',
        conflict: true
      };
    }

    if (!res?.ok) {
      markCloudWorkspaceFailed();
      return {
        ok: false,
        message: res?.reason === 'auth' ? '로그인 세션이 만료됐을 수 있어. 다시 로그인해줘.' : '클라우드 저장에 실패했어.'
      };
    }

    const serverTs = res.server_updated_at != null && String(res.server_updated_at) ? String(res.server_updated_at) : payload.updated_at;
    applyOwnerCollabRevisionBumps(userId, parseCollabRevisionBumps(res.collab_revision_bumps));
    await pushProjectSlicesToOwners(bundle, userId);
    try {
      localStorage.setItem(OWN_WORKSPACE_REMOTE_TS_KEY, serverTs);
    } catch {
      /* ignore */
    }
    releaseDeletedProjectTombstonesAfterUpload(excludedFromBundle);
    clearPendingWorkspaceDeletions();
    markCloudWorkspaceSynced();
    clearUploadConflictCooldown();
    if (lastConflict && import.meta.env.DEV) {
      console.info('[uploadWorkspaceToCloud] 충돌 후 재병합·재시도로 저장 완료.');
    }
    scheduleAppendProjectWorkspaceHistoryAfterCloudUploadSuccess();
    return { ok: true, message: '클라우드에 올렸어 ✓' };
  }

  markCloudWorkspaceFailed();
  if (lastConflict) {
    recordUploadConflictExhausted();
    return {
      ok: false,
      message: '클라우드 버전 충돌. 잠시 후 다시 동기화할게.',
      conflict: true
    };
  }
  return { ok: false, message: '클라우드 저장 재시도 한도를 넘었어. 잠시 후 다시 시도해줘.' };
}

/** Supabase → 로컬 교체 후 첫 프로젝트 열기 */
export async function downloadWorkspaceFromCloud(): Promise<{ ok: boolean; message: string }> {
  if (!isSupabaseCloudConfigured()) {
    return { ok: false, message: 'Supabase URL/키가 .env에 없어.' };
  }
  const { userId, error: authErr } = await requireSessionUserId();
  if (!userId) return { ok: false, message: authErr || '로그인 실패' };

  const { data, error } = await supabase
    .from(TABLE)
    .select('projects_json, nodes_by_project_json, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (isWorkspaceMissingOrCacheError(error)) {
      if (import.meta.env.DEV) console.info('[plannode cloud download] 워크스페이스 테이블·스키마 설정 필요(PGRST205).');
      return { ok: false, message: WORKSPACE_SETUP_MSG };
    }
    console.error('[plannode cloud download]', error);
    return { ok: false, message: error.message };
  }
  if (!data) {
    return { ok: false, message: '클라우드에 저장된 데이터가 없어. 먼저 올려줘.' };
  }

  const bundle = normalizeBundle(data as { projects_json: unknown; nodes_by_project_json: unknown });
  if (!bundle) {
    return { ok: false, message: '클라우드 데이터 형식이 맞지 않아.' };
  }

  replaceWorkspaceFromBundle(bundle);
  const rowTs = (data as { updated_at?: string }).updated_at;
  if (typeof rowTs === 'string' && rowTs) {
    try {
      localStorage.setItem(OWN_WORKSPACE_REMOTE_TS_KEY, rowTs);
    } catch {
      /* ignore */
    }
  }
  if (bundle.projects.length > 0) {
    let opened = false;
    for (const p of bundle.projects) {
      const r = await trySelectProject(p);
      if (r.ok) {
        opened = true;
        break;
      }
    }
    if (!opened) {
      return {
        ok: true,
        message: '클라우드에서 받았어 ✓ (접근 허용된 프로젝트가 없어 자동으로 열지 못했어. 목록에서 선택해줘.)'
      };
    }
  }
  return { ok: true, message: '클라우드에서 받았어 ✓' };
}

/** 모달 카드용: `plannode_workspace.projects_json` 만 조회(노드 번들 없음). 네트워크·RPC 오류 시 `ok: false`. */
export async function fetchOwnWorkspaceProjectMetasForModal(): Promise<{
  ok: boolean;
  projects: Project[];
}> {
  if (typeof window === 'undefined' || !isSupabaseCloudConfigured()) return { ok: true, projects: [] };
  const { userId } = await requireSessionUserId();
  if (!userId) return { ok: true, projects: [] };

  const { data, error } = await supabase.from(TABLE).select('projects_json').eq('user_id', userId).maybeSingle();

  if (error) {
    if (import.meta.env.DEV) console.warn('[fetchOwnWorkspaceProjectMetasForModal]', error.message);
    return { ok: false, projects: [] };
  }
  if (!data) return { ok: true, projects: [] };
  const pj = (data as { projects_json?: unknown }).projects_json;
  return { ok: true, projects: Array.isArray(pj) ? (pj as Project[]) : [] };
}

/** 내 워크스페이스 행이 서버에서 바뀌었으면 프로젝트별 LWW로 로컬에 합침 */
export async function pullOwnWorkspaceIfChanged(): Promise<number> {
  if (typeof window === 'undefined' || !isSupabaseCloudConfigured()) return 0;
  const { userId } = await requireSessionUserId();
  if (!userId) return 0;

  const { data, error } = await supabase
    .from(TABLE)
    .select('updated_at, projects_json, nodes_by_project_json')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return 0;

  const remoteTs = String((data as { updated_at?: string }).updated_at ?? '');
  let prev = '';
  try {
    prev = localStorage.getItem(OWN_WORKSPACE_REMOTE_TS_KEY) ?? '';
  } catch {
    prev = '';
  }
  if (!remoteTs || prev === remoteTs) return 0;

  if (import.meta.env.DEV) {
    console.info('[pullOwnWorkspaceIfChanged] workspace row ts advance', { prevCached: prev, remoteTs });
  }

  const bundle = normalizeBundle(data as { projects_json: unknown; nodes_by_project_json: unknown });
  if (!bundle) return 0;

  const n = mergeWorkspaceBundleFromCloudRemote(bundle);
  try {
    localStorage.setItem(OWN_WORKSPACE_REMOTE_TS_KEY, remoteTs);
  } catch {
    /* ignore */
  }
  return n;
}

/** NOW-43: 로컬·캐시 갱신 없이 내 `plannode_workspace` 번들만 조회 */
export async function fetchOwnWorkspaceBundleFresh(): Promise<WorkspaceBundle | null> {
  if (typeof window === 'undefined' || !isSupabaseCloudConfigured()) return null;
  const { userId } = await requireSessionUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select('projects_json, nodes_by_project_json')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return normalizeBundle(data as { projects_json: unknown; nodes_by_project_json: unknown });
}

/**
 * 공유 프로젝트 1건: 소유자 슬라이스가 더 최신일 때 노드·메타 LWW 반영 (`pullSharedProjectSlicesIfNewer`와 동일 규칙).
 * @returns 로컬에 실제 변경이 있었으면 true
 */
export async function mergeSharedProjectSliceFromCloudIfApplicable(local: Project): Promise<boolean> {
  if (typeof window === 'undefined' || !isSupabaseCloudConfigured()) return false;
  const uid = getAuthUserId();
  if (!uid) return false;
  const localRef = get(projects).find((p) => p.id === local.id) ?? local;
  const src = localRef.cloud_workspace_source_user_id;
  if (!src || src === uid) return false;

  if (getDeletedProjectTombstoneIds().has(localRef.id)) return false;

  maybeFlushPilotBeforeCollabMerge(localRef.id);

  const slice = await fetchProjectSliceForCollabAssess(src, localRef.id);
  if (!slice) return false;
  // pull 직후 push가 재사용할 수 있도록 단기 캐시에 저장
  setPullPushSliceCache(src, localRef.id, slice);

  const parseTs = (iso: string | undefined): number => {
    const t = Date.parse(String(iso ?? ''));
    return Number.isFinite(t) ? t : 0;
  };

  const rTime = parseTs(slice.project.updated_at);
  const lTime = parseTs(localRef.updated_at);
  const remoteMetaNewer = rTime > lTime;
  const preMergeLocal = loadLocalNodesForCollabMerge(localRef.id);
  const remoteHash = projectWorkspaceNodesJsonSnapshot(slice.nodes);
  const localHash = projectWorkspaceNodesJsonSnapshot(preMergeLocal);
  const mergedNodesRaw = mergeNodeListsForCloudByProjectMeta(
    preMergeLocal,
    slice.nodes,
    localRef.updated_at,
    slice.project.updated_at,
    localRef.id
  );
  const mergedNodes = unionCollabPreserveLocalNodes(localRef.id, preMergeLocal, mergedNodesRaw);
  const localNodes = preMergeLocal;
  const remoteProj = reconcileProjectRecord({
    ...slice.project,
    cloud_workspace_source_user_id: src
  });
  const mergedProject = mergeProjectMetaForCloudSync(
    reconcileProjectRecord({ ...localRef, cloud_workspace_source_user_id: src }),
    remoteProj
  );

  const nodesChanged = remoteHash !== localHash;
  const projectSettingsMetaSignature = (proj: Project): string =>
    JSON.stringify({
      name: proj.name,
      author: proj.author,
      start_date: proj.start_date,
      end_date: proj.end_date,
      description: proj.description ?? '',
      badge_pool: proj.badge_pool ?? null
    });
  const metaChanged =
    projectSettingsMetaSignature(mergedProject) !== projectSettingsMetaSignature(localRef);
  const projectTsChanged =
    remoteMetaNewer && String(mergedProject.updated_at || '') !== String(localRef.updated_at || '');

  if (!nodesChanged && !metaChanged && !projectTsChanged) return false;

  captureNodeSnapshot(localRef.id, localNodes, 'pre_pull');
  recordNodeDiffToChangeLog(localRef.id, preMergeLocal, mergedNodes);
  upsertImportedPlannodeTreeV1(mergedProject, mergedNodes, {
    openAfter: false,
    markDirty: false,
    preserveRemoteUpdatedAt: remoteMetaNewer
  });

  /** F-01: upsert가 nodes·localStorage 반영 — selectProject 중복 hydrate 제거, 메타만 patch */
  const curOpen = get(currentProject);
  if (curOpen?.id === localRef.id) {
    const ref = get(projects).find((p) => p.id === localRef.id);
    if (ref) currentProject.set(ref);
  }
  return true;
}

/**
 * 프로젝트 오픈 시 클라우드 슬라이스를 강제 fetch → 로컬과 버전 비교 후 앞선 버전 병합.
 * - 소유자 프로젝트: fetchProjectSliceFromCloud(uid, projectId) → mergeNodeListsForCloudByProjectMeta
 * - 멤버 프로젝트: mergeSharedProjectSliceFromCloudIfApplicable (기존 경로)
 * selectProject 호출 직전에 await하여 최신 노드를 localStorage에 반영한다.
 */
export async function pullProjectSliceBeforeOpen(project: Project): Promise<void> {
  if (typeof window === 'undefined' || !isSupabaseCloudConfigured()) return;
  const uid = getAuthUserId();
  if (!uid) return;

  const src = project.cloud_workspace_source_user_id;
  if (src && src !== uid) {
    // forceMerge 사용 금지 — forceMerge=true && revisionUnchanged 조합이 skipSliceMerge=true를 유발해
    // 오픈 경로에서 배지·슬라이스 변경이 반영되지 않음. P0 A/B/C meta drift 수정으로 충분.
    await pullCollabSliceForProject(project, 'open-pre-select');
    return;
  }

  // 소유자 프로젝트: 자신의 워크스페이스에서 이 프로젝트 슬라이스만 fetch·비교
  const localRef = get(projects).find((p) => p.id === project.id) ?? project;
  if (getDeletedProjectTombstoneIds().has(localRef.id)) return;

  maybeFlushPilotBeforeCollabMerge(localRef.id);
  const slice = await fetchProjectSliceFromCloud(uid, localRef.id);
  if (!slice) return;

  const parseTs = (iso: string | undefined): number => {
    const t = Date.parse(String(iso ?? ''));
    return Number.isFinite(t) ? t : 0;
  };

  const preMergeLocal = loadLocalNodesForCollabMerge(localRef.id);
  const remoteHash = projectWorkspaceNodesJsonSnapshot(slice.nodes);
  const localHash = projectWorkspaceNodesJsonSnapshot(preMergeLocal);
  if (remoteHash === localHash) return;

  const rTime = parseTs(slice.project.updated_at);
  const lTime = parseTs(localRef.updated_at);
  const remoteMetaNewer = rTime > lTime;

  const mergedNodes = mergeNodeListsForCloudByProjectMeta(
    preMergeLocal,
    slice.nodes,
    localRef.updated_at,
    slice.project.updated_at,
    localRef.id,
    false // 소유자 로컬 전용 노드 보존
  );
  const mergedProject = mergeProjectMetaForCloudSync(
    reconcileProjectRecord({ ...localRef }),
    reconcileProjectRecord({ ...slice.project })
  );

  recordNodeDiffToChangeLog(localRef.id, preMergeLocal, mergedNodes);
  upsertImportedPlannodeTreeV1(mergedProject, mergedNodes, {
    openAfter: false,
    markDirty: false,
    preserveRemoteUpdatedAt: remoteMetaNewer
  });

  // OWN_WORKSPACE_REMOTE_TS_KEY는 덮어쓰지 않음 — 전체 번들 pull 타이밍과 독립
}

const ENSURE_SLICE_BUSY_POLL_MS = 500;
const ENSURE_SLICE_BUSY_POLL_MAX = 4;
/** modal-save barrier 직후 push `revision_stale` 토스트 중복 억제 (Phase D6) */
const MODAL_SAVE_PUSH_STALE_TOAST_DEDUP_MS = 12_000;
const modalSavePushStaleToastDedupUntil = new Map<string, number>();

/** E14-2 — modal-save 2차 assess+rePull defer (1차 merge·upload D6 unchanged) */
const MODAL_SAVE_FRESH_RECHECK_POLL_MS = 250;
const MODAL_SAVE_FRESH_RECHECK_MAX_POLLS = 48;

let modalSaveFreshRecheckTimer: ReturnType<typeof setTimeout> | null = null;
let modalSaveFreshRecheckProjectId: string | null = null;

async function runModalSaveDeferredFreshRecheck(
  projectId: string,
  workspaceUserId: string,
  reason: string
): Promise<void> {
  if (typeof window === 'undefined' || !isSupabaseCloudConfigured()) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

  const ref = get(projects).find((p) => p.id === projectId);
  if (!ref) return;
  if (get(currentProject)?.id !== projectId) return;

  const src = ref.cloud_workspace_source_user_id;
  if (!src || src !== workspaceUserId) return;

  const fresh = await assessCollabSliceFreshness(ref, workspaceUserId);
  if (!fresh?.needsMerge) {
    if (import.meta.env.DEV) {
      console.info('[ensureCollabSliceFresh] deferred recheck — skip rev+hash ok', projectId);
    }
    return;
  }

  if (import.meta.env.DEV) {
    console.info('[ensureCollabSliceFresh] deferred rePull', {
      projectId,
      reason,
      trigger: 'modal-save-deferred',
      cachedRev: fresh.cachedRev,
      remoteRev: fresh.remoteRev,
      hashDiff: fresh.hashDiff,
      revDiff: fresh.revDiff
    });
  }
  await mergeCollabSliceFromFreshness(ref, `${reason}-rePull-deferred`, fresh);
}

async function runModalSaveDeferredFreshRecheckWhenIdle(
  projectId: string,
  workspaceUserId: string,
  reason: string,
  pollAttempt = 0
): Promise<void> {
  if (pollAttempt >= MODAL_SAVE_FRESH_RECHECK_MAX_POLLS) {
    if (import.meta.env.DEV) {
      console.info('[ensureCollabSliceFresh] deferred recheck — poll cap', projectId);
    }
    return;
  }
  if (await collabPullShouldDeferForInteraction()) {
    setTimeout(
      () => void runModalSaveDeferredFreshRecheckWhenIdle(projectId, workspaceUserId, reason, pollAttempt + 1),
      MODAL_SAVE_FRESH_RECHECK_POLL_MS
    );
    return;
  }
  await runModalSaveDeferredFreshRecheck(projectId, workspaceUserId, reason);
}

function scheduleModalSaveFreshRecheck(
  project: Project,
  workspaceUserId: string,
  reason: string
): void {
  if (typeof window === 'undefined') return;

  if (modalSaveFreshRecheckTimer && modalSaveFreshRecheckProjectId === project.id) {
    clearTimeout(modalSaveFreshRecheckTimer);
  }
  modalSaveFreshRecheckProjectId = project.id;

  modalSaveFreshRecheckTimer = setTimeout(() => {
    modalSaveFreshRecheckTimer = null;
    modalSaveFreshRecheckProjectId = null;
    void runModalSaveDeferredFreshRecheckWhenIdle(project.id, workspaceUserId, reason);
  }, 0);

  if (import.meta.env.DEV) {
    console.info('[ensureCollabSliceFresh] schedule deferred recheck', project.id);
  }
}

type CollabSliceFreshness = {
  remoteRev: number | null;
  cachedRev: number | null;
  localHash: string;
  remoteHash: string;
  revDiff: boolean;
  hashDiff: boolean;
  needsMerge: boolean;
};

/** E14-1 — rev 일치 시 slice fetch 생략용 (full assess 후 갱신) */
const collabRemoteHashAtRevisionCache = new Map<string, { revision: number; remoteHash: string }>();

function collabRemoteHashCacheKey(workspaceUserId: string, projectId: string): string {
  return `${workspaceUserId}:${projectId}`;
}

function rememberCollabRemoteHashAtRevision(
  workspaceUserId: string,
  projectId: string,
  revision: number | null,
  remoteHash: string
): void {
  if (revision === null) return;
  collabRemoteHashAtRevisionCache.set(collabRemoteHashCacheKey(workspaceUserId, projectId), {
    revision,
    remoteHash
  });
}

/** E14-4 — modal-save assess·merge 경로 slice fetch ≤2s 결과 재사용 (E4-2 in-flight + completed) */
const MODAL_SLICE_FETCH_RECENT_TTL_MS = 2_000;
type ProjectSliceFetchResult = Awaited<ReturnType<typeof fetchProjectSliceFromCloud>>;

/** pull→push 동일 사이클 내 슬라이스 이중 fetch 제거 — 8s TTL (push는 pull 직후 수행) */
const PULL_PUSH_SLICE_CACHE_TTL_MS = 8_000;
const pullPushSliceCache = new Map<string, { result: ProjectSliceFetchResult; at: number }>();

function setPullPushSliceCache(workspaceUserId: string, projectId: string, result: ProjectSliceFetchResult): void {
  pullPushSliceCache.set(`${workspaceUserId}:${projectId}`, { result, at: Date.now() });
}

function getPullPushSliceCache(workspaceUserId: string, projectId: string): ProjectSliceFetchResult | null {
  const key = `${workspaceUserId}:${projectId}`;
  const entry = pullPushSliceCache.get(key);
  if (!entry || Date.now() - entry.at > PULL_PUSH_SLICE_CACHE_TTL_MS) {
    pullPushSliceCache.delete(key);
    return null;
  }
  return entry.result;
}

type RecentModalSliceFetchEntry = {
  promise: Promise<ProjectSliceFetchResult>;
  result?: ProjectSliceFetchResult;
  fetchedAt: number;
};

const recentModalSliceFetch = new Map<string, RecentModalSliceFetchEntry>();
let modalSaveSliceCacheProjectId: string | null = null;

function modalSliceFetchRecentKey(workspaceUserId: string, projectId: string): string {
  return `${workspaceUserId}:${projectId}`;
}

async function fetchProjectSliceFromCloudRecentForModalSave(
  workspaceUserId: string,
  projectId: string
): Promise<ProjectSliceFetchResult> {
  const key = modalSliceFetchRecentKey(workspaceUserId, projectId);
  const now = Date.now();
  const existing = recentModalSliceFetch.get(key);

  if (existing) {
    const age = now - existing.fetchedAt;
    if (existing.result !== undefined && age <= MODAL_SLICE_FETCH_RECENT_TTL_MS) {
      if (import.meta.env.DEV) {
        console.info('[fetchProjectSliceFromCloud] recent cache hit (E14-4)', {
          projectId,
          ageMs: age
        });
      }
      return existing.result;
    }
    if (existing.result === undefined && age <= MODAL_SLICE_FETCH_RECENT_TTL_MS) {
      if (import.meta.env.DEV) {
        console.info('[fetchProjectSliceFromCloud] recent in-flight join (E14-4)', { projectId });
      }
      return existing.promise;
    }
  }

  const entry: RecentModalSliceFetchEntry = {
    promise: Promise.resolve(null),
    fetchedAt: now
  };
  const promise = fetchProjectSliceFromCloud(workspaceUserId, projectId).then((result) => {
    entry.result = result;
    entry.fetchedAt = Date.now();
    return result;
  });
  entry.promise = promise;
  recentModalSliceFetch.set(key, entry);

  return promise;
}

function fetchProjectSliceForCollabAssess(
  workspaceUserId: string,
  projectId: string
): Promise<ProjectSliceFetchResult> {
  if (modalSaveSliceCacheProjectId === projectId) {
    return fetchProjectSliceFromCloudRecentForModalSave(workspaceUserId, projectId);
  }
  return fetchProjectSliceFromCloud(workspaceUserId, projectId);
}

async function assessCollabSliceFreshness(
  project: Project,
  workspaceUserId: string
): Promise<CollabSliceFreshness | null> {
  const localNodes = loadLocalNodesForCollabMerge(project.id);
  const localHash = projectWorkspaceNodesJsonSnapshot(localNodes);
  const cachedRev = getCachedCollabRevision(workspaceUserId, project.id);
  const hashCacheKey = collabRemoteHashCacheKey(workspaceUserId, project.id);

  const remoteRev = await fetchCollabRevision(workspaceUserId, project.id);
  if (remoteRev === null) return null;

  const revDiff = cachedRev !== null && cachedRev !== remoteRev;
  const hasPendingOps = hasPendingStructureOpsPersistForProject(project.id, workspaceUserId);

  if (!revDiff && cachedRev !== null && !hasPendingOps) {
    const cachedRemote = collabRemoteHashAtRevisionCache.get(hashCacheKey);
    if (cachedRemote && cachedRemote.revision === remoteRev && localHash === cachedRemote.remoteHash) {
      if (import.meta.env.DEV) {
        console.info('[assessCollabSliceFreshness] rev+hash cache ok — skip slice fetch', project.id);
      }
      return {
        remoteRev,
        cachedRev,
        localHash,
        remoteHash: cachedRemote.remoteHash,
        revDiff: false,
        hashDiff: false,
        needsMerge: false
      };
    }
  }

  const slice = await fetchProjectSliceForCollabAssess(workspaceUserId, project.id);
  if (!slice) return null;

  const remoteHash = projectWorkspaceNodesJsonSnapshot(slice.nodes ?? []);
  rememberCollabRemoteHashAtRevision(workspaceUserId, project.id, remoteRev, remoteHash);

  const hashDiff = localHash !== remoteHash;
  return {
    remoteRev,
    cachedRev,
    localHash,
    remoteHash,
    revDiff,
    hashDiff,
    needsMerge: revDiff || hashDiff
  };
}

async function mergeCollabSliceFromFreshness(
  project: Project,
  reason: string,
  fresh: CollabSliceFreshness
): Promise<boolean> {
  const ref = get(projects).find((p) => p.id === project.id) ?? project;
  return pullCollabSliceForProject(ref, reason, {
    knownRemoteRevision: fresh.remoteRev,
    forceMerge: fresh.hashDiff && !fresh.revDiff
  });
}

/** E14-3 — modal-save ops-first: `pullStructureOpsForProject` 후 slice assess 생략 가능 시 `{ merged }` */
async function tryModalSaveOpsFirstSkipSliceAssess(
  project: Project,
  workspaceUserId: string
): Promise<{ merged: boolean } | null> {
  const remoteRev = await fetchCollabRevision(workspaceUserId, project.id);
  if (remoteRev === null) return null;

  const cachedRev = getCachedCollabRevision(workspaceUserId, project.id);
  const ref = get(projects).find((p) => p.id === project.id) ?? project;
  const opsResult = await pullStructureOpsForProject(ref);
  const revisionUnchanged = cachedRev !== null && cachedRev === remoteRev;

  const skipSliceAssess = collabPullCanSkipSliceMergeAfterOpsPull(ref.id, workspaceUserId, opsResult, {
    revisionUnchanged
  });

  if (import.meta.env.DEV) {
    console.info('[ensureCollabSliceFresh] ops-first', {
      projectId: project.id,
      skipSliceAssess,
      applied: opsResult.applied,
      revisionUnchanged,
      cachedRev,
      remoteRev
    });
  }

  if (!skipSliceAssess) return null;

  if (import.meta.env.DEV) {
    console.info('[ensureCollabSliceFresh] ops-first — skip slice assess', project.id);
  }

  return { merged: opsResult.applied > 0 };
}

async function waitForCloudBidirectionalSyncIdle(
  maxMs = ENSURE_SLICE_BUSY_POLL_MS * ENSURE_SLICE_BUSY_POLL_MAX,
  opts?: { noWait?: boolean }
): Promise<boolean> {
  const { isCloudBidirectionalSyncBusy } = await import('$lib/supabase/workspacePush');
  if (opts?.noWait) return !isCloudBidirectionalSyncBusy();
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (!isCloudBidirectionalSyncBusy()) return true;
    await new Promise((r) => setTimeout(r, ENSURE_SLICE_BUSY_POLL_MS));
  }
  return !isCloudBidirectionalSyncBusy();
}

/**
 * 모달 저장 직전: 공유 슬라이스 revision + hash freshness 확보 후 merge (Phase D · D5).
 * revision 같아도 slice hash 불일치면 merge.
 */
export async function ensureCollabSliceFreshBeforePersist(
  project: Project,
  reason = 'modal-save'
): Promise<{ ok: boolean; merged: boolean; reason?: string }> {
  if (typeof window === 'undefined' || !isSupabaseCloudConfigured()) {
    return { ok: true, merged: false };
  }
  const uid = getAuthUserId();
  if (!uid || !project?.id) return { ok: true, merged: false };

  const src = project.cloud_workspace_source_user_id;
  if (!src || src === uid) return { ok: true, merged: false };

  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return { ok: false, merged: false, reason: 'hidden' };
  }

  const modalSaveBarrier = reason.startsWith('modal-save');

  if (!(await waitForCloudBidirectionalSyncIdle(undefined, { noWait: modalSaveBarrier }))) {
    /** modal-save: 저장 자체를 막지 않음 — push 직전 re-pull(D6)·revision retry가 보완 */
    if (modalSaveBarrier) {
      if (import.meta.env.DEV) {
        console.info('[ensureCollabSliceFresh] skip busy — modal-save non-blocking', project.id);
      }
      return { ok: true, merged: false, reason: 'busy-skipped' };
    }
    return { ok: false, merged: false, reason: 'busy' };
  }

  maybeFlushPilotBeforeCollabMerge(project.id);

  const workspaceUserId = src;
  const useModalSliceRecentCache = modalSaveBarrier;
  if (useModalSliceRecentCache) modalSaveSliceCacheProjectId = project.id;

  try {
    if (modalSaveBarrier) {
      const opsFirst = await tryModalSaveOpsFirstSkipSliceAssess(project, workspaceUserId);
      if (opsFirst) {
        if (opsFirst.merged) {
          /** E14-2: ops 적용 후에만 deferred recheck — revision-only skip은 assess no-merge와 동일 */
          scheduleModalSaveFreshRecheck(project, workspaceUserId, reason);
        }
        modalSavePushStaleToastDedupUntil.set(
          project.id,
          Date.now() + MODAL_SAVE_PUSH_STALE_TOAST_DEDUP_MS
        );
        return {
          ok: true,
          merged: opsFirst.merged,
          reason: opsFirst.merged ? 'ops-first-applied' : 'ops-first-skip'
        };
      }
    }

    let fresh = await assessCollabSliceFreshness(project, workspaceUserId);
    if (!fresh) {
      if (modalSaveBarrier) {
        if (import.meta.env.DEV) {
          console.info('[ensureCollabSliceFresh] skip slice-fetch — modal-save non-blocking', project.id);
        }
        return { ok: true, merged: false, reason: 'slice-fetch-skipped' };
      }
      return { ok: false, merged: false, reason: 'slice-fetch' };
    }

    if (import.meta.env.DEV) {
      console.info('[ensureCollabSliceFresh]', {
        projectId: project.id,
        reason,
        cachedRev: fresh.cachedRev,
        remoteRev: fresh.remoteRev,
        localHash: fresh.localHash,
        remoteHash: fresh.remoteHash,
        needsMerge: fresh.needsMerge
      });
    }

    if (!fresh.needsMerge) {
      if (import.meta.env.DEV) {
        console.info('[ensureCollabSliceFresh] skip rev+hash ok');
      }
      return { ok: true, merged: false };
    }

    let merged = await mergeCollabSliceFromFreshness(project, reason, fresh);

    if (modalSaveBarrier) {
      /** E14-2: 2차 assess+rePull은 저장 UI(모달 닫힘) 후 defer — upload D6 rePull unchanged */
      scheduleModalSaveFreshRecheck(project, workspaceUserId, reason);
    } else {
      /** D6: 1차 merge 직후 재평가 — 동시 저장으로 revision/hash가 다시 어긋나면 pull 1회만 */
      fresh = await assessCollabSliceFreshness(project, workspaceUserId);
      if (fresh?.needsMerge) {
        if (import.meta.env.DEV) {
          console.info('[ensureCollabSliceFresh] rePull', {
            projectId: project.id,
            reason,
            trigger: 'revision_stale-path',
            cachedRev: fresh.cachedRev,
            remoteRev: fresh.remoteRev,
            hashDiff: fresh.hashDiff,
            revDiff: fresh.revDiff
          });
        }
        const reMerged = await mergeCollabSliceFromFreshness(project, `${reason}-rePull`, fresh);
        merged = merged || reMerged;
      }
    }

    if (reason.startsWith('modal-save')) {
      modalSavePushStaleToastDedupUntil.set(
        project.id,
        Date.now() + MODAL_SAVE_PUSH_STALE_TOAST_DEDUP_MS
      );
    }

    return { ok: true, merged };
  } finally {
    if (useModalSliceRecentCache && modalSaveSliceCacheProjectId === project.id) {
      modalSaveSliceCacheProjectId = null;
    }
  }
}

/**
 * collab_meta.revision 신호·폴백 poll 전용 pull-only (업로드·`runBidirectionalCloudSync` 없음).
 * 멤버(`cloud_workspace_source_user_id` ≠ 본인): `mergeSharedProjectSliceFromCloudIfApplicable`
 * 소유자(출처 없음 또는 본인 uid): `pullOwnWorkspaceIfChanged` + 현재 프로젝트면 `selectProject`
 */
const _pullCollabSliceInFlight = new Map<string, Promise<boolean>>();

export async function pullCollabSliceForProject(
  project: Project,
  reason: string,
  opts?: { knownRemoteRevision?: number | null; forceMerge?: boolean }
): Promise<boolean> {
  if (typeof window === 'undefined' || !isSupabaseCloudConfigured()) return false;
  const uid = getAuthUserId();
  if (!uid || !project?.id) return false;

  const workspaceUserId = project.cloud_workspace_source_user_id ?? uid;

  // 동일 프로젝트 concurrent pull 중복 방지 — revision 변경 시 두 경로 동시 호출 대비
  // forceMerge는 dedup 제외 (강제 재pull 의도)
  if (!opts?.forceMerge) {
    const key = `${workspaceUserId}:${project.id}`;
    const inflight = _pullCollabSliceInFlight.get(key);
    if (inflight) return inflight;
    const run = _pullCollabSliceForProjectInner(project, reason, opts, uid, workspaceUserId);
    _pullCollabSliceInFlight.set(key, run);
    try {
      return await run;
    } finally {
      if (_pullCollabSliceInFlight.get(key) === run) _pullCollabSliceInFlight.delete(key);
    }
  }
  return _pullCollabSliceForProjectInner(project, reason, opts, uid, workspaceUserId);
}

async function _pullCollabSliceForProjectInner(
  project: Project,
  reason: string,
  opts: { knownRemoteRevision?: number | null; forceMerge?: boolean } | undefined,
  uid: string,
  workspaceUserId: string
): Promise<boolean> {
  // ACL 없는 고아 프로젝트: 이미 세션 내 forbidden 확인 → skip
  if (isCollabProjectForbidden(workspaceUserId, project.id)) return false;

  const remoteRev =
    opts?.knownRemoteRevision != null
      ? opts.knownRemoteRevision
      : await fetchCollabRevision(workspaceUserId, project.id);
  const cachedRev = getCachedCollabRevision(workspaceUserId, project.id);

  if (remoteRev !== null) {
    const cached = cachedRev;
    if (!opts?.forceMerge && cached !== null && cached === remoteRev) {
      const light = await assessCollabPullByRevisionAndOpsAck(
        workspaceUserId,
        project.id,
        remoteRev,
        cached
      );
      if (!light.pullNeeded) {
        if (import.meta.env.DEV) {
          console.info('[collab-diag] pullCollabSliceForProject skip', {
            projectId: project.id,
            reason,
            cachedRev,
            remoteRev,
            willSkipRev: true,
            hashEqual: true,
            viaRevisionOpsAck: true,
            ackSeq: light.ackSeq,
            lastAppliedSeq: light.lastAppliedSeq
          });
        }
        return false;
      }
      if (!light.viaLightweight) {
        const hashDiffers = await collabRemoteSliceHashDiffers(workspaceUserId, project.id);
        if (!hashDiffers) {
          if (import.meta.env.DEV) {
            console.info('[collab-diag] pullCollabSliceForProject skip', {
              projectId: project.id,
              reason,
              cachedRev,
              remoteRev,
              willSkipRev: true,
              hashEqual: true,
              viaRevisionOpsAck: false
            });
          }
          return false;
        }
      }
    }
  }

  if (import.meta.env.DEV) {
    const cur = get(currentProject);
    const localNodes =
      cur?.id === project.id ? get(nodes) : loadProjectNodesFromLocalStorage(project.id);
    const localSnapHash = projectWorkspaceNodesJsonSnapshot(localNodes);
    const willSkipRev =
      !opts?.forceMerge && remoteRev !== null && cachedRev !== null && cachedRev === remoteRev;
    console.info('[collab-diag] pullCollabSliceForProject', {
      projectId: project.id,
      reason,
      cachedRev,
      remoteRev,
      willSkipRev,
      localSnapHash,
      hashEqual: null,
      note: 'skip 판정 이후 — remote slice fetch 생략 (E2)'
    });
  }

  const src = project.cloud_workspace_source_user_id;
  let changed = false;
  let sliceMerged = false;
  let memberOpsResult: StructureOpsPullResult | null = null;
  if (src && src !== uid) {
    const ref = get(projects).find((p) => p.id === project.id) ?? project;
    const opsResult = await pullStructureOpsForProject(ref);
    memberOpsResult = opsResult;
    if (opsResult.applied > 0) changed = true;

    const revisionUnchanged =
      remoteRev !== null && cachedRev !== null && cachedRev === remoteRev;
    const skipSliceMerge =
      (opts?.forceMerge === true && revisionUnchanged) ||
      collabPullCanSkipSliceMergeAfterOpsPull(ref.id, src, opsResult, { revisionUnchanged });

    if (!skipSliceMerge) {
      const merged = await mergeSharedProjectSliceFromCloudIfApplicable(ref);
      if (merged) {
        changed = true;
        sliceMerged = true;
      }
    } else if (import.meta.env.DEV) {
      console.info('[collab-diag] pullCollabSliceForProject skip slice merge', {
        projectId: project.id,
        reason,
        applied: opsResult.applied,
        revisionUnchanged,
        forceMergeOpsOnly: opts?.forceMerge === true && revisionUnchanged
      });
    }
  } else {
    const n = await pullOwnWorkspaceIfChanged();
    changed = n > 0;
    if (changed) {
      const cur = get(currentProject);
      if (cur?.id === project.id) {
        const ref = get(projects).find((p) => p.id === project.id);
        if (ref) selectProject(ref);
      }
    }
  }

  if (remoteRev !== null) {
    const hashDiffersAfter =
      memberOpsResult != null
        ? await collabSliceOutOfSyncAfterPull(
            workspaceUserId,
            project.id,
            memberOpsResult,
            sliceMerged
          )
        : await collabRemoteSliceHashDiffers(workspaceUserId, project.id);
    if (!hashDiffersAfter) {
      resetCollabHashMismatchPollStreak(workspaceUserId, project.id);
    }
    markCollabRevisionCachedIfSynced(
      workspaceUserId,
      project.id,
      remoteRev,
      changed,
      hashDiffersAfter
    );
  } else if (changed) {
    const revAfter = await fetchCollabRevision(workspaceUserId, project.id);
    if (revAfter !== null) setCachedCollabRevision(workspaceUserId, project.id, revAfter);
  }

  if (import.meta.env.DEV && changed) {
    console.info('[pullCollabSliceForProject]', { projectId: project.id, reason, workspaceUserId });
  }
  return changed;
}

/** COLLAB-PERF-2 E4-1 — drag/zoom/모달 중 collab pull defer (hydrate defer와 동일 조건 · CANVAS_INTERACTION_DEFER 확장) */
type PendingCollabPull =
  | { mode: 'poll'; projectId: string }
  | { mode: 'revision-flush'; projectId: string; reason: string; revisionHint: number | null };

let pendingCollabPull: PendingCollabPull | null = null;
let collabPullDeferBypass = false;

async function collabPullShouldDeferForInteraction(): Promise<boolean> {
  if (collabPullDeferBypass || typeof window === 'undefined') return false;
  const { pilotShouldDeferCollabPull } = await import('$lib/pilot/pilotBridge');
  return pilotShouldDeferCollabPull();
}

function queuePendingCollabPull(entry: PendingCollabPull): void {
  pendingCollabPull = entry;
  if (import.meta.env.DEV) {
    console.info('[collab-pull-defer] queued', entry);
  }
}

/** pointerup · wheel idle · 모달 닫힘 · `pilotFlushPendingStoreHydrate` 시 1회 flush */
export function flushPendingCollabPull(): void {
  const pending = pendingCollabPull;
  pendingCollabPull = null;
  if (!pending) return;
  if (get(currentProject)?.id !== pending.projectId) return;

  collabPullDeferBypass = true;
  try {
    const ref = get(projects).find((p) => p.id === pending.projectId);
    if (!ref) return;
    if (pending.mode === 'poll') {
      void pollCollabRevisionFallback(ref);
    } else {
      void flushCollabRevisionPull(pending.projectId, pending.reason, pending.revisionHint);
    }
    if (import.meta.env.DEV) {
      console.info('[collab-pull-defer] flushed', pending);
    }
  } finally {
    collabPullDeferBypass = false;
  }
}

/** Realtime 누락·미배포 SQL 대비 — revision 변경 시 pull-only; hash mismatch 연속 N회 시 poll skip (P0-02) */
export async function pollCollabRevisionFallback(project: Project): Promise<boolean> {
  if (typeof window === 'undefined' || !isSupabaseCloudConfigured()) return false;
  const uid = getAuthUserId();
  if (!uid || !project?.id) return false;

  if (await collabPullShouldDeferForInteraction()) {
    queuePendingCollabPull({ mode: 'poll', projectId: project.id });
    return false;
  }

  const workspaceUserId = project.cloud_workspace_source_user_id ?? uid;
  const remoteRev = await fetchCollabRevision(workspaceUserId, project.id);
  if (remoteRev === null) return false;

  const cached = getCachedCollabRevision(workspaceUserId, project.id);
  const streakKey = collabRevisionCacheKey(workspaceUserId, project.id);

  if (cached !== null && cached !== remoteRev) {
    resetCollabHashMismatchPollStreak(workspaceUserId, project.id);
  }

  if (cached !== null && cached === remoteRev) {
    const light = await assessCollabPullByRevisionAndOpsAck(
      workspaceUserId,
      project.id,
      remoteRev,
      cached
    );
    if (!light.pullNeeded) {
      resetCollabHashMismatchPollStreak(workspaceUserId, project.id);
      return false;
    }

    if (!light.viaLightweight) {
      const streak = collabHashMismatchPollStreak.get(streakKey) ?? 0;
      if (streak >= COLLAB_HASH_MISMATCH_MAX_POLL_STREAK) {
        if (import.meta.env.DEV) {
          console.info('[pollCollabRevisionFallback] poll paused (hash mismatch streak)', {
            projectId: project.id,
            streak
          });
        }
        return false;
      }

      const hashDiffers = await collabRemoteSliceHashDiffers(workspaceUserId, project.id);
      if (!hashDiffers) {
        resetCollabHashMismatchPollStreak(workspaceUserId, project.id);
        return false;
      }

      const nextStreak = streak + 1;
      collabHashMismatchPollStreak.set(streakKey, nextStreak);
      // [Fix-6] 중간 임계값에서 자동 복구 pull 시도 — 경쟁 조건 해소
      if (nextStreak === COLLAB_HASH_MISMATCH_AUTO_RECOVER_AT) {
        if (import.meta.env.DEV) {
          console.info('[pollCollabRevisionFallback] hash mismatch auto-recover pull', {
            projectId: project.id,
            streak: nextStreak
          });
        }
        const ref = get(projects).find((p) => p.id === project.id) ?? project;
        const recovered = await pullCollabSliceForProject(ref, 'hash-mismatch-recovery', {
          knownRemoteRevision: remoteRev
        });
        if (recovered) {
          resetCollabHashMismatchPollStreak(workspaceUserId, project.id);
          return true;
        }
      }
      if (nextStreak >= COLLAB_HASH_MISMATCH_MAX_POLL_STREAK) {
        notifyCollabPollPausedManualSyncToast(project.id, project.name);
        if (import.meta.env.DEV) {
          console.info('[pollCollabRevisionFallback] poll paused after hash streak', {
            projectId: project.id,
            streak: nextStreak
          });
        }
        return false;
      }
    } else if (!light.pendingOpsSinceAck) {
      const ref = get(projects).find((p) => p.id === project.id) ?? project;
      return pullCollabSliceForProject(ref, 'collab-rev-poll', {
        knownRemoteRevision: remoteRev
      });
    }
  }

  const ref = get(projects).find((p) => p.id === project.id) ?? project;
  const revChanged = cached === null || cached !== remoteRev;

  if (revChanged) {
    return pullCollabSliceForProject(ref, 'collab-rev-poll', {
      knownRemoteRevision: remoteRev
    });
  }

  /** COLLAB-PERF P1-01 — revision 동일·hash 불일치: structure_ops만, full slice merge 생략 */
  const opsResult = await pullStructureOpsForProject(ref);
  const hashDiffersAfter = await collabSliceOutOfSyncAfterPull(
    workspaceUserId,
    project.id,
    opsResult,
    false
  );
  if (!hashDiffersAfter) {
    resetCollabHashMismatchPollStreak(workspaceUserId, project.id);
    setCachedCollabRevision(workspaceUserId, project.id, remoteRev);
  }
  if (import.meta.env.DEV) {
    console.info('[pollCollabRevisionFallback] hash-only ops pull', {
      projectId: project.id,
      applied: opsResult.applied,
      hashDiffersAfter
    });
  }
  return opsResult.applied > 0 || !hashDiffersAfter;
}

const COLLAB_REV_PULL_DEBOUNCE_MS = 200;
const COLLAB_REV_BUSY_RETRY_MS = 500;
const COLLAB_REV_BUSY_RETRY_MAX = 4;

let collabRevisionChannel: ReturnType<typeof supabase.channel> | null = null;
let collabRevisionDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let collabRevisionBusyRetryTimer: ReturnType<typeof setTimeout> | null = null;
let collabRevisionBusyRetryCount = 0;

function clearCollabRevisionPullTimers(): void {
  if (collabRevisionDebounceTimer != null) {
    clearTimeout(collabRevisionDebounceTimer);
    collabRevisionDebounceTimer = null;
  }
  if (collabRevisionBusyRetryTimer != null) {
    clearTimeout(collabRevisionBusyRetryTimer);
    collabRevisionBusyRetryTimer = null;
  }
  collabRevisionBusyRetryCount = 0;
}

function revisionFromCollabRow(row: Record<string, unknown> | null | undefined): number | null {
  if (!row) return null;
  return rpcBigintToNumber(row.revision);
}

/** [Fix-NONCUR] 비현재 프로젝트의 Realtime revision 신호를 임시 저장 — 다음 bidirectional pull에서 우선 처리 */
const pendingNonCurrentRevisionHints = new Map<string, number>();

export function flushPendingNonCurrentRevisionHints(projectIds: readonly string[]): string[] {
  const ready: string[] = [];
  for (const pid of projectIds) {
    if (pendingNonCurrentRevisionHints.has(pid)) {
      ready.push(pid);
      pendingNonCurrentRevisionHints.delete(pid);
    }
  }
  return ready;
}

function scheduleCollabRevisionPull(projectId: string, reason: string, revisionHint: number | null): void {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  if (get(currentProject)?.id !== projectId) {
    // [Fix-NONCUR] 비현재 프로젝트 신호 → 캐시 후 다음 bidirectional sync에서 처리
    if (revisionHint != null) pendingNonCurrentRevisionHints.set(projectId, revisionHint);
    return;
  }

  const ref = get(projects).find((p) => p.id === projectId);
  if (!ref) return;

  const uid = getAuthUserId();
  if (!uid) return;
  const workspaceUserId = ref.cloud_workspace_source_user_id ?? uid;
  if (collabRevisionDebounceTimer != null) clearTimeout(collabRevisionDebounceTimer);
  collabRevisionDebounceTimer = setTimeout(() => {
    collabRevisionDebounceTimer = null;
    void flushCollabRevisionPull(projectId, reason, revisionHint);
  }, COLLAB_REV_PULL_DEBOUNCE_MS);
}

async function flushCollabRevisionPull(
  projectId: string,
  reason: string,
  revisionHint: number | null = null
): Promise<void> {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  if (get(currentProject)?.id !== projectId) return;

  if (await collabPullShouldDeferForInteraction()) {
    queuePendingCollabPull({ mode: 'revision-flush', projectId, reason, revisionHint });
    return;
  }

  const { isCloudBidirectionalSyncBusy } = await import('$lib/supabase/workspacePush');
  if (isCloudBidirectionalSyncBusy()) {
    if (collabRevisionBusyRetryCount < COLLAB_REV_BUSY_RETRY_MAX) {
      collabRevisionBusyRetryCount += 1;
      collabRevisionBusyRetryTimer = setTimeout(() => {
        collabRevisionBusyRetryTimer = null;
        void flushCollabRevisionPull(projectId, reason, revisionHint);
      }, COLLAB_REV_BUSY_RETRY_MS * collabRevisionBusyRetryCount);
    }
    return;
  }
  collabRevisionBusyRetryCount = 0;

  const ref = get(projects).find((p) => p.id === projectId);
  if (!ref) return;
  await pullCollabSliceForProject(ref, reason, {
    knownRemoteRevision: revisionHint
  });
}

/**
 * `plannode_project_collab_meta` revision UPDATE/INSERT — Realtime `postgres_changes`.
 * 선행: `docs/supabase/20260520_plannode_collab_meta_realtime_rls.sql`
 */
export function subscribeCollabRevisionRealtime(project: Project): void {
  unsubscribeCollabRevisionRealtime();
  if (typeof window === 'undefined' || !isSupabaseCloudConfigured()) return;
  const uid = getAuthUserId();
  if (!uid || !project?.id?.trim()) return;

  const pid = project.id.trim();
  const workspaceUserId = (project.cloud_workspace_source_user_id ?? uid).trim();
  if (!workspaceUserId) return;

  const onCollabMetaChange = (row: Record<string, unknown> | null | undefined) => {
    if (!row || String(row.project_id ?? '').trim() !== pid) return;
    const rev = revisionFromCollabRow(row);
    scheduleCollabRevisionPull(pid, 'collab-rev-rt', rev);
  };

  const channelFilter = `workspace_user_id=eq.${workspaceUserId}`;
  collabRevisionChannel = supabase
    .channel(`collab-rev:${workspaceUserId}:${pid}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'plannode_project_collab_meta',
        filter: channelFilter
      },
      (payload) => {
        onCollabMetaChange(payload.new as Record<string, unknown> | undefined);
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'plannode_project_collab_meta',
        filter: channelFilter
      },
      (payload) => {
        onCollabMetaChange(payload.new as Record<string, unknown> | undefined);
      }
    )
    .subscribe();
}

export function unsubscribeCollabRevisionRealtime(): void {
  clearCollabRevisionPullTimers();
  if (collabRevisionChannel) {
    void supabase.removeChannel(collabRevisionChannel);
    collabRevisionChannel = null;
  }
}

/** Phase 4: 소유자 프로젝트 bootstrap (op_log_complete 설정) + structure_ops Realtime 구독.
 *  subscribeCollabRevisionRealtime 이후 호출. owner만 bootstrap 가능. */
export async function bootstrapAndSubscribeStructureOpsRealtime(project: Project): Promise<void> {
  if (!isSupabaseCloudConfigured() || typeof window === 'undefined') return;
  const uid = getAuthUserId();
  if (!uid || !project?.id?.trim()) return;

  const src = project.cloud_workspace_source_user_id;
  const pid = project.id.trim();

  // Realtime 구독: member side (src가 owner uid)
  if (src && src !== uid) {
    subscribeStructureOpsRealtime(src, pid, (changedProjectId) => {
      const ref = get(projects).find((p) => p.id === changedProjectId) ?? project;
      void pullStructureOpsForProject(ref);
    });
    return;
  }

  // Owner side: bootstrap 실행 후 Realtime 구독
  if (!src || src === uid) {
    // owner의 경우 자신의 workspace_user_id = uid
    const result = await bootstrapStructureOpsFromSnapshot(uid, pid);
    if (import.meta.env.DEV) {
      console.info('[bootstrapStructureOps]', pid, result);
    }
    // owner는 member들이 push한 ops를 Realtime으로 수신 → pull & replay
    subscribeStructureOpsRealtime(uid, pid, (changedProjectId) => {
      const ref = get(projects).find((p) => p.id === changedProjectId) ?? project;
      void pullStructureOpsForProjectOwner(changedProjectId, ref);
    });
  }
}

/** Phase 4: owner가 member ops를 pull — src === uid 특수 경로 */
async function pullStructureOpsForProjectOwner(projectId: string, project: Project): Promise<void> {
  if (!isSupabaseCloudConfigured() || typeof window === 'undefined') return;
  const uid = getAuthUserId();
  if (!uid) return;

  const since = getStructureOpsPersistAckSeq(projectId);
  const bundle = await fetchStructureOpsSince(uid, projectId, since);
  if (!bundle || !bundle.ops.length) return;

  if (bundle.last_applied_seq > since) {
    setStructureOpsPersistAckSeq(projectId, bundle.last_applied_seq);
  }
  if (bundle.op_log_complete) {
    setOpLogComplete(projectId, true);
  }

  maybeFlushPilotBeforeCollabMerge(projectId);
  const local = loadLocalNodesForCollabMerge(projectId);
  const replayed = replayStructureOpsOnNodes(
    local,
    bundle.ops.map((row) => row.op),
    projectId
  );
  recordNodeDiffToChangeLog(projectId, local, replayed);
  upsertImportedPlannodeTreeV1(project, replayed, { openAfter: false, markDirty: false });
  if (get(currentProject)?.id === projectId) {
    const latest = get(projects).find((p) => p.id === projectId);
    if (latest) selectProject(latest);
  }
}

/** COLLAB-PERF-2 E5/E5-2 — bidirectional 전체 공유 pull 최소 간격 */
const SHARED_FULL_PULL_COOLDOWN_MS = 60_000;
/** interval 틱에서 나머지 공유 pull 허용 최소 idle */
const SHARED_FULL_PULL_IDLE_MS = 30_000;

/** E5-2: 0이면 첫 full-pull 쿨다운이 즉시 통과됨 → 로드 시각으로 초기화 */
let lastFullSharedPullTs = typeof window !== 'undefined' ? Date.now() : 0;

function isSharedCollabMemberProjectRecord(p: Project, uid: string): boolean {
  const src = p.cloud_workspace_source_user_id ?? null;
  return !!(src && src !== uid);
}

/**
 * E5-2 — 나머지 공유 full-pull: **idle-long** 또는 **interval+idle≥30s** 만.
 * start/visibility/focus는 현재 프로젝트 pull만(상위 함수) — N건 일괄 fetch 금지.
 */
export function shouldPullAllSharedSlices(reason: string, idleMs?: number): boolean {
  if (Date.now() - lastFullSharedPullTs < SHARED_FULL_PULL_COOLDOWN_MS) return false;
  if (reason === 'idle-long') return true;
  if (reason === 'interval') return (idleMs ?? 0) >= SHARED_FULL_PULL_IDLE_MS;
  return false;
}

export function recordLastFullSharedPullTs(): void {
  lastFullSharedPullTs = Date.now();
}

/**
 * COLLAB-PERF-2 E5 — bidirectional: 현재 프로젝트만 매 틱 · 나머지 공유는 idle+쿨다운 시만
 */
export async function pullSharedProjectSlicesForBidirectionalSync(
  reason: string,
  opts?: { idleMs?: number }
): Promise<number> {
  if (typeof window === 'undefined' || !isSupabaseCloudConfigured()) return 0;
  const uid = getAuthUserId();
  if (!uid) return 0;

  const curId = get(currentProject)?.id?.trim() || null;
  const sharedOtherIds = get(projects)
    .filter((p) => {
      if (curId && p.id === curId) return false;
      return isSharedCollabMemberProjectRecord(p, uid);
    })
    .map((p) => p.id);

  let n = 0;
  if (curId) {
    n += await pullSharedProjectSlicesIfNewer([curId]);
  }

  // [Fix-NONCUR] Realtime 신호를 받은 비현재 프로젝트는 쿨다운 없이 즉시 pull
  const hintIds = flushPendingNonCurrentRevisionHints(sharedOtherIds);
  if (hintIds.length) {
    n += await pullSharedProjectSlicesIfNewer(hintIds);
    if (import.meta.env.DEV) {
      console.info('[collab-shared-pull] hint-pull (non-current revision signal)', hintIds);
    }
  }

  const remainingIds = sharedOtherIds.filter((id) => !hintIds.includes(id));
  if (remainingIds.length && shouldPullAllSharedSlices(reason, opts?.idleMs)) {
    n += await pullSharedProjectSlicesIfNewer(remainingIds);
    recordLastFullSharedPullTs();
    if (import.meta.env.DEV) {
      console.info('[collab-shared-pull] full-pull', reason, remainingIds.length);
    }
  } else if (import.meta.env.DEV && remainingIds.length) {
    console.info('[collab-shared-pull] current-only', reason, curId, `(others=${remainingIds.length})`);
  }

  return n;
}

/** 초대(공유) 프로젝트: 소유자 워크스페이스 슬라이스가 더 최신이면 로컬에 반영.
 * 멤버 프로젝트는 op-first 경로(`pullCollabSliceForProject`)를 우선 시도하여 LWW 스냅샷 병합에 의한
 * 로컬-only 노드 삭제를 방지한다. op log가 변경을 커버하면 slice fetch 자체를 생략한다. */
export async function pullSharedProjectSlicesIfNewer(
  onlyProjectIds?: readonly string[]
): Promise<number> {
  if (typeof window === 'undefined' || !isSupabaseCloudConfigured()) return 0;
  const uid = getAuthUserId();
  if (!uid) return 0;

  const filter =
    onlyProjectIds?.length &&
    new Set(onlyProjectIds.map((id) => id.trim()).filter(Boolean));

  let n = 0;
  for (const p of get(projects)) {
    if (filter && !filter.has(p.id)) continue;
    const src = p.cloud_workspace_source_user_id;
    // 멤버 프로젝트: op-first 경로로 LWW 병합 전 op replay 우선
    if (src && src !== uid) {
      const changed = await pullCollabSliceForProject(p, 'shared-pull-newer');
      if (changed) n++;
    } else {
      const changed = await mergeSharedProjectSliceFromCloudIfApplicable(p);
      if (changed) n++;
    }
  }
  return n;
}
