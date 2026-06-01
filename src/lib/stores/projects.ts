import { writable, get } from 'svelte/store';

/** 스냅샷 백업 스케줄링 일시 중지 — 과부하 완화. 재활성화 시 false로 변경 */
const NODE_SNAPSHOT_SCHEDULING_DISABLED = true;
import type { Project, Node, HistoryEntry } from '$lib/supabase/client';
import { getAuthEmail } from '$lib/stores/authSession';
import {
  badgePoolRevision,
  clearBadgePoolRuntimeCache,
  normalizeBadgePool,
  registerCurrentProjectIdLookup,
  registerProjectBadgePoolLookup,
  type BadgePoolTracks,
} from '$lib/ai/badgePoolConfig';
import { applySanitizeImportedPlannodeNodeV1 } from '$lib/ai/badgePromptInjector';
import { mergeLearnedBadgeRulesFromImportedNodes } from '$lib/ai/badgeMetadataInference';
import type { PrdSectionKey } from '$lib/prdStandardV20';
import { markCloudWorkspaceDirty, markCloudWorkspaceSynced, markCollabStructureOpsPending } from '$lib/stores/workspaceDirty';
import { getAuthUserId } from '$lib/stores/authSession';
import {
  captureNodeSnapshot,
  listNodeSnapshots,
  nodeSnapshotCatalogRevision,
  coerceStringToNodeSnapshotReason,
  type StoredNodeSnapshot,
  type NodeSnapshotCaptureMeta,
  type NodeSnapshotReason
} from '$lib/stores/nodeSnapshotHistory';
import {
  appendNodeChangeLog,
  recordNodeDiffToChangeLog,
  nodeChangeLogAuthor,
  type NodeChangeLogEntry
} from '$lib/stores/nodeChangeLog';
import { scheduleNodeChangeLogDbWrite } from '$lib/supabase/nodeChangeLogDb';
import type { StructureOpPayload } from '$lib/supabase/projectStructureOps';

// 프로젝트 상태
export const projects = writable<Project[]>([]);
export const currentProject = writable<Project | null>(null);

// 노드 상태
export const nodes = writable<Node[]>([]);

/** `persistNodesFromPilot` → `nodes.set` 구간: 파일럿 브리지가 동일 쓰기로 재수화하지 않도록 */
let nodesSetFromPilotPersist = false;
export function isNodesSetFromPilotPersist(): boolean {
  return nodesSetFromPilotPersist;
}

// UI 상태
export const activeView = writable<'tree' | 'prd' | 'spec' | 'ia' | 'ai'>('tree');
export const showProjectModal = writable(false);

/** 프로젝트 메타 `badge_pool` 정규화 — 워크스페이스·로컬 로드 공통 */
export function reconcileProjectRecord(project: Project): Project {
  if (project.badge_pool == null) return project;
  return { ...project, badge_pool: normalizeBadgePool(project.badge_pool) };
}

/** 프로젝트에 저장된 풀 — 없으면 `null`(기기 전역 폴백) */
export function getProjectBadgePool(projectId: string): BadgePoolTracks | null {
  const p = get(projects).find((x) => x.id === projectId);
  if (!p?.badge_pool) return null;
  return normalizeBadgePool(p.badge_pool);
}

/** 배지 풀 저장 후 해당 프로젝트 노드 배지를 새 풀 기준으로 일괄 정리 */
export function reconcileProjectNodeBadgesAfterPoolSave(projectId: string): number {
  if (typeof window === 'undefined') return 0;
  const cur = get(currentProject);
  const rawList =
    cur?.id === projectId ? get(nodes) : loadProjectNodesFromLocalStorage(projectId);
  if (!rawList.length) return 0;

  let changed = 0;
  const next = rawList.map((node) => {
    const san = applySanitizeImportedPlannodeNodeV1(node);
    const before = JSON.stringify({
      badges: node.badges ?? [],
      mb: node.metadata?.badges ?? null
    });
    const after = JSON.stringify({
      badges: san.badges ?? [],
      mb: san.metadata?.badges ?? null
    });
    if (before !== after) changed++;
    return san;
  });
  if (changed === 0) return 0;

  try {
    localStorage.setItem(NODES_KEY_PREFIX + projectId, JSON.stringify(next));
  } catch (e) {
    console.error('Failed to persist reconciled node badges:', e);
    return 0;
  }
  if (cur?.id === projectId) {
    nodes.set(next);
  }
  markCloudWorkspaceDirty();
  touchProjectUpdatedAt(projectId);
  return changed;
}

/** 프로젝트별 표준 배지 풀 저장 — 워크스페이스 번들·LWW 동기 대상 */
export function setProjectBadgePool(projectId: string, pool: BadgePoolTracks): BadgePoolTracks {
  if (typeof window === 'undefined') return normalizeBadgePool(pool);
  const normalized = normalizeBadgePool(pool);
  const now = new Date().toISOString();
  projects.update((plist) => {
    const next = plist.map((p) =>
      p.id === projectId ? { ...p, badge_pool: normalized, updated_at: now } : p
    );
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(next));
    } catch (e) {
      console.error('Failed to persist project badge pool:', e);
    }
    return next;
  });
  const cur = get(currentProject);
  if (cur?.id === projectId) {
    const merged = { ...cur, badge_pool: normalized, updated_at: now };
    currentProject.set(merged);
    try {
      localStorage.setItem(CURRENT_PROJECT_KEY, JSON.stringify(merged));
    } catch {
      /* ignore */
    }
  }
  clearBadgePoolRuntimeCache(projectId);
  badgePoolRevision.update((n) => n + 1);
  markCloudWorkspaceDirty();
  return normalized;
}

// localStorage 키
const PROJECTS_KEY = 'plannode_projects_v3';
const NODES_KEY_PREFIX = 'plannode_nodes_v3_';
const CURRENT_PROJECT_KEY = 'plannode_current_project_v3';
const MERGED_HISTORY_ENTRIES_LS_KEY = 'plannode_merged_history_entries_v1';

/** localStorage에 프로젝트 목록 강제 동기화 */
export function persistProjectsToLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(get(projects)));
  } catch { /* ignore */ }
}

/** 클라우드 LWW 병합이 로컬 삭제 직후 서버 스냅샷으로 프로젝트를 되살리지 않도록 유지 */
const WORKSPACE_PENDING_DELETE_IDS_KEY = 'plannode_workspace_pending_delete_ids_v1';

/** 삭제 직후 옛 원격 스냅샷이 같은 노드 id를 다시 넣는 것만 잠시 막음(프로젝트 시각 비교로 신규 노드를 막지 않음) */
const CLOUD_MERGE_RECENT_DELETE_TTL_MS = 240_000;
/** 동시 추가 직후 pull preserve — `touchProjectUpdatedAt`·노드 `updated_at` 시차·push 지연 완충 */
const CLOUD_MERGE_RECENT_ADD_TTL_MS = 90_000;
/** persist 배치에서 node.updated_at ≤ project.updated_at(ms) 허용 — 동일 persist 내 T1/T2 시차 */
const COLLAB_PRESERVE_META_SLACK_MS = 5_000;
/** 새로고침·재접속 후에도 잠시 유지 — 만료 후 자동 정리 */
const CLOUD_MERGE_SUPPRESSED_DELETES_KEY = 'plannode_cloud_merge_suppressed_deletes_v1';
const CLOUD_MERGE_DISK_TTL_MS = 48 * 60 * 60 * 1000;
const CLOUD_MERGE_DISK_MAX_IDS_PER_PROJECT = 120;

type RecentDelMergeBucket = { ids: Set<string>; until: number };
const recentlyDeletedNodeIdsForCloudMerge = new Map<string, RecentDelMergeBucket>();
const recentlyAddedNodeIdsForCloudMerge = new Map<string, RecentDelMergeBucket>();

type DiskSuppressedDeletes = Record<string, Record<string, number>>;

function readDiskSuppressedDeletes(): DiskSuppressedDeletes {
  if (typeof window === 'undefined') return {};
  try {
    const s = localStorage.getItem(CLOUD_MERGE_SUPPRESSED_DELETES_KEY);
    if (!s) return {};
    const o = JSON.parse(s) as unknown;
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as DiskSuppressedDeletes) : {};
  } catch {
    return {};
  }
}

function writeDiskSuppressedDeletes(map: DiskSuppressedDeletes): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CLOUD_MERGE_SUPPRESSED_DELETES_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function pruneDiskSuppressedDeletes(map: DiskSuppressedDeletes, now: number): DiskSuppressedDeletes {
  const out: DiskSuppressedDeletes = {};
  for (const [pid, ids] of Object.entries(map)) {
    if (!ids || typeof ids !== 'object') continue;
    const next: Record<string, number> = {};
    for (const [nid, t] of Object.entries(ids)) {
      if (typeof t === 'number' && now - t < CLOUD_MERGE_DISK_TTL_MS) {
        next[nid] = t;
      }
    }
    if (Object.keys(next).length) out[pid] = next;
  }
  return out;
}

function appendDiskSuppressedDeletes(projectId: string, nodeIds: string[]): void {
  if (typeof window === 'undefined' || !projectId || !nodeIds.length) return;
  const now = Date.now();
  let map = pruneDiskSuppressedDeletes(readDiskSuppressedDeletes(), now);
  const cur = { ...(map[projectId] ?? {}) };
  for (const id of nodeIds) {
    cur[id] = now;
  }
  let entries = Object.entries(cur).sort((a, b) => a[1] - b[1]);
  while (entries.length > CLOUD_MERGE_DISK_MAX_IDS_PER_PROJECT) {
    entries = entries.slice(1);
  }
  map[projectId] = Object.fromEntries(entries);
  map = pruneDiskSuppressedDeletes(map, now);
  writeDiskSuppressedDeletes(map);
}

function diskSuppressedDeleteIdsForProject(projectId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  const now = Date.now();
  const raw = readDiskSuppressedDeletes();
  const pruned = pruneDiskSuppressedDeletes(raw, now);
  if (Object.keys(pruned).length !== Object.keys(raw).length || JSON.stringify(pruned) !== JSON.stringify(raw)) {
    writeDiskSuppressedDeletes(pruned);
  }
  const row = pruned[projectId];
  return new Set(row ? Object.keys(row) : []);
}

function pruneExpiredRecentDeletesForMerge(now: number): void {
  for (const [pid, b] of recentlyDeletedNodeIdsForCloudMerge) {
    if (now > b.until) recentlyDeletedNodeIdsForCloudMerge.delete(pid);
  }
}

/** GATE A: 캔버스 저장 시 히스토리 최신 행·하단 `update` 라벨 단일 소스 — 연속 저장은 디바운스해 링 버퍼 폭주 완화 */
const persistSnapshotDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const PERSIST_SNAPSHOT_DEBOUNCE_MS = 900;

function pipelineLabelForNodeSnapshotReason(reason: NodeSnapshotReason): string {
  switch (reason) {
    case 'persist':
      return '로컬 캔버스 저장';
    case 'manual':
      return '수동 스냅샷';
    case 'import':
      return '가져오기·덮어쓰기';
    case 'pre_pull':
      return '클라우드 반영 직전';
    case 'presence_peer':
      return '동시 접속 반영';
    case 'project_close':
      return '프로젝트 전환 직전';
    case 'idle_10min':
      return '10분 무편집';
    case 'cloud_upload':
      return '클라우드 업로드';
    case 'cloud_history':
      return '클라우드(병합 기록)';
    default:
      return '히스토리';
  }
}

/** 히스토리 모달 메타 — PRD LLM 파이프라인과 무관한 저장·동기 단계 라벨만 사용(plan-output P-4.5). */
export function buildNodeSnapshotCaptureMeta(
  reason: NodeSnapshotReason,
  project: Project | null | undefined,
  nodeList: Node[]
): NodeSnapshotCaptureMeta {
  const v = project?.updated_at != null ? String(project.updated_at).trim() : '';
  return {
    author: getAuthEmail() ?? undefined,
    nodeCount: nodeList.length,
    ...(v ? { version: v } : {}),
    pipelineLabel: pipelineLabelForNodeSnapshotReason(reason)
  };
}

/** 페이지 이탈 등에서 persist 스냅 디바운스 타이머 정리(히스토리 플랜 보완 Phase D). */
export function clearPersistSnapshotDebounceTimers(): void {
  if (typeof window === 'undefined') return;
  for (const [, t] of persistSnapshotDebounceTimers) {
    window.clearTimeout(t);
  }
  persistSnapshotDebounceTimers.clear();
}

function schedulePersistNodeSnapshotAfterPilot(projectId: string): void {
  if (typeof window === 'undefined') return;
  const prev = persistSnapshotDebounceTimers.get(projectId);
  if (prev !== undefined) window.clearTimeout(prev);
  persistSnapshotDebounceTimers.set(
    projectId,
    window.setTimeout(() => {
      persistSnapshotDebounceTimers.delete(projectId);
      const cur = get(currentProject);
      if (!cur || cur.id !== projectId) return;
      captureNodeSnapshot(
        projectId,
        get(nodes),
        'persist',
        buildNodeSnapshotCaptureMeta('persist', cur, get(nodes))
      );
    }, PERSIST_SNAPSHOT_DEBOUNCE_MS)
  );
}

// [Bug-3 (2026-06-01)] BAR 실행 후 클라우드 pull이 구 mx/my를 복원하는 race 방지
// resetAllManualLayout → setLayoutResetPending → mergeNodeListsForCloud에서 mx/my 강제 null
const _layoutResetPendingMs = 10_000; // 10초 grace period
const _layoutResetPendingAt = new Map<string, number>();

/** BAR(자동정렬) 실행 후 호출 — 이후 pull merge 시 mx/my 강제 null (10초 grace) */
export function setLayoutResetPending(projectId: string): void {
  if (!projectId) return;
  _layoutResetPendingAt.set(projectId, Date.now());
}

/** 클라우드 push 완료 후 호출해 grace period 해제 */
export function clearLayoutResetPending(projectId: string): void {
  _layoutResetPendingAt.delete(projectId);
}

function isLayoutResetPending(projectId: string | null | undefined): boolean {
  if (!projectId) return false;
  const t = _layoutResetPendingAt.get(projectId);
  if (!t) return false;
  if (Date.now() - t > _layoutResetPendingMs) {
    _layoutResetPendingAt.delete(projectId);
    return false;
  }
  return true;
}

/** 파일럿 삭제·`persistNodesFromPilot` 등에서 호출 — 병합 시 해당 id를 잠시 원격에서 되살리지 않음(메모리 + localStorage) */
export function registerRecentlyDeletedNodeIdsForCloudMerge(projectId: string, nodeIds: string[]): void {
  if (typeof window === 'undefined' || !projectId || !nodeIds.length) return;
  const now = Date.now();
  pruneExpiredRecentDeletesForMerge(now);
  const until = now + CLOUD_MERGE_RECENT_DELETE_TTL_MS;
  const prev = recentlyDeletedNodeIdsForCloudMerge.get(projectId);
  const ids = new Set<string>([...(prev?.ids ?? []), ...nodeIds]);
  recentlyDeletedNodeIdsForCloudMerge.set(projectId, { ids, until });
  appendDiskSuppressedDeletes(projectId, nodeIds);
}

function pruneExpiredRecentAddsForMerge(now: number): void {
  for (const [pid, b] of recentlyAddedNodeIdsForCloudMerge) {
    if (now > b.until) recentlyAddedNodeIdsForCloudMerge.delete(pid);
  }
}

/** 파일럿 addChild·persist 직후 id — pull 병합 preserve 보강(동시 추가) */
export function registerRecentlyAddedNodeIdsForCloudMerge(projectId: string, nodeIds: string[]): void {
  if (typeof window === 'undefined' || !projectId || !nodeIds.length) return;
  const now = Date.now();
  pruneExpiredRecentAddsForMerge(now);
  const until = now + CLOUD_MERGE_RECENT_ADD_TTL_MS;
  const prev = recentlyAddedNodeIdsForCloudMerge.get(projectId);
  const ids = new Set<string>([...(prev?.ids ?? []), ...nodeIds]);
  recentlyAddedNodeIdsForCloudMerge.set(projectId, { ids, until });
}

export function recentAddIdsForCloudMerge(projectId: string | null | undefined): Set<string> {
  if (!projectId) return new Set();
  const now = Date.now();
  pruneExpiredRecentAddsForMerge(now);
  const b = recentlyAddedNodeIdsForCloudMerge.get(projectId);
  if (!b || now > b.until) return new Set();
  return new Set(b.ids);
}

/** 동시 추가 시 (parent_id·name 동일 + 30s 시간창) 의미 중복 감지 */
function isCollabSemanticDuplicate(local: Node, remote: Node): boolean {
  if ((local.parent_id ?? null) !== (remote.parent_id ?? null)) return false;
  if (local.name.trim() !== remote.name.trim()) return false;
  const lt = Date.parse(String(local.created_at ?? ''));
  const rt = Date.parse(String(remote.created_at ?? ''));
  if (!Number.isFinite(lt) || !Number.isFinite(rt)) return false;
  return Math.abs(lt - rt) < 30_000;
}

/** pull·push 병합 직후 recent-add id가 빠졌으면 pre-merge 스냅에서 복원.
 *  단, merged에 의미 중복 노드(같은 parent+name, 30s 이내 동시 생성)가 있으면 스켈레톤을 버린다. */
export function unionCollabPreserveLocalNodes(
  projectId: string,
  preMergeLocal: Node[],
  merged: Node[]
): Node[] {
  const preserveIds = recentAddIdsForCloudMerge(projectId);
  if (!preserveIds.size) return merged;
  const mergedIds = new Set(merged.map((n) => n.id));
  const preById = new Map(preMergeLocal.map((n) => [n.id, n]));
  const extra: Node[] = [];
  for (const id of preserveIds) {
    if (mergedIds.has(id)) continue;
    const local = preById.get(id);
    if (!local) continue;
    // 의미 중복 감지: merged에 같은 parent+name+시간창 노드가 있으면 스켈레톤 폐기
    if (merged.some((r) => isCollabSemanticDuplicate(local, r))) continue;
    extra.push(local);
    mergedIds.add(id);
  }
  return extra.length ? [...merged, ...extra] : merged;
}

/**
 * 공유 슬라이스 **push** 전용 병합 — pull과 달리 `remoteProjectMetaNewer` prune 분기를 쓰지 않는다.
 * 서버 `p_prune_missing`(incoming 메타가 더 새로울 때 payload에 없는 id 삭제)과 맞물릴 때
 * 상대가 먼저 올린 노드 id가 payload에서 빠지면 **DB에서 지워지는** 회귀를 막는다.
 */
export function mergeNodesForCollabPush(
  localNodes: Node[],
  ownerNodes: Node[],
  projectId: string
): Node[] {
  const merged = mergeNodeListsForCloud(localNodes, ownerNodes, false, projectId);
  return unionCollabPreserveLocalNodes(projectId, localNodes, merged);
}

/** push payload가 소유자 id 전체를 포함할 때만 프로젝트 `updated_at`을 로컬 쪽으로 올림(prune 방지) */
export function collabPushProjectMetaAvoidingServerPrune(
  localProj: Project,
  ownerProj: Project | undefined,
  pushNodes: Node[],
  ownerNodes: Node[]
): Project {
  if (!ownerProj) return localProj;
  const ownerIds = new Set(ownerNodes.map((n) => n.id));
  const pushIds = new Set(pushNodes.map((n) => n.id));
  for (const id of ownerIds) {
    if (!pushIds.has(id)) {
      return { ...localProj, updated_at: String(ownerProj.updated_at || localProj.updated_at || '') };
    }
  }
  return localProj;
}

/** pull이 recent-add를 store·LS에서 지운 뒤 push gather 전 복원 */
export function reinjectCollabPreservedNodesAfterPullMerge(
  projectId: string,
  preMergeLocal: Node[]
): boolean {
  if (typeof window === 'undefined') return false;
  const preserveIds = recentAddIdsForCloudMerge(projectId);
  if (!preserveIds.size) return false;
  const cur = loadLocalNodesForCollabMerge(projectId);
  const curIds = new Set(cur.map((n) => n.id));
  const preById = new Map(preMergeLocal.map((n) => [n.id, n]));
  const missing: Node[] = [];
  for (const id of preserveIds) {
    if (curIds.has(id)) continue;
    const local = preById.get(id);
    if (!local) continue;
    // 의미 중복 감지: cur에 같은 parent+name+시간창 노드가 있으면 스켈레톤 폐기
    if (cur.some((r) => isCollabSemanticDuplicate(local, r))) continue;
    missing.push(local);
  }
  if (!missing.length) return false;
  const next = [...cur, ...missing];
  try {
    localStorage.setItem(NODES_KEY_PREFIX + projectId, JSON.stringify(next));
  } catch {
    return false;
  }
  const open = get(currentProject);
  if (open?.id === projectId) {
    nodes.set(next);
  }
  return true;
}

/** 공유 슬라이스 pull·push 입력 — 열린 프로젝트는 스토어+localStorage id 단위 LWW */
export function loadLocalNodesForCollabMerge(projectId: string): Node[] {
  const fromLs = loadProjectNodesFromLocalStorage(projectId);
  const curOpen = get(currentProject);
  if (curOpen?.id !== projectId) return fromLs;
  const fromStore = get(nodes);
  if (!fromStore.length) return fromLs;
  const byId = new Map<string, Node>();
  for (const n of fromLs) byId.set(n.id, n);
  for (const n of fromStore) {
    const prev = byId.get(n.id);
    if (!prev || parseTs(n.updated_at) >= parseTs(prev.updated_at)) {
      byId.set(n.id, n);
    }
  }
  const ordered: Node[] = [];
  const seen = new Set<string>();
  for (const n of fromStore) {
    const v = byId.get(n.id);
    if (v && !seen.has(v.id)) {
      ordered.push(v);
      seen.add(v.id);
    }
  }
  for (const n of fromLs) {
    if (!seen.has(n.id)) {
      ordered.push(byId.get(n.id) ?? n);
      seen.add(n.id);
    }
  }
  return ordered;
}

function recentDeleteIdsForCloudMerge(projectId: string | null | undefined): Set<string> {
  if (!projectId) return new Set();
  const now = Date.now();
  pruneExpiredRecentDeletesForMerge(now);
  let mem = new Set<string>();
  const b = recentlyDeletedNodeIdsForCloudMerge.get(projectId);
  if (b && now <= b.until) {
    mem = b.ids;
  } else {
    recentlyDeletedNodeIdsForCloudMerge.delete(projectId);
  }
  const disk = diskSuppressedDeleteIdsForProject(projectId);
  return new Set<string>([...mem, ...disk]);
}

export function registerPendingWorkspaceDeletion(projectId: string): void {
  if (typeof window === 'undefined' || !projectId) return;
  try {
    const s = localStorage.getItem(WORKSPACE_PENDING_DELETE_IDS_KEY);
    const parsed: unknown = s ? JSON.parse(s) : [];
    const arr = Array.isArray(parsed) ? [...parsed] : [];
    if (!arr.includes(projectId)) arr.push(projectId);
    localStorage.setItem(WORKSPACE_PENDING_DELETE_IDS_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

export function clearPendingWorkspaceDeletions(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(WORKSPACE_PENDING_DELETE_IDS_KEY);
  } catch {
    /* ignore */
  }
}

function readPendingWorkspaceDeletionSet(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const s = localStorage.getItem(WORKSPACE_PENDING_DELETE_IDS_KEY);
    const parsed: unknown = s ? JSON.parse(s) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string' && x.length > 0));
  } catch {
    return new Set();
  }
}

/** 삭제 직후~클라우드 반영 전까지 보류된 project_id(초대 패널·병합 스킵과 동일 소스) */
export function getPendingWorkspaceDeletionIds(): Set<string> {
  return readPendingWorkspaceDeletionSet();
}

/**
 * 서버 `projects_json`에 고스트로 남은 id가 pending 제거·캐시 일부 삭제 후 `mergeWorkspaceBundleFromCloudRemote`로
 * 되살아오는 것을 막음. pending과 별도 TTL(전체 사이트 데이터 삭제 시 키도 사라짐 — 서버 정본 반영이 최종 해결).
 * NOW-DEL-WS-02 / NOW-P0-DEL-WS-06: tombstone은 TTL·업로드 성공 후 `releaseDeletedProjectTombstonesAfterUpload`로만 해제.
 * 클라우드 fetch만으로 tombstone prune 하지 않음(조기 해제 → stale pull 일괄 복원 레ース).
 */
const WORKSPACE_DELETED_PROJECT_TOMBSTONES_KEY = 'plannode_workspace_deleted_project_tombstones_v1';
const TOMBSTONE_MAP_MAX_IDS = 240;
const TOMBSTONE_ENTRY_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function readDeletedProjectTombstoneMap(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const s = localStorage.getItem(WORKSPACE_DELETED_PROJECT_TOMBSTONES_KEY);
    const o = s ? JSON.parse(s) : {};
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeDeletedProjectTombstoneMap(m: Record<string, number>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(WORKSPACE_DELETED_PROJECT_TOMBSTONES_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

function pruneExpiredDeletedProjectTombstones(map: Record<string, number>, now: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, t] of Object.entries(map)) {
    if (typeof id === 'string' && id && typeof t === 'number' && now - t <= TOMBSTONE_ENTRY_TTL_MS) {
      out[id] = t;
    }
  }
  let entries = Object.entries(out).sort((a, b) => a[1] - b[1]);
  while (entries.length > TOMBSTONE_MAP_MAX_IDS) {
    entries = entries.slice(1);
  }
  return Object.fromEntries(entries);
}

/** 삭제·보류·모달 ghost-hide id — 병합 skip·번들 업로드 제외 공통 집합(추가 RPC 없음) */
export function workspaceDeletedProjectSkipIds(): Set<string> {
  const skip = new Set<string>([
    ...readPendingWorkspaceDeletionSet(),
    ...readDeletedProjectTombstoneIdSet()
  ]);
  const uid = getAuthUserId();
  if (uid) {
    for (const id of getOwnedProjectGhostHideIdsForModal(uid)) skip.add(id);
  }
  return skip;
}

/**
 * pull/merge 경로에서 이미 로컬에 되살아난 삭제 id 제거 — deleteProject 재호출 없음(더티·tombstone 중복 방지).
 * @returns 제거한 프로젝트 수
 */
export function stripResurrectedDeletedProjectsFromLocal(skipIds?: ReadonlySet<string>): number {
  if (typeof window === 'undefined') return 0;
  const skip = skipIds ?? workspaceDeletedProjectSkipIds();
  if (!skip.size) return 0;
  const plist = get(projects);
  const toRemove = plist.filter((p) => skip.has(p.id));
  if (!toRemove.length) return 0;
  const next = plist.filter((p) => !skip.has(p.id));
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(next));
    for (const p of toRemove) {
      localStorage.removeItem(NODES_KEY_PREFIX + p.id);
    }
  } catch (e) {
    console.error('Failed to strip resurrected deleted projects:', e);
    return 0;
  }
  projects.set(next);
  const cur = get(currentProject);
  if (cur && skip.has(cur.id)) {
    currentProject.set(null);
    nodes.set([]);
    try {
      localStorage.removeItem(CURRENT_PROJECT_KEY);
    } catch {
      /* ignore */
    }
  }
  return toRemove.length;
}

/** 서버 정본에 id가 없을 때 tombstone 제거 — 레거시 호출부(+page 모달)는 TTL 만료만 수행(조기 prune 레ース 방지). */
export function pruneDeletedProjectTombstonesAgainstCloudProjectIds(_cloudProjectIds: Set<string>): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const raw = readDeletedProjectTombstoneMap();
  const pruned = pruneExpiredDeletedProjectTombstones(raw, now);
  if (JSON.stringify(pruned) !== JSON.stringify(raw)) writeDeletedProjectTombstoneMap(pruned);
}

/**
 * 업로드 성공 직후: 번들에서 의도적으로 제외한 삭제 id의 tombstone 해제.
 * 서버 fetch 없음 — gatherWorkspaceBundle 제외 집합 = 삭제 반영 payload.
 */
export function releaseDeletedProjectTombstonesAfterUpload(excludedFromBundle: ReadonlySet<string>): void {
  if (typeof window === 'undefined' || !excludedFromBundle.size) return;
  const map = { ...readDeletedProjectTombstoneMap() };
  let changed = false;
  for (const id of excludedFromBundle) {
    if (map[id]) {
      delete map[id];
      changed = true;
    }
  }
  if (changed) writeDeletedProjectTombstoneMap(map);
}

/** 모달 보조 필터·테스트: 삭제 톰브스톤 id 집합 */
export function getDeletedProjectTombstoneIds(): Set<string> {
  return readDeletedProjectTombstoneIdSet();
}

function readDeletedProjectTombstoneIdSet(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  const now = Date.now();
  const raw = readDeletedProjectTombstoneMap();
  const pruned = pruneExpiredDeletedProjectTombstones(raw, now);
  if (JSON.stringify(pruned) !== JSON.stringify(raw)) writeDeletedProjectTombstoneMap(pruned);
  return new Set(Object.keys(pruned));
}

function registerDeletedProjectTombstone(projectId: string): void {
  if (typeof window === 'undefined' || !projectId) return;
  const now = Date.now();
  let map = pruneExpiredDeletedProjectTombstones(readDeletedProjectTombstoneMap(), now);
  map[projectId] = now;
  let entries = Object.entries(map).sort((a, b) => a[1] - b[1]);
  while (entries.length > TOMBSTONE_MAP_MAX_IDS) {
    entries = entries.slice(1);
  }
  map = Object.fromEntries(entries);
  writeDeletedProjectTombstoneMap(map);
}

function clearDeletedProjectTombstoneForReimport(projectId: string): void {
  if (typeof window === 'undefined' || !projectId) return;
  const map = { ...readDeletedProjectTombstoneMap() };
  if (!map[projectId]) return;
  delete map[projectId];
  writeDeletedProjectTombstoneMap(map);
}

/**
 * 업로드 성공 후 `clearPendingWorkspaceDeletions` 되면 원격 projects_json 고스트 한동안 남아
 * 소유자 조기 허용(`canAccessProject`)으로 모달에 다시 뜸. 서버 목록에서 id가 빠질 때까지 숨김(계정별).
 */
const WORKSPACE_MODAL_OWNED_GHOST_HIDE_BUCKET_KEY = 'plannode_workspace_modal_owned_ghost_hide_v1';
const MODAL_OWNED_GHOST_HIDE_MAX_IDS = 160;

type ModalOwnedGhostHideBucket = Record<string, string[]>;

function readModalOwnedGhostHideBucket(): ModalOwnedGhostHideBucket {
  if (typeof window === 'undefined') return {};
  try {
    const s = localStorage.getItem(WORKSPACE_MODAL_OWNED_GHOST_HIDE_BUCKET_KEY);
    const o = s ? JSON.parse(s) : {};
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as ModalOwnedGhostHideBucket) : {};
  } catch {
    return {};
  }
}

function writeModalOwnedGhostHideBucket(b: ModalOwnedGhostHideBucket): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(WORKSPACE_MODAL_OWNED_GHOST_HIDE_BUCKET_KEY, JSON.stringify(b));
  } catch {
    /* ignore */
  }
}

/** 소유자가 클라우드 연동 상태에서 삭제한 프로젝트 — 원격 목록 고스트 소거 전까지 모달에서 제외 */
export function registerOwnedProjectGhostHideForModal(uid: string, projectId: string): void {
  if (typeof window === 'undefined' || !uid || !projectId) return;
  try {
    const b = readModalOwnedGhostHideBucket();
    let arr = [...(b[uid] ?? [])];
    if (!arr.includes(projectId)) arr.push(projectId);
    if (arr.length > MODAL_OWNED_GHOST_HIDE_MAX_IDS) arr = arr.slice(-MODAL_OWNED_GHOST_HIDE_MAX_IDS);
    b[uid] = arr;
    writeModalOwnedGhostHideBucket(b);
  } catch {
    /* ignore */
  }
}

export function getOwnedProjectGhostHideIdsForModal(uid: string | null | undefined): Set<string> {
  if (!uid || typeof window === 'undefined') return new Set();
  try {
    const b = readModalOwnedGhostHideBucket();
    const arr = b[uid];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string' && x.length > 0) : []);
  } catch {
    return new Set();
  }
}

/** `fetchOwnWorkspaceProjectMetasForModal` 성공 시: 서버에 더 없는 id는 숨김 마커 정리 */
export function pruneOwnedProjectGhostHideAgainstCloudCanon(uid: string, canonicalCloudProjectIds: Set<string>): void {
  if (typeof window === 'undefined' || !uid) return;
  try {
    const b = readModalOwnedGhostHideBucket();
    const arr = b[uid];
    if (!Array.isArray(arr) || arr.length === 0) return;
    const next = arr.filter((id) => canonicalCloudProjectIds.has(id));
    if (next.length === arr.length) return;
    if (next.length === 0) {
      delete b[uid];
    } else {
      b[uid] = next;
    }
    writeModalOwnedGhostHideBucket(b);
  } catch {
    /* ignore */
  }
}

function makeRootNode(project: Project): Node {
  const now = new Date().toISOString();
  return {
    id: project.id + '-r',
    project_id: project.id,
    name: project.name,
    description: project.description ?? '',
    num: 'PRD',
    parent_id: undefined,
    depth: 0,
    badges: [],
    metadata: {},
    node_type: 'root',
    created_at: now,
    updated_at: now
  };
}

// 로컬 스토리지에서 프로젝트 로드
export function loadProjectsFromLocalStorage() {
  if (typeof window === 'undefined') return;

  try {
    const stored = localStorage.getItem(PROJECTS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const list = Array.isArray(parsed) ? (parsed as Project[]) : [];
      const reconciled: Project[] = [];
      for (const row of list) {
        try {
          reconciled.push(reconcileProjectRecord(row));
        } catch (e) {
          console.error('Failed to reconcile project row, keeping raw:', row?.id, e);
          reconciled.push(row);
        }
      }
      projects.set(reconciled);
    }
  } catch (e) {
    console.error('Failed to load projects:', e);
    projects.set([]);
  }
}

/**
 * 명시 로그아웃 시(M2-SESSION-SNAPSHOT NOW-42): `CURRENT_PROJECT_KEY` 제거 + 열린 프로젝트·노드 비움.
 * `loadProjectsFromLocalStorage`는 프로젝트 목록만 채우며, 부트 시 `plannode_current_project_v3`로
 * 자동 `selectProject` 하지 않는다(로그인·새로고침 모두 빈 캔버스 시작 — 모달에서 명시 선택).
 */
export function clearSessionProjectSelectionForLogout(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CURRENT_PROJECT_KEY);
  } catch {
    /* ignore */
  }
  currentProject.set(null);
  nodes.set([]);
  activeView.set('tree');
}

// 프로젝트 선택 (노드를 먼저 반영한 뒤 currentProject를 설정 — 파일럿 브리지 구독 순서)
export function selectProject(project: Project | null) {
  if (!project) {
    currentProject.set(null);
    nodes.set([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CURRENT_PROJECT_KEY);
    }
    return;
  }

  if (typeof window === 'undefined') return;

  try {
    const stored = localStorage.getItem(NODES_KEY_PREFIX + project.id);
    let parsed: unknown = null;
    if (stored) {
      try {
        parsed = JSON.parse(stored);
      } catch {
        parsed = null;
      }
    }
    const arr = Array.isArray(parsed) ? (parsed as Node[]) : [];
    if (arr.length > 0) {
      nodes.set(arr);
    } else {
      const rootNode = applySanitizeImportedPlannodeNodeV1(makeRootNode(project));
      const nodeList = [rootNode];
      nodes.set(nodeList);
      localStorage.setItem(NODES_KEY_PREFIX + project.id, JSON.stringify(nodeList));
      markCloudWorkspaceDirty();
    }
  } catch (e) {
    console.error('Failed to load nodes:', e);
    const rootNode = applySanitizeImportedPlannodeNodeV1(makeRootNode(project));
    nodes.set([rootNode]);
  }

  currentProject.set(project);
  // 현재 프로젝트를 localStorage에 저장 (새로고침 시 복원)
  try {
    localStorage.setItem(CURRENT_PROJECT_KEY, JSON.stringify(project));
  } catch (e) {
    console.error('Failed to save current project:', e);
  }
}

// 프로젝트 생성
export function createProject(projectData: Omit<Project, 'id' | 'created_at' | 'updated_at'>) {
  if (typeof window === 'undefined') return null;

  const newProject: Project = {
    ...projectData,
    id: 'proj_' + Math.random().toString(36).substring(2, 11),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const rootNode = applySanitizeImportedPlannodeNodeV1(makeRootNode(newProject));

  projects.update((p) => {
    const updated = [...p, newProject];
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save projects:', e);
    }
    return updated;
  });

  try {
    localStorage.setItem(NODES_KEY_PREFIX + newProject.id, JSON.stringify([rootNode]));
  } catch (e) {
    console.error('Failed to create nodes storage:', e);
  }

  markCloudWorkspaceDirty();
  return newProject;
}

/** 공유 ACL 멤버 — 소유자 워크스페이스 슬라이스/ops 경로 */
function isSharedCollabMemberProject(projectId: string): boolean {
  const uid = getAuthUserId();
  if (!uid) return false;
  const proj =
    get(projects).find((p) => p.id === projectId) ??
    (get(currentProject)?.id === projectId ? get(currentProject) : null);
  const src = proj?.cloud_workspace_source_user_id;
  return !!(src && src !== uid);
}

/** parent/좌표/num·노드增删만 — structure ops·slice merge 경로 (모달 본문·배지는 full dirty) */
function isStructureOnlyPilotPersist(prevSnap: Node[], list: Node[]): boolean {
  const prevIds = new Set(prevSnap.map((n) => n.id));
  const nextIds = new Set(list.map((n) => n.id));
  if (prevIds.size !== nextIds.size) return true;
  for (const id of prevIds) {
    if (!nextIds.has(id)) return true;
  }
  const prevById = new Map(prevSnap.map((n) => [n.id, n]));
  for (const n of list) {
    const p = prevById.get(n.id);
    if (!p) continue;
    if ((p.parent_id ?? '') !== (n.parent_id ?? '')) return true;
    if (p.mx !== n.mx || p.my !== n.my) return true;
    if ((p.num ?? '') !== (n.num ?? '')) return true;
    if (p.name !== n.name) return false;
    if ((p.description ?? '') !== (n.description ?? '')) return false;
    if (JSON.stringify(p.badges ?? []) !== JSON.stringify(n.badges ?? [])) return false;
    if (JSON.stringify(p.metadata ?? {}) !== JSON.stringify(n.metadata ?? {})) return false;
  }
  return true;
}

function markCloudPersistForProjectTouch(
  projectId: string,
  kind: 'full' | 'structure-only'
): void {
  if (kind === 'structure-only' && isSharedCollabMemberProject(projectId)) {
    markCollabStructureOpsPending(projectId);
    return;
  }
  markCloudWorkspaceDirty();
}

/** 노드·캔버스 변경 시 프로젝트 `updated_at`만 갱신 — 클라우드 LWW 동기화용 */
export function touchProjectUpdatedAt(
  projectId: string,
  iso?: string,
  opts?: { cloudPersist?: 'full' | 'structure-only' }
): void {
  if (typeof window === 'undefined') return;
  const now = iso ?? new Date().toISOString();
  projects.update((plist) => {
    const next = plist.map((p) => (p.id === projectId ? { ...p, updated_at: now } : p));
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(next));
    } catch (e) {
      console.error('Failed to persist touchProjectUpdatedAt:', e);
    }
    return next;
  });
  const cur = get(currentProject);
  if (cur?.id === projectId) {
    currentProject.set({ ...cur, updated_at: now });
    try {
      localStorage.setItem(CURRENT_PROJECT_KEY, JSON.stringify({ ...cur, updated_at: now }));
    } catch {
      /* ignore */
    }
  }
  markCloudPersistForProjectTouch(projectId, opts?.cloudPersist ?? 'full');
  if (typeof window !== 'undefined') {
    try {
      const reason =
        opts?.cloudPersist === 'structure-only' && isSharedCollabMemberProject(projectId)
          ? 'node-edit-structure'
          : 'node-edit';
      window.dispatchEvent(new CustomEvent('plannode-auto-cloud-sync', { detail: { reason } }));
    } catch {
      /* ignore */
    }
  }
}

/** 로컬 프로젝트 메타 일부 갱신(소유자 id 등) */
export function updateProjectMeta(
  projectId: string,
  patch: Partial<Pick<Project, 'owner_user_id' | 'plan_project_id'>>
): void {
  if (typeof window === 'undefined') return;
  projects.update((plist) => {
    const next = plist.map((p) =>
      p.id === projectId ? { ...p, ...patch, updated_at: new Date().toISOString() } : p
    );
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(next));
    } catch (e) {
      console.error('Failed to persist project meta:', e);
    }
    return next;
  });
  const cur = get(currentProject);
  if (cur?.id === projectId) {
    const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
    currentProject.set(next);
    try {
      localStorage.setItem(CURRENT_PROJECT_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  markCloudWorkspaceDirty();
}

/** 제목·메타 수정. 이름 변경 시 루트 노드(`…-r`) 표시명도 맞춤 — 트리·파일럿 일치 */
export function updateProjectFields(
  projectId: string,
  patch: Partial<Pick<Project, 'name' | 'author' | 'description' | 'start_date' | 'end_date'>>
): void {
  if (typeof window === 'undefined') return;
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const now = new Date().toISOString();
  projects.update((plist) => {
    const next = plist.map((p) => (p.id === projectId ? { ...p, ...patch, updated_at: now } : p));
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(next));
    } catch (e) {
      console.error('Failed to persist project fields:', e);
    }
    return next;
  });
  const cur = get(currentProject);
  if (cur?.id === projectId) {
    const merged = { ...cur, ...patch, updated_at: now };
    currentProject.set(merged);
    try {
      localStorage.setItem(CURRENT_PROJECT_KEY, JSON.stringify(merged));
    } catch {
      /* ignore */
    }
  }
  if (patch.name !== undefined && String(patch.name).trim() !== '') {
    syncProjectRootNodeTitle(projectId, String(patch.name).trim(), now);
  }
  markCloudWorkspaceDirty();
  try {
    window.dispatchEvent(new CustomEvent('plannode-auto-cloud-sync', { detail: { reason: 'project-meta' } }));
  } catch {
    /* ignore */
  }
}

/** PRD 탭 섹션 초안 — 로컬·워크스페이스에 저장, `null`이면 해당 키 제거(노드 자동 초안으로 복귀) */
export function updateProjectPrdSectionDraft(
  projectId: string,
  section: PrdSectionKey,
  value: string | null
): void {
  if (typeof window === 'undefined') return;
  const now = new Date().toISOString();
  projects.update((plist) => {
    const next = plist.map((p) => {
      if (p.id !== projectId) return p;
      const prev = p.prd_section_drafts ? { ...p.prd_section_drafts } : {};
      if (value == null || String(value).trim() === '') {
        delete prev[section];
      } else {
        prev[section] = value;
      }
      const cleaned = Object.keys(prev).length ? prev : undefined;
      return { ...p, prd_section_drafts: cleaned, updated_at: now };
    });
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(next));
    } catch (e) {
      console.error('Failed to persist PRD section draft:', e);
    }
    return next;
  });
  const cur = get(currentProject);
  if (cur?.id === projectId) {
    const prev = cur.prd_section_drafts ? { ...cur.prd_section_drafts } : {};
    if (value == null || String(value).trim() === '') {
      delete prev[section];
    } else {
      prev[section] = value;
    }
    const cleaned = Object.keys(prev).length ? prev : undefined;
    const merged = { ...cur, prd_section_drafts: cleaned, updated_at: now };
    currentProject.set(merged);
    try {
      localStorage.setItem(CURRENT_PROJECT_KEY, JSON.stringify(merged));
    } catch {
      /* ignore */
    }
  }
  markCloudWorkspaceDirty();
  try {
    window.dispatchEvent(new CustomEvent('plannode-auto-cloud-sync', { detail: { reason: 'prd-draft' } }));
  } catch {
    /* ignore */
  }
}

function syncProjectRootNodeTitle(projectId: string, name: string, now: string): void {
  const rid = `${projectId}-r`;
  const touch = (list: Node[]): Node[] =>
    list.map((n) => (n.id === rid ? { ...n, name, updated_at: now } : n));

  const curProj = get(currentProject);
  if (curProj?.id === projectId) {
    nodes.update((list) => {
      const updated = touch(list);
      try {
        localStorage.setItem(NODES_KEY_PREFIX + projectId, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to persist root title:', e);
      }
      return updated;
    });
    return;
  }
  try {
    const raw = localStorage.getItem(NODES_KEY_PREFIX + projectId);
    const list: Node[] = raw ? JSON.parse(raw) : [];
    const updated = touch(Array.isArray(list) ? list : []);
    localStorage.setItem(NODES_KEY_PREFIX + projectId, JSON.stringify(updated));
  } catch (e) {
    console.error('syncProjectRootNodeTitle:', e);
  }
}

/** structure Broadcast·pull replay 구간 — `persistNodesFromPilot`(더티·touch) 억제 */
let remoteStructureOpApplyDepth = 0;

export function enterRemoteStructureOpApply(): void {
  remoteStructureOpApplyDepth++;
}

export function exitRemoteStructureOpApply(): void {
  remoteStructureOpApplyDepth = Math.max(0, remoteStructureOpApplyDepth - 1);
}

export function isRemoteStructureOpApplyActive(): boolean {
  return remoteStructureOpApplyDepth > 0;
}

/** 파일럿 캔버스에서 전체 노드 스냅샷 저장 (현재 프로젝트와 id 일치 시만) */
export function persistNodesFromPilot(projectId: string, list: Node[]) {
  if (typeof window === 'undefined') return;
  if (isRemoteStructureOpApplyActive()) return;
  
  // 정책 8: 프로젝트가 삭제 대기 중이면 저장 거부
  const pendingDeleted = getPendingWorkspaceDeletionIds();
  if (pendingDeleted.has(projectId)) {
    console.warn(`[NOW-P0-DEL-04] 삭제 대기 프로젝트(${projectId})에 저장 시도 → 거부`);
    // 파일럿 → +page.svelte로 이벤트 발행 (toast 표시용)
    try {
      window.dispatchEvent(new CustomEvent('plannode-deleted-project-persist-attempt', { 
        detail: { projectId } 
      }));
      if (import.meta.env.DEV) {
        console.debug(`[toast] plannode-deleted-project-persist-attempt 이벤트 발행됨 (projectId: ${projectId})`);
      }
    } catch (e) {
      console.error('[toast] 이벤트 발행 실패:', e);
    }
    return;
  }

  const cur = get(currentProject);
  if (!cur || cur.id !== projectId) return;
  const prevSnap = get(nodes);
  const prevSameProject =
    prevSnap.length === 0 || prevSnap.every((n) => (n.project_id ?? projectId) === projectId);
  const prevIds = new Set(prevSnap.map((n) => n.id));
  const nextIds = new Set(list.map((n) => n.id));
  const removed = prevSameProject ? [...prevIds].filter((id) => !nextIds.has(id)) : [];
  const added = prevSameProject ? [...nextIds].filter((id) => !prevIds.has(id)) : [];
  if (removed.length) {
    registerRecentlyDeletedNodeIdsForCloudMerge(projectId, removed);
  }
  if (added.length) {
    registerRecentlyAddedNodeIdsForCloudMerge(projectId, added);
  } else {
    const keep = recentAddIdsForCloudMerge(projectId);
    if (keep.size) registerRecentlyAddedNodeIdsForCloudMerge(projectId, [...keep]);
  }
  try {
    localStorage.setItem(NODES_KEY_PREFIX + projectId, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to save nodes:', e);
  }
  nodesSetFromPilotPersist = true;
  try {
    nodes.set(list);
  } finally {
    nodesSetFromPilotPersist = false;
  }
  let touchIso = new Date().toISOString();
  if (list.length) {
    let maxTs = 0;
    for (const n of list) {
      const t = Date.parse(String(n.updated_at ?? ''));
      if (Number.isFinite(t) && t > maxTs) maxTs = t;
    }
    if (maxTs > 0) touchIso = new Date(maxTs).toISOString();
  }
  const cloudPersist: 'full' | 'structure-only' =
    isSharedCollabMemberProject(projectId) && isStructureOnlyPilotPersist(prevSnap, list)
      ? 'structure-only'
      : 'full';
  touchProjectUpdatedAt(projectId, touchIso, { cloudPersist });
  if (!NODE_SNAPSHOT_SCHEDULING_DISABLED) schedulePersistNodeSnapshotAfterPilot(projectId);

  // 노드 카드 변경 로그 추적
  if (prevSameProject && (added.length || removed.length || list.length)) {
    const author = get(nodeChangeLogAuthor);
    const now = new Date().toISOString();
    const changeEntries: NodeChangeLogEntry[] = [];
    for (const id of added) {
      const n = list.find((x) => x.id === id);
      if (n) changeEntries.push({ id: `chg_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, at: now, author, nodeId: id, nodeName: n.name || '(제목 없음)', action: 'create' });
    }
    for (const id of removed) {
      const n = prevSnap.find((x) => x.id === id);
      changeEntries.push({ id: `chg_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, at: now, author, nodeId: id, nodeName: n?.name || '(삭제된 노드)', action: 'delete' });
    }
    for (const n of list) {
      if (!prevIds.has(n.id)) continue;
      const prev = prevSnap.find((x) => x.id === n.id);
      if (prev && (prev.name !== n.name || prev.description !== n.description)) {
        changeEntries.push({ id: `chg_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, at: now, author, nodeId: n.id, nodeName: n.name || '(제목 없음)', action: 'edit' });
      }
    }
    if (changeEntries.length) {
      appendNodeChangeLog(projectId, changeEntries);
      // 자신의 변경만 DB에 기록 — 협업자가 DB에서 조회 시 함께 표시됨
      scheduleNodeChangeLogDbWrite(projectId, changeEntries);
    }
  }
}

function collectSubtreeNodeIds(nodes: Node[], rootId: string): string[] {
  const ids: string[] = [];
  const queue = [rootId];
  const seen = new Set<string>();
  while (queue.length) {
    const cur = queue.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    ids.push(cur);
    for (const n of nodes) {
      if (n.parent_id === cur && n.id && !seen.has(n.id)) {
        queue.push(n.id);
      }
    }
  }
  return ids;
}

/** EPIC E — 서버·pull ops를 로컬 Node[]에 순차 replay */
export function replayStructureOpsOnNodes(
  base: Node[],
  ops: StructureOpPayload[],
  projectId: string
): Node[] {
  let list = base.map((n) => ({ ...n, project_id: n.project_id ?? projectId }));
  const now = new Date().toISOString();

  // [Fix-ORPHAN] parent_id 없는 add_node/move_node는 1차 패스에서 보류 → 2차 패스 재시도
  const orphanOps: StructureOpPayload[] = [];

  function applyAddNodeOp(op: Extract<StructureOpPayload, { type: 'add_node' }>): void {
    const { node } = op;
    const existing = list.find((n) => n.id === node.id);
    const replayTs = existing?.updated_at ?? new Date(0).toISOString();
    const row: Node = {
      id: node.id,
      project_id: projectId,
      parent_id: node.parent_id,
      name: node.name ?? '',
      description: node.description ?? '',
      node_type: node.node_type ?? 'detail',
      num: node.num ?? '',
      mx: undefined,
      my: undefined,
      depth: existing?.depth ?? 0,
      created_at: existing?.created_at ?? now,
      updated_at: replayTs
    };
    if (existing) {
      // [Fix-GHOST-A] skeleton op(name='')으로 기존 content를 덮지 않음
      const mergedRow: Node = {
        ...row,
        name: !row.name && existing.name ? existing.name : row.name,
        description: !row.description && existing.description ? existing.description : row.description,
        updated_at:
          parseTs(existing.updated_at) > parseTs(row.updated_at)
            ? existing.updated_at
            : row.updated_at,
        created_at: existing.created_at
      };
      list = list.map((n) => (n.id === node.id ? { ...n, ...mergedRow } : n));
    } else {
      list = [...list, row];
    }
  }

  for (const op of ops) {
    if (op.type === 'add_node') {
      const { node } = op;
      // parent_id가 아직 없으면 보류 (같은 배치에서 부모가 추가될 수 있음)
      if (node.parent_id && !list.find((n) => n.id === node.parent_id)) {
        orphanOps.push(op);
        continue;
      }
      // [Fix-GHOST-C] Fix-GHOST-A Fix-GHOST-B는 applyAddNodeOp 내부에 통합
      applyAddNodeOp(op);
      continue;
    }
    if (op.type === 'update_node') {
      const { node } = op;
      const existing = list.find((n) => n.id === node.id);
      if (!existing) continue;
      const patch: Partial<Node> = { updated_at: node.updated_at ?? now };
      if (node.name != null) patch.name = node.name;
      if (node.description != null) patch.description = node.description;
      if (node.parent_id != null) patch.parent_id = node.parent_id;
      if (node.node_type != null) patch.node_type = node.node_type;
      if (node.num != null) patch.num = node.num;
      if (node.mx !== undefined) patch.mx = node.mx;
      if (node.my !== undefined) patch.my = node.my;
      list = list.map((n) => (n.id === node.id ? { ...n, ...patch } : n));
      continue;
    }
    if (op.type === 'move_node') {
      const existing = list.find((n) => n.id === op.node_id);
      if (!existing) continue;
      // [Fix-ORPHAN] move 대상 parent가 없으면 보류
      if (op.parent_id && !list.find((n) => n.id === op.parent_id)) {
        orphanOps.push(op);
        continue;
      }
      list = list.map((n) =>
        n.id === op.node_id
          ? {
              ...n,
              parent_id: op.parent_id,
              mx: op.mx,
              my: op.my,
              ...(op.num != null ? { num: op.num } : {}),
              updated_at: now
            }
          : n
      );
      continue;
    }
    if (op.type === 'delete_node') {
      const removeIds = new Set(collectSubtreeNodeIds(list, op.node_id));
      list = list.filter((n) => !removeIds.has(n.id));
      continue;
    }
  }

  // [Fix-ORPHAN] 2차 패스: 1차에서 보류된 orphan ops — 부모가 추가된 경우 적용
  for (const op of orphanOps) {
    if (op.type === 'add_node') {
      if (!op.node.parent_id || list.find((n) => n.id === op.node.parent_id)) {
        applyAddNodeOp(op);
      } else if (import.meta.env.DEV) {
        console.warn('[replayStructureOps] orphan add_node skip — parent not found', op.node.id, op.node.parent_id);
      }
    } else if (op.type === 'move_node') {
      if (!op.parent_id || list.find((n) => n.id === op.parent_id)) {
        list = list.map((n) =>
          n.id === op.node_id
            ? { ...n, parent_id: op.parent_id, mx: op.mx, my: op.my, ...(op.num != null ? { num: op.num } : {}), updated_at: now }
            : n
        );
      } else if (import.meta.env.DEV) {
        console.warn('[replayStructureOps] orphan move_node skip — parent not found', op.node_id, op.parent_id);
      }
    }
  }

  return list;
}

/**
 * EPIC D — 원격 structure op 반영 후 스토어·localStorage만 동기 (`STRUCTURE_STORE_SYNC`).
 * pull LWW `preserve`에 id가 있도록 하며, `touchProjectUpdatedAt`/클라우드 더티는 건드리지 않는다.
 */
export function persistNodesFromRemoteStructureOp(projectId: string, list: Node[]): void {
  if (typeof window === 'undefined') return;

  const pendingDeleted = getPendingWorkspaceDeletionIds();
  if (pendingDeleted.has(projectId)) return;

  const cur = get(currentProject);
  if (!cur || cur.id !== projectId) return;
  const prevSnap = get(nodes);
  const prevSameProject =
    prevSnap.length === 0 || prevSnap.every((n) => (n.project_id ?? projectId) === projectId);
  const prevIds = new Set(prevSnap.map((n) => n.id));
  const nextIds = new Set(list.map((n) => n.id));
  const removed = prevSameProject ? [...prevIds].filter((id) => !nextIds.has(id)) : [];
  if (removed.length) {
    registerRecentlyDeletedNodeIdsForCloudMerge(projectId, removed);
  }
  const now = new Date().toISOString();
  const parseNodeTs = (iso: string | undefined): number => {
    const t = Date.parse(String(iso ?? ''));
    return Number.isFinite(t) ? t : 0;
  };
  const projMetaTs = parseNodeTs(get(projects).find((p) => p.id === projectId)?.updated_at);
  /** structure 수신 id — 이후 pull preserve(nt >= lMeta) 정합 · touchProject/dirty 없음 */
  const normalized = list.map((n) => {
    if (!prevIds.has(n.id)) {
      return { ...n, updated_at: now };
    }
    const nt = parseNodeTs(n.updated_at);
    if (projMetaTs > 0 && nt < projMetaTs) {
      return { ...n, updated_at: now };
    }
    return n;
  });
  try {
    localStorage.setItem(NODES_KEY_PREFIX + projectId, JSON.stringify(normalized));
  } catch (e) {
    console.error('Failed to save nodes (remote structure):', e);
  }
  nodesSetFromPilotPersist = true;
  try {
    nodes.set(normalized);
  } finally {
    nodesSetFromPilotPersist = false;
  }
  // 협업자 실시간 변경 로그 — prevSameProject 시만, author 없음(클라이언트 id→email 매핑 불가)
  if (prevSameProject) {
    recordNodeDiffToChangeLog(projectId, prevSnap, normalized);
  }
}

/**
 * NOW-44 워크스페이스 되돌리기: 스냅샷 노드 배열로 교체(현재 열린 프로젝트 id 일치 시만).
 * 파일럿 갱신은 `nodes` 스토어 구독이 처리한다.
 */
export function replaceProjectNodesFromHistory(projectId: string, list: Node[]): boolean {
  if (typeof window === 'undefined') return false;
  const cur = get(currentProject);
  if (!cur || cur.id !== projectId || !Array.isArray(list)) return false;

  const prevSnap = get(nodes);
  const prevSameProject =
    prevSnap.length === 0 || prevSnap.every((n) => (n.project_id ?? projectId) === projectId);
  const prevIds = new Set(prevSnap.map((n) => n.id));
  const nextIds = new Set(list.map((n) => n.id));
  const removed = prevSameProject ? [...prevIds].filter((id) => !nextIds.has(id)) : [];
  if (removed.length) {
    registerRecentlyDeletedNodeIdsForCloudMerge(projectId, removed);
  }

  try {
    localStorage.setItem(NODES_KEY_PREFIX + projectId, JSON.stringify(list));
  } catch {
    return false;
  }
  nodes.set(list);
  touchProjectUpdatedAt(projectId);
  schedulePersistNodeSnapshotAfterPilot(projectId);
  return true;
}

// 노드 추가 (호출자가 id를 넘기면 유지)
export function addNode(nodeData: Omit<Node, 'created_at' | 'updated_at'> & { id?: string }) {
  if (typeof window === 'undefined') return null;

  const now = new Date().toISOString();
  const newNode: Node = {
    ...nodeData,
    id: nodeData.id ?? 'node_' + Math.random().toString(36).substring(2, 11),
    created_at: now,
    updated_at: now
  };

  nodes.update((n) => {
    const updated = [...n, newNode];
    try {
      localStorage.setItem(NODES_KEY_PREFIX + nodeData.project_id, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save nodes:', e);
    }
    return updated;
  });

  touchProjectUpdatedAt(nodeData.project_id);
  return newNode;
}

// 노드 수정
export function updateNode(nodeData: Node) {
  if (typeof window === 'undefined') return;

  nodes.update((n) => {
    const updated = n.map((x) => (x.id === nodeData.id ? nodeData : x));
    try {
      localStorage.setItem(NODES_KEY_PREFIX + nodeData.project_id, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to update nodes:', e);
    }
    return updated;
  });
  touchProjectUpdatedAt(nodeData.project_id);
}

// 노드 삭제
export function deleteNode(nodeId: string, projectId: string) {
  if (typeof window === 'undefined') return;

  nodes.update((n) => {
    const updated = n.filter((x) => x.id !== nodeId);
    try {
      localStorage.setItem(NODES_KEY_PREFIX + projectId, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to delete nodes:', e);
    }
    return updated;
  });
  touchProjectUpdatedAt(projectId);
}

// 프로젝트 삭제
export function deleteProject(projectId: string) {
  if (typeof window === 'undefined') return;

  recentlyDeletedNodeIdsForCloudMerge.delete(projectId);
  try {
    const map = readDiskSuppressedDeletes();
    if (map[projectId]) {
      delete map[projectId];
      writeDiskSuppressedDeletes(pruneDiskSuppressedDeletes(map, Date.now()));
    }
  } catch {
    /* ignore */
  }

  projects.update((p) => {
    const updated = p.filter((x) => x.id !== projectId);
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(updated));
      localStorage.removeItem(NODES_KEY_PREFIX + projectId);
    } catch (e) {
      console.error('Failed to delete project:', e);
    }
    return updated;
  });

  const cur = get(currentProject);
  if (cur?.id === projectId) {
    currentProject.set(null);
    nodes.set([]);
    try {
      localStorage.removeItem(CURRENT_PROJECT_KEY);
    } catch (e) {
      console.error('Failed to clear current project:', e);
    }
  }
  registerDeletedProjectTombstone(projectId);
  markCloudWorkspaceDirty();
}

/** 모달 동기화 등: `canAccessProject` 거부 시 로컬 스토어·스토리지에서 일괄 제거 (deleteProject 경로 재사용) */
export function removeDeletedProjectsFromLocalCache(deletedIds: string[]): void {
  if (typeof window === 'undefined' || !Array.isArray(deletedIds) || deletedIds.length === 0) return;
  const seen = new Set<string>();
  for (const projectId of deletedIds) {
    if (!projectId || seen.has(projectId)) continue;
    seen.add(projectId);
    if (!get(projects).some((p) => p.id === projectId)) continue;
    deleteProject(projectId);
  }
}

/**
 * 클라우드 원격 히스토리 병합 (append-only, LWW)
 * - 로컬 + 원격 스냅샷 결합
 * - 버전 LWW: 같은 버전이면 최신 `at` 우선
 * - 중복 제거: 동일 (projectId, reason, at, version) 조합은 1번만
 * - 최신순 정렬 후 저장
 *
 * **축 분리:** `plannode_project_workspace_history`(서버 append·ACL)와 무관 — 모달은 `+page.svelte` `mergeModalSnapshotRows`에서 병합.
 */
function mergeHistoryEntriesFromCloudRemote(remoteEntries: HistoryEntry[]): void {
  if (typeof window === 'undefined' || !Array.isArray(remoteEntries)) return;

  try {
    const MAX_MERGED_ENTRIES = 100; // 로컬 + 원격 합치면 최대 100개

    // 기존 로컬 병합 히스토리 로드
    let localMerged: HistoryEntry[] = [];
    try {
      const raw = localStorage.getItem(MERGED_HISTORY_ENTRIES_LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          localMerged = parsed.filter(
            (x): x is HistoryEntry =>
              x &&
              typeof x === 'object' &&
              typeof (x as any).id === 'string' &&
              typeof (x as any).at === 'string'
          );
        }
      }
    } catch {
      localMerged = [];
    }

    // 로컬 + 원격 결합 (맵으로 중복 제거)
    const mergedMap = new Map<string, HistoryEntry>();

    // 기존 로컬 항목 추가 (충돌 시 로컬 우선)
    for (const entry of localMerged) {
      const key = `${entry.project_id}|${entry.reason}|${entry.at}|${entry.version ?? ''}`;
      if (!mergedMap.has(key)) {
        mergedMap.set(key, entry);
      }
    }

    // 원격 항목 병합 (LWW)
    for (const entry of remoteEntries) {
      const key = `${entry.project_id}|${entry.reason}|${entry.at}|${entry.version ?? ''}`;
      const existing = mergedMap.get(key);

      if (!existing) {
        // 새로운 항목 추가
        mergedMap.set(key, entry);
      } else if (entry.version && existing.version) {
        // 버전 비교 LWW: 같은 버전이면 최신 `at` 우선
        if (entry.version === existing.version) {
          const remoteTs = new Date(entry.at).getTime();
          const localTs = new Date(existing.at).getTime();
          if (remoteTs > localTs) {
            mergedMap.set(key, entry);
          }
        }
        // 버전이 다르면 로컬 유지 (로컬 우선)
      }
    }

    // 최신순 정렬 (ISO 날짜 역순)
    const merged = Array.from(mergedMap.values()).sort((a, b) => {
      const aTime = new Date(a.at).getTime();
      const bTime = new Date(b.at).getTime();
      return bTime - aTime;
    });

    // 최대값까지만 유지
    const trimmed = merged.slice(0, MAX_MERGED_ENTRIES);

    // localStorage 저장
    localStorage.setItem(MERGED_HISTORY_ENTRIES_LS_KEY, JSON.stringify(trimmed));
    nodeSnapshotCatalogRevision.update((n) => n + 1);
  } catch (e) {
    if (import.meta.env.DEV) {
      console.error('[mergeHistoryEntriesFromCloudRemote]', e);
    }
  }
}

/** `mergeHistoryEntriesFromCloudRemote`가 채운 병합 버퍼 → 모달용 `StoredNodeSnapshot` (C2). */
export function listMergedHistorySnapshotsForProject(projectId: string): StoredNodeSnapshot[] {
  if (typeof window === 'undefined' || !projectId) return [];
  let merged: HistoryEntry[] = [];
  try {
    const raw = localStorage.getItem(MERGED_HISTORY_ENTRIES_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    merged = parsed.filter(
      (x): x is HistoryEntry =>
        x &&
        typeof x === 'object' &&
        typeof (x as HistoryEntry).id === 'string' &&
        typeof (x as HistoryEntry).at === 'string' &&
        typeof (x as HistoryEntry).project_id === 'string' &&
        Array.isArray((x as HistoryEntry).nodes)
    );
  } catch {
    return [];
  }
  const out: StoredNodeSnapshot[] = [];
  for (const e of merged) {
    if (e.project_id !== projectId) continue;
    const reason = coerceStringToNodeSnapshotReason(String(e.reason));
    const nodes = JSON.parse(JSON.stringify(e.nodes)) as Node[];
    out.push({
      id: e.id,
      at: e.at,
      reason,
      nodes,
      version: e.version,
      nodeCount: nodes.length,
      pipelineLabel: pipelineLabelForNodeSnapshotReason(reason)
    });
  }
  return out;
}

/** 클라우드 동기용: 현재 스토어 + localStorage 노드 묶음 + 히스토리 */
export type WorkspaceBundle = {
  projects: Project[];
  nodesByProject: Record<string, Node[]>;
  historyEntries?: HistoryEntry[];
};

const parseTs = (iso: string | undefined): number => {
  const t = Date.parse(String(iso ?? ''));
  return Number.isFinite(t) ? t : 0;
};

/**
 * 모달 목록 카드(NOW-70~72): 로그인·클라우드 사용 가능 시 **`plannode_workspace.projects_json`** 행을 카드 행의 정본으로 쓰고,
 * 아직 서버에 없는 로컬 전용 프로젝트는 목록 뒤에 붙인다. 미로그인·`isAclEnforced()` 거짓(오프라인 호환)일 때는 로컬 `$projects`만 사용한다(+page).
 * 동일 id는 메타 **`updated_at`이 더 새쪽**을 카드에 표시(미플러시 로컬 편집분 우선).
 *
 * P2: pending 삭제 id 필터링 — 소유자가 삭제 중인 프로젝트는 모달에 나타나지 않도록.
 * P3: `viewerUid` + 고스트-hide — pending 제거 뒤에도 원격 `projects_json`에 잠깐 남은 id 모달 노출 차단.
 * P4: 삭제 톰브스톤 — pending 비움·캐시 일부 삭제 후에도 원격 고스트 id 모달·병합에서 제외(NOW-DEL-WS-02).
 */
/** 모달·ACL 검사용 — LWW로 고른 뒤에도 공유·소유 메타는 비어 있지 않은 쪽을 유지 */
function mergeProjectRowForModalList(cloud: Project, local: Project): Project {
  const lt = parseTs(local.updated_at);
  const ct = parseTs(cloud.updated_at);
  const base = lt > ct ? { ...local } : { ...cloud };
  return reconcileProjectRecord({
    ...base,
    cloud_workspace_source_user_id:
      local.cloud_workspace_source_user_id ?? cloud.cloud_workspace_source_user_id,
    owner_user_id: local.owner_user_id ?? cloud.owner_user_id,
    plan_project_id: local.plan_project_id ?? cloud.plan_project_id
  });
}

export function mergeModalListCloudCanon(
  cloudRows: Project[],
  localPlist: Project[],
  viewerUid?: string | null
): Project[] {
  const pendingDelete = getPendingWorkspaceDeletionIds();
  const ghostHide = getOwnedProjectGhostHideIdsForModal(viewerUid);
  const tombstoned = readDeletedProjectTombstoneIdSet();
  const cloudIds = new Set(cloudRows.map((p) => p.id));
  const out: Project[] = [];
  for (const cp of cloudRows) {
    // P2: 정책 7 pending 삭제 id는 모달 목록에서 제외
    if (pendingDelete.has(cp.id)) continue;
    if (ghostHide.has(cp.id)) continue;
    if (tombstoned.has(cp.id)) continue;

    const loc = localPlist.find((p) => p.id === cp.id);
    if (!loc) {
      out.push(reconcileProjectRecord(cp));
      continue;
    }
    out.push(mergeProjectRowForModalList(cp, loc));
  }
  for (const lp of localPlist) {
    // P2: pending 삭제 id는 로컬 전용 목록에서도 제외
    if (!cloudIds.has(lp.id) && !pendingDelete.has(lp.id) && !ghostHide.has(lp.id) && !tombstoned.has(lp.id))
      out.push(lp);
  }
  return out;
}

/** 동일 `id` 중복 행 제거 — **updated_at** 최신 한 줄만 유지(+page는 건드리지 않음). 저장·풀 라운드트립 후 목록 스테일 완화용(NOW-74). */
export function dedupeProjectsStoreByLatestUpdatedAt(): void {
  if (typeof window === 'undefined') return;
  const plist = get(projects);
  const bestById = new Map<string, Project>();
  for (const p of plist) {
    const prev = bestById.get(p.id);
    if (!prev || parseTs(p.updated_at) >= parseTs(prev.updated_at)) bestById.set(p.id, p);
  }
  const order = [...new Set(plist.map((p) => p.id))];
  const next = order.map((id) => bestById.get(id)!);
  if (next.length === plist.length) return;
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  projects.set(next);
  const cur = get(currentProject);
  if (cur) {
    const ref = next.find((p) => p.id === cur.id);
    if (ref) selectProject(ref);
  }
}

/**
 * 내 워크스페이스 업로드 번들 조립 — `projects` + `nodes_by_project` + **`historyEntries`**.
 *
 * **히스토리 이중 축 (NOW-HIST-APP-07 · 서버 중심 로드맵):**
 * - **`historyEntries` (본 함수):** `plannode_workspace` JSON에 실리는 **전 프로젝트 합산 최대 50건** — 로컬 링 스냅을 모아 전역 최신순으로 자름. 번들 크기·오프라인·LWW 풀과 정합.
 * - **`plannode_project_workspace_history`:** 별도 테이블 · ACL 공유 타임라인 · `uploadWorkspaceToCloud` 성공 후 디바운스 append (`projectWorkspaceHistory.ts`). 히스토리 모달은 `mergeModalSnapshotRows`에서 링·병합 버퍼·번들·서버 행을 합침.
 * **클라우드(서버) 단일 소스에 가깝게 이행**할 때는 본 상한·수집을 GATE·TASK로 단계 축소·중복 제거할 것 — 번들 `historyEntries`만 임의 제거하면 업로드·풀·공유 기대와 충돌할 수 있음.
 */
export function gatherWorkspaceBundle(): WorkspaceBundle {
  if (typeof window === 'undefined') {
    return { projects: get(projects), nodesByProject: {} };
  }
  const skip = workspaceDeletedProjectSkipIds();
  const plist = get(projects).filter((p) => !skip.has(p.id));
  const nodesByProject: Record<string, Node[]> = {};
  for (const p of plist) {
    nodesByProject[p.id] = loadLocalNodesForCollabMerge(p.id);
  }

  /** 최근 N개(50개) 스냅샷 수집 — 최신순 정렬 */
  const historyEntries: HistoryEntry[] = [];
  const MAX_HISTORY_ENTRIES = 50;
  const allSnapshots: Array<{ projectId: string; snapshot: any }> = [];

  for (const p of plist) {
    if (skip.has(p.id)) continue;
    const snaps = listNodeSnapshots(p.id);
    for (const snap of snaps) {
      allSnapshots.push({
        projectId: p.id,
        snapshot: snap
      });
    }
  }

  /** 최신순 정렬(ISO 날짜 역순) */
  allSnapshots.sort((a, b) => {
    const aTime = new Date(a.snapshot.at).getTime();
    const bTime = new Date(b.snapshot.at).getTime();
    return bTime - aTime;
  });

  /** 최대 50개까지 추가 */
  for (let i = 0; i < Math.min(allSnapshots.length, MAX_HISTORY_ENTRIES); i++) {
    const { projectId, snapshot } = allSnapshots[i];
    historyEntries.push({
      id: snapshot.id,
      project_id: projectId,
      at: snapshot.at,
      reason: snapshot.reason,
      version: snapshot.version,
      nodes: snapshot.nodes
    });
  }

  return { projects: [...plist], nodesByProject, historyEntries };
}

/** 로그아웃 직전 1회 스냅(M2-SESSION-SNAPSHOT NOW-41): `gatherWorkspaceBundle` + 선택 AI 탭 텍스트. 클라우드 upsert와 별도 `localStorage` 단일 키. */
export const LOGOUT_SESSION_SNAPSHOT_KEY = 'plannode_logout_bundle_snapshot_v1';
const LOGOUT_AI_TEXT_MAX = 80_000;

export type LogoutSessionSnapshotV1 = {
  v: 1;
  at: string;
  current_project_id: string | null;
  /** F2-5: 세션 `#ai-result` 본문 스냅(비-SSoT·GATE B) */
  ai_result_text?: string;
  bundle: WorkspaceBundle;
};

/**
 * PRD 초안·명세·IA는 번들 내 프로젝트/노드에 이미 포함된다(`prd_section_drafts`, 노드 필드, `metadata.iaGrid`).
 */
export function captureLogoutSessionSnapshot(opts?: { aiResultText?: string | null }): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const bundle = gatherWorkspaceBundle();
    const rawAi = opts?.aiResultText;
    const aiTrim = rawAi != null && String(rawAi).trim() ? String(rawAi).trim().slice(0, LOGOUT_AI_TEXT_MAX) : undefined;
    const snap: LogoutSessionSnapshotV1 = {
      v: 1,
      at: new Date().toISOString(),
      current_project_id: get(currentProject)?.id ?? null,
      ai_result_text: aiTrim,
      bundle
    };
    localStorage.setItem(LOGOUT_SESSION_SNAPSHOT_KEY, JSON.stringify(snap));
    return true;
  } catch {
    return false;
  }
}

/** NOW-43: 파싱된 로그아웃 세션 스냅 또는 null */
export function readLogoutSessionSnapshotV1(): LogoutSessionSnapshotV1 | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOGOUT_SESSION_SNAPSHOT_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<LogoutSessionSnapshotV1>;
    if (j?.v !== 1 || !j.bundle || !Array.isArray(j.bundle.projects)) return null;
    const nbp = j.bundle.nodesByProject;
    if (!nbp || typeof nbp !== 'object' || Array.isArray(nbp)) return null;
    return j as LogoutSessionSnapshotV1;
  } catch {
    return null;
  }
}

/** NOW-43: 불러오기 합의 완료 후 재표시 방지 */
export function clearLogoutSessionSnapshot(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(LOGOUT_SESSION_SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}

export function extractProjectSliceFromBundle(
  bundle: WorkspaceBundle,
  projectId: string
): { project: Project | null; nodes: Node[] } {
  const project = bundle.projects.find((p) => p.id === projectId) ?? null;
  const raw = bundle.nodesByProject[projectId];
  return { project, nodes: Array.isArray(raw) ? raw : [] };
}

/** NOW-43: 로그아웃 스냅에 담긴 프로젝트 슬라이스를 로컬에 적용 후 클라우드 푸시 대기 가능 */
export function applyLogoutSnapshotProjectToLocal(
  snapshot: LogoutSessionSnapshotV1,
  projectId: string,
  fallbackMeta: Project
): void {
  const { project: metaFromBundle, nodes } = extractProjectSliceFromBundle(snapshot.bundle, projectId);
  const meta = metaFromBundle ?? fallbackMeta;
  upsertImportedPlannodeTreeV1(meta, nodes, {
    openAfter: false,
    markDirty: true,
    preserveRemoteUpdatedAt: true
  });
}

/** 클라우드에서 받은 묶음으로 로컬·스토어 전면 교체 (현재 선택 해제) */
export function replaceWorkspaceFromBundle(bundle: WorkspaceBundle): void {
  if (typeof window === 'undefined') return;
  const plist = Array.isArray(bundle.projects) ? bundle.projects : [];
  const nodesByProject = bundle.nodesByProject && typeof bundle.nodesByProject === 'object' ? bundle.nodesByProject : {};

  localStorage.setItem(PROJECTS_KEY, JSON.stringify(plist));
  const keepIds = new Set(plist.map((p) => p.id));
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (!k?.startsWith(NODES_KEY_PREFIX)) continue;
    const pid = k.slice(NODES_KEY_PREFIX.length);
    if (!keepIds.has(pid)) localStorage.removeItem(k);
  }
  for (const p of plist) {
    const arr = nodesByProject[p.id];
    localStorage.setItem(NODES_KEY_PREFIX + p.id, JSON.stringify(Array.isArray(arr) ? arr : []));
  }

  projects.set(plist);
  currentProject.set(null);
  nodes.set([]);
  clearPendingWorkspaceDeletions();
  markCloudWorkspaceSynced();
}

/** plannode.tree v1 가져오기: 프로젝트 upsert + 노드 저장. openAfter=false면 호출측에서 권한 검사 후 선택 */
export function upsertImportedPlannodeTreeV1(
  project: Project,
  nodeList: Node[],
  opts?: {
    openAfter?: boolean;
    markDirty?: boolean;
    preserveRemoteUpdatedAt?: boolean;
    /** false = 클라우드 pull 병합(의도적 re-import 아님) — tombstone 유지 */
    clearDeletedTombstone?: boolean;
  }
): Project | null {
  if (typeof window === 'undefined') return null;

  const plist = get(projects);
  const idx = plist.findIndex((p) => p.id === project.id);
  const prev = idx >= 0 ? plist[idx] : null;
  const merged: Project = reconcileProjectRecord({
    ...project,
    created_at: prev?.created_at ?? project.created_at,
    updated_at: opts?.preserveRemoteUpdatedAt
      ? String(project.updated_at || new Date().toISOString())
      : new Date().toISOString(),
    cloud_workspace_source_user_id:
      project.cloud_workspace_source_user_id ?? prev?.cloud_workspace_source_user_id
  });
  if (prev && projectBadgePoolSnapshot(prev) !== projectBadgePoolSnapshot(merged)) {
    clearBadgePoolRuntimeCache(merged.id);
    badgePoolRevision.update((n) => n + 1);
  }
  const next = idx >= 0 ? plist.map((p, i) => (i === idx ? merged : p)) : [...plist, merged];

  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(next));
  } catch (e) {
    console.error('Failed to save projects after import:', e);
    return null;
  }
  projects.set(next);

  const nodesForStore = nodeList.map(applySanitizeImportedPlannodeNodeV1);
  try {
    localStorage.setItem(NODES_KEY_PREFIX + merged.id, JSON.stringify(nodesForStore));
  } catch (e) {
    console.error('Failed to save imported nodes:', e);
    return null;
  }

  const curOpen = get(currentProject);
  if (curOpen?.id === merged.id) {
    nodes.set(nodesForStore);
  }

  try {
    /** 원본 가져오기 노드(`description` 포함)로 배지 학습 병합 — 저장 sanitize 전 스냅샷 */
    mergeLearnedBadgeRulesFromImportedNodes(nodeList);
  } catch {
    /* 학습 병합 실패는 가져오기 본편에 영향 없음 */
  }

  const selected = next.find((p) => p.id === merged.id) ?? merged;
  if (opts?.openAfter !== false) {
    selectProject(selected);
  }
  if (opts?.markDirty !== false) {
    markCloudWorkspaceDirty();
  }
  if (opts?.clearDeletedTombstone !== false) {
    clearDeletedProjectTombstoneForReimport(merged.id);
  }
  return selected;
}

/** 로컬에 저장된 프로젝트 노드만 읽기(스토어와 무관) — 클라우드 병합 시 사용 */
export function loadProjectNodesFromLocalStorage(projectId: string): Node[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(NODES_KEY_PREFIX + projectId);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? (arr as Node[]) : [];
  } catch {
    return [];
  }
}

/** id 기준 정렬 후 JSON — 병합 후 변경 여부 비교용 */
export function projectWorkspaceNodesJsonSnapshot(nodes: Node[]): string {
  return JSON.stringify(
    [...nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  );
}

/**
 * 동접·다기기: 원격 워크스페이스 스냅샷과 로컬 노드를 id 단위로 합침.
 * - remoteProjectMetaNewer: 프로젝트 메타가 원격이 더 최신으로 간주될 때 **원격 목록에 없는 id는 삭제로 간주**,
 *   동일 id는 `updated_at`이 같거나 더 새로운 쪽(동률 시 원격 우선). OT/CRDT가 아니므로 **번들·슬라이스 풀에서는
 *   이 플래그를 쓰지 않는 것이 안전**하다(프로젝트 `updated_at`만 앞서고 노드 JSON이 뒤처진 순간 로컬 신규 노드가 통째로 사라질 수 있음).
 *   **반환 배열의 평면 순서는 `remoteNodes`와 동일**하게 유지(형제 드래그 순서·파일럿 렌더 정합).
 * - 그렇지 않음: 원격에서 더 새로운 `updated_at`인 노드만 흡수(로컬 전용 id·로컬 삭제 유지).
 * `suppressRecentDeletesProjectId`가 있으면 `registerRecentlyDeletedNodeIdsForCloudMerge`로 등록된 id는
 * **원격 메타가 더 최신이어도** 로컬에 없을 때는 넣지 않음(소유자 슬라이스가 merge 실패 등으로 옛 목록을 유지할 때 되살림 방지).
 * `preserveLocalNewIds`: `remoteProjectMetaNewer === true`일 때 원격 목록에 없는 로컬 id를 통째 삭제하지 않도록
 * **예외 집합**(아직 소유자 슬라이스에 안 올라간 신규 노드 등). 보존된 노드는 원격 순서 뒤에 **로컬 배열 순서**로 붙인다.
 * CSP: id LWW로 remote row가 이겼을 때 `mx`/`my`가 없으면 local non-null 좌표를 유지(Broadcast 후 slice 덮어쓰기 완화).
 */
function preserveManualCoordsOnCloudMergeWinner(remote: Node, local: Node | undefined): Node {
  if (!local) return remote;
  // [수정] Bug-2 (2026-06-01): 축별 독립 null 처리
  // 이전: mx AND my 둘 다 null일 때만 자동배치로 확정 → 부분 null(mx=null, my=200 등)은
  //       guard를 통과하지 못해 local.mx가 복원되고 비대칭 좌표 → 겹침·쏠림 발생.
  // 수정: 각 축이 명시 null이면 자동배치(undefined), non-null이면 remote 우선, undefined면 local 보존.
  // TS 타입은 number|undefined지만 런타임에서 null 사용 → 캐스트 처리
  const rnx = remote.mx as number | null | undefined;
  const rny = remote.my as number | null | undefined;
  const resMx: number | undefined = rnx != null ? rnx : rnx === null ? undefined : local.mx;
  const resMy: number | undefined = rny != null ? rny : rny === null ? undefined : local.my;
  if (resMx === remote.mx && resMy === remote.my) return remote;
  return { ...remote, mx: resMx, my: resMy };
}

export function mergeNodeListsForCloud(
  localNodes: Node[],
  remoteNodes: Node[],
  remoteProjectMetaNewer: boolean,
  /** 최근 삭제 억제를 적용할 프로젝트 id(선택) */
  suppressRecentDeletesProjectId?: string | null,
  /** `remoteProjectMetaNewer`일 때만 적용 — 원격 부재 로컬 id 삭제 예외(선택) */
  preserveLocalNewIds?: ReadonlySet<string> | null
): Node[] {
  const byId = new Map<string, Node>();
  for (const n of localNodes) {
    byId.set(n.id, n);
  }
  if (remoteProjectMetaNewer) {
    const suppress = recentDeleteIdsForCloudMerge(suppressRecentDeletesProjectId ?? null);
    const remoteIds = new Set(remoteNodes.map((x) => x.id));
    const preserve = preserveLocalNewIds ?? null;
    for (const id of [...byId.keys()]) {
      if (!remoteIds.has(id)) {
        if (preserve?.has(id)) continue;
        byId.delete(id);
      }
    }
    for (const rn of remoteNodes) {
      const cur = byId.get(rn.id);
      if (!cur && suppress.has(rn.id)) continue;
      if (!cur || parseTs(rn.updated_at) >= parseTs(cur.updated_at)) {
        byId.set(rn.id, preserveManualCoordsOnCloudMergeWinner(rn, cur));
      }
    }
    /** 원격 스냅샷의 평면 배열 순서 유지 — 파일럿 형제 순서·레이아웃(`nodes.filter(parent_id)`)과 일치 */
    const ordered: Node[] = [];
    for (const rn of remoteNodes) {
      const v = byId.get(rn.id);
      if (v) ordered.push(v);
    }
    if (preserve && preserve.size) {
      const inOrdered = new Set(ordered.map((x) => x.id));
      for (const n of localNodes) {
        if (!remoteIds.has(n.id) && preserve.has(n.id) && !inOrdered.has(n.id)) {
          const v = byId.get(n.id);
          if (v) {
            ordered.push(v);
            inOrdered.add(n.id);
          }
        }
      }
    }
    // [Bug-3 (2026-06-01)] BAR 후 pull race: grace period 내 원격 mx/my 강제 자동배치
    if (isLayoutResetPending(suppressRecentDeletesProjectId)) {
      return ordered.map((n) => ({ ...n, mx: undefined, my: undefined }));
    }
    return ordered;
  } else {
    const suppress = recentDeleteIdsForCloudMerge(suppressRecentDeletesProjectId ?? null);
    for (const rn of remoteNodes) {
      const cur = byId.get(rn.id);
      if (!cur) {
        if (suppress.has(rn.id)) continue;
        byId.set(rn.id, rn);
        continue;
      }
      if (parseTs(rn.updated_at) > parseTs(cur.updated_at)) {
        byId.set(rn.id, preserveManualCoordsOnCloudMergeWinner(rn, cur));
      }
    }
    /**
     * 로컬 메타가 더 최신이어도 원격에 있는 노드들의 상대 순서를 앞에 두고,
     * 로컬 전용 노드(원격에 없는 것)를 뒤에 붙인다.
     * 파일럿은 nodes.filter(parent_id===…)의 배열 순서로 형제를 표시하므로
     * 소유자가 바꾼 드래그 순서가 공유 계정에 올바르게 반영된다.
     */
    const remoteIdOrder = new Set(remoteNodes.map((x) => x.id));
    const ordered: Node[] = [];
    for (const rn of remoteNodes) {
      const v = byId.get(rn.id);
      if (v) ordered.push(v);
    }
    for (const [id, v] of byId) {
      if (!remoteIdOrder.has(id)) ordered.push(v);
    }
    // [Bug-3 (2026-06-01)] BAR 후 pull race: grace period 내 원격 mx/my 강제 자동배치
    if (isLayoutResetPending(suppressRecentDeletesProjectId)) {
      return ordered.map((n) => ({ ...n, mx: undefined, my: undefined }));
    }
    return ordered;
  }
  return [...byId.values()];
}

/**
 * 프로젝트 `updated_at` 선후에 따라 노드 병합 모드를 고른다(공유·소유자 동일 정책).
 * - 원격 메타가 더 새로우면: 원격에 없는 로컬 id 제거 + 보존 — 노드 `updated_at` > 원격 프로젝트 메타,
 *   또는 동시 편집 시 `touchProjectUpdatedAt`과 같은 시각으로 저장된 로컬 전용 id(`updated_at` ≥ 로컬 프로젝트 메타).
 * - 로컬 메타가 더 새로워도: 원격 슬라이스에 없고 노드 `updated_at` ≤ 원격 프로젝트 메타인 id는 **소유자 삭제**로 보고 제거
 *   (공유 쪽 메타만 앞선 채로 풀할 때 삭제가 안 보이던 회귀 방지).
 * - 그 외 로컬 전용 id: LWW 흡수만(`false`) 후 위 삭제 필터.
 */
export function mergeNodeListsForCloudByProjectMeta(
  localNodes: Node[],
  remoteNodes: Node[],
  localProjectUpdatedAt: string | undefined,
  remoteProjectUpdatedAt: string | undefined,
  projectId: string
): Node[] {
  const rTime = parseTs(remoteProjectUpdatedAt);
  const lTime = parseTs(localProjectUpdatedAt);
  const remoteIds = new Set(remoteNodes.map((x) => x.id));

  const dropStaleLocalOnlyAbsentOnRemote = (list: Node[]): Node[] =>
    list.filter((n) => remoteIds.has(n.id) || parseTs(n.updated_at) > rTime);

  if (rTime > lTime) {
    const recentAdds = recentAddIdsForCloudMerge(projectId);
    const metaSlackFloor = lTime - COLLAB_PRESERVE_META_SLACK_MS;
    const preserve = new Set(
      localNodes
        .filter((n) => {
          if (remoteIds.has(n.id)) return false;
          if (recentAdds.has(n.id)) return true;
          const nt = parseTs(n.updated_at);
          return nt > rTime || nt >= lTime || nt >= metaSlackFloor;
        })
        .map((n) => n.id)
    );
    return mergeNodeListsForCloud(localNodes, remoteNodes, true, projectId, preserve);
  }
  return dropStaleLocalOnlyAbsentOnRemote(
    mergeNodeListsForCloud(localNodes, remoteNodes, false, projectId)
  );
}

function projectBadgePoolSnapshot(p: Project): string {
  return p.badge_pool != null ? JSON.stringify(normalizeBadgePool(p.badge_pool)) : '';
}

/**
 * 클라우드 LWW 병합 시 프로젝트 설정 메타(`name`·일정·`description`·`badge_pool`)가
 * 노드 편집으로만 앞선 원격 `updated_at`에 의해 통째로 덮이지 않도록 보수적으로 합친다.
 */
export function mergeProjectMetaForCloudSync(local: Project, remote: Project): Project {
  const lTime = parseTs(local.updated_at);
  const rTime = parseTs(remote.updated_at);
  const remoteWins = rTime > lTime;
  const base = remoteWins ? { ...remote } : { ...local };

  const pickStr = (k: 'name' | 'author' | 'start_date' | 'end_date'): string => {
    const lv = String(local[k] ?? '').trim();
    const rv = String(remote[k] ?? '').trim();
    if (remoteWins) return rv || lv;
    return lv || rv;
  };

  const pickDesc = (): string => {
    const lv = String(local.description ?? '');
    const rv = String(remote.description ?? '');
    if (remoteWins) return rv || lv;
    return lv || rv;
  };

  const pickBadgePool = (): Project['badge_pool'] => {
    const lHas = local.badge_pool != null;
    const rHas = remote.badge_pool != null;
    /** 공유 멤버 로컬: 소유자 워크스페이스 슬라이스의 풀이 정본(노드 편집으로 로컬 `updated_at`만 앞선 경우에도) */
    if (local.cloud_workspace_source_user_id) {
      if (rHas) return normalizeBadgePool(remote.badge_pool!);
      if (lHas) return normalizeBadgePool(local.badge_pool!);
      return undefined;
    }
    if (lHas && !rHas) return normalizeBadgePool(local.badge_pool!);
    if (rHas && !lHas) return normalizeBadgePool(remote.badge_pool!);
    if (lHas && rHas) {
      return normalizeBadgePool(remoteWins ? remote.badge_pool! : local.badge_pool!);
    }
    return undefined;
  };

  return reconcileProjectRecord({
    ...base,
    name: pickStr('name'),
    author: pickStr('author'),
    start_date: pickStr('start_date'),
    end_date: pickStr('end_date'),
    description: pickDesc(),
    badge_pool: pickBadgePool(),
    cloud_workspace_source_user_id:
      local.cloud_workspace_source_user_id ?? remote.cloud_workspace_source_user_id,
    updated_at: remoteWins ? remote.updated_at : local.updated_at
  });
}

function projectMetaFieldsDiffer(a: Project, b: Project): boolean {
  return (
    a.name !== b.name ||
    a.author !== b.author ||
    a.start_date !== b.start_date ||
    a.end_date !== b.end_date ||
    (a.description ?? '') !== (b.description ?? '') ||
    (a.owner_user_id ?? '') !== (b.owner_user_id ?? '') ||
    projectBadgePoolSnapshot(a) !== projectBadgePoolSnapshot(b)
  );
}

/**
 * 내 plannode_workspace 행 기준: 원격 번들과 로컬을 합침.
 * 프로젝트 **메타**(이름·기간 등)는 `remoteProjectMetaNewer`로 원격/로컬 중 어느 객체를 베이스로 쓸지 고르고,
 * **노드 배열**은 항상 보수적 LWW만 적용한다(`mergeNodeListsForCloud` 세 번째 인자 고정 `false`).
 * 동시·근접 편집에서 프로젝트 `updated_at`만 앞선 스냅샷이 오면 `true` 경로가 로컬 전용 노드를 삭제로 처리하는 회귀를 막기 위함.
 * (원격에서 실제로 삭제된 노드는 별도 톰스톤 없이 즉시 모든 기기에 반영되지 않을 수 있음 — 비실시간 번들 한계.)
 *
 * **히스토리 병합(append-only, LWW):**
 * - 로컬 `historyEntries` 있으면, 원격 항목과 병합
 * - 각 항목의 `version` 필드 기반 LWW (같은 버전이면 최신 `at` 우선)
 * - append-only 원칙: 기존 히스토리 덮어쓰기 금지, 신규 항목만 추가
 * - 중복 제거: 같은 `at`, `reason`, `project_id` 조합은 1번만
 * - 최종 정렬: 최신순
 *
 * **번들 `historyEntries`만** 병합한다. 서버 `plannode_project_workspace_history`는 별도(`fetchProjectWorkspaceHistorySnapshots`).
 */
export function mergeWorkspaceBundleFromCloudRemote(remote: WorkspaceBundle): number {
  if (typeof window === 'undefined') return 0;
  let n = 0;
  const rp = Array.isArray(remote.projects) ? remote.projects : [];
  const skipIds = workspaceDeletedProjectSkipIds();
  const map =
    remote.nodesByProject && typeof remote.nodesByProject === 'object' ? remote.nodesByProject : {};

  for (const project of rp) {
    if (skipIds.has(project.id)) continue;
    const plist = get(projects);
    const local = plist.find((p) => p.id === project.id);
    const remoteList = Array.isArray(map[project.id]) ? (map[project.id] as Node[]) : [];
    const rTime = parseTs(project.updated_at);
    const lTime = local ? parseTs(local.updated_at) : -1;
    const remoteProjectMetaNewer = !local || rTime > lTime;
    const localNodes = local ? loadProjectNodesFromLocalStorage(project.id) : [];
    const mergedNodes = mergeNodeListsForCloudByProjectMeta(
      localNodes,
      remoteList,
      local?.updated_at,
      project.updated_at,
      project.id
    );
    const keepSrc = local?.cloud_workspace_source_user_id ?? project.cloud_workspace_source_user_id;

    const remoteProj = reconcileProjectRecord({
      ...project,
      cloud_workspace_source_user_id: keepSrc
    });
    const mergedProject: Project = local
      ? mergeProjectMetaForCloudSync(
          reconcileProjectRecord({ ...local, cloud_workspace_source_user_id: keepSrc }),
          remoteProj
        )
      : remoteProj;

    if (!local) {
      upsertImportedPlannodeTreeV1(mergedProject, mergedNodes, {
        openAfter: false,
        markDirty: false,
        preserveRemoteUpdatedAt: true,
        clearDeletedTombstone: false
      });
      n++;
      continue;
    }

    const nodesChanged = projectWorkspaceNodesJsonSnapshot(mergedNodes) !== projectWorkspaceNodesJsonSnapshot(localNodes);
    const metaChanged = remoteProjectMetaNewer ? projectMetaFieldsDiffer(mergedProject, local) : false;
    const projectTsChanged =
      remoteProjectMetaNewer &&
      String(mergedProject.updated_at || '') !== String(local.updated_at || '');

    if (nodesChanged || metaChanged || projectTsChanged) {
      captureNodeSnapshot(
        project.id,
        localNodes,
        'pre_pull',
        buildNodeSnapshotCaptureMeta('pre_pull', local, localNodes)
      );
      upsertImportedPlannodeTreeV1(mergedProject, mergedNodes, {
        openAfter: false,
        markDirty: false,
        preserveRemoteUpdatedAt: remoteProjectMetaNewer,
        clearDeletedTombstone: false
      });
      n++;
    }
  }

  /** 히스토리 병합(append-only, LWW) */
  mergeHistoryEntriesFromCloudRemote(remote.historyEntries ?? []);

  stripResurrectedDeletedProjectsFromLocal(skipIds);

  if (n > 0) {
    const cur = get(currentProject);
    if (cur) {
      const ref = get(projects).find((p) => p.id === cur.id);
      if (ref) selectProject(ref);
    }
  }
  return n;
}

registerProjectBadgePoolLookup((projectId) => getProjectBadgePool(projectId));
registerCurrentProjectIdLookup(() => get(currentProject)?.id ?? null);
