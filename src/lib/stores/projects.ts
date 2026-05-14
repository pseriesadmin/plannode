import { writable, get } from 'svelte/store';
import type { Project, Node, HistoryEntry } from '$lib/supabase/client';
import { getAuthEmail } from '$lib/stores/authSession';
import { applySanitizeImportedPlannodeNodeV1 } from '$lib/ai/badgePromptInjector';
import { mergeLearnedBadgeRulesFromImportedNodes } from '$lib/ai/badgeMetadataInference';
import type { PrdSectionKey } from '$lib/prdStandardV20';
import { markCloudWorkspaceDirty, markCloudWorkspaceSynced } from '$lib/stores/workspaceDirty';
import {
  captureNodeSnapshot,
  listNodeSnapshots,
  nodeSnapshotCatalogRevision,
  coerceStringToNodeSnapshotReason,
  type StoredNodeSnapshot,
  type NodeSnapshotCaptureMeta,
  type NodeSnapshotReason
} from '$lib/stores/nodeSnapshotHistory';

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
/** 새로고침·재접속 후에도 잠시 유지 — 만료 후 자동 정리 */
const CLOUD_MERGE_SUPPRESSED_DELETES_KEY = 'plannode_cloud_merge_suppressed_deletes_v1';
const CLOUD_MERGE_DISK_TTL_MS = 48 * 60 * 60 * 1000;
const CLOUD_MERGE_DISK_MAX_IDS_PER_PROJECT = 120;

type RecentDelMergeBucket = { ids: Set<string>; until: number };
const recentlyDeletedNodeIdsForCloudMerge = new Map<string, RecentDelMergeBucket>();

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
 * NOW-DEL-WS-02: `pruneDeletedProjectTombstonesAgainstCloudProjectIds`로 정본에 없으면 항목 제거.
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

/** 서버 정본 `projects_json` id 집합에 없으면 톰브스톤 제거(업로드 반영·고스트 소거 후). */
export function pruneDeletedProjectTombstonesAgainstCloudProjectIds(cloudProjectIds: Set<string>): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  let map = pruneExpiredDeletedProjectTombstones(readDeletedProjectTombstoneMap(), now);
  let changed = false;
  for (const id of Object.keys(map)) {
    if (!cloudProjectIds.has(id)) {
      delete map[id];
      changed = true;
    }
  }
  map = pruneExpiredDeletedProjectTombstones(map, now);
  if (changed) {
    writeDeletedProjectTombstoneMap(map);
    return;
  }
  const raw = readDeletedProjectTombstoneMap();
  const pruned = pruneExpiredDeletedProjectTombstones(raw, now);
  if (JSON.stringify(pruned) !== JSON.stringify(raw)) writeDeletedProjectTombstoneMap(pruned);
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
      projects.set(Array.isArray(parsed) ? parsed : []);
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

/** 노드·캔버스 변경 시 프로젝트 `updated_at`만 갱신 — 클라우드 LWW 동기화용 */
export function touchProjectUpdatedAt(projectId: string): void {
  if (typeof window === 'undefined') return;
  const now = new Date().toISOString();
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
  markCloudWorkspaceDirty();
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('plannode-auto-cloud-sync', { detail: { reason: 'node-edit' } }));
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

/** 파일럿 캔버스에서 전체 노드 스냅샷 저장 (현재 프로젝트와 id 일치 시만) */
export function persistNodesFromPilot(projectId: string, list: Node[]) {
  if (typeof window === 'undefined') return;
  
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
  if (removed.length) {
    registerRecentlyDeletedNodeIdsForCloudMerge(projectId, removed);
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
  touchProjectUpdatedAt(projectId);
  schedulePersistNodeSnapshotAfterPilot(projectId);
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
      out.push(cp);
      continue;
    }
    const lt = parseTs(loc.updated_at);
    const ct = parseTs(cp.updated_at);
    out.push(lt > ct ? loc : cp);
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

export function gatherWorkspaceBundle(): WorkspaceBundle {
  if (typeof window === 'undefined') {
    return { projects: get(projects), nodesByProject: {} };
  }
  const plist = get(projects);
  const nodesByProject: Record<string, Node[]> = {};
  for (const p of plist) {
    const raw = localStorage.getItem(NODES_KEY_PREFIX + p.id);
    if (raw) {
      try {
        const arr = JSON.parse(raw) as unknown;
        nodesByProject[p.id] = Array.isArray(arr) ? (arr as Node[]) : [];
      } catch {
        nodesByProject[p.id] = [];
      }
    } else {
      nodesByProject[p.id] = [];
    }
  }

  /** 최근 N개(50개) 스냅샷 수집 — 최신순 정렬 */
  const historyEntries: HistoryEntry[] = [];
  const MAX_HISTORY_ENTRIES = 50;
  const allSnapshots: Array<{ projectId: string; snapshot: any }> = [];

  for (const p of plist) {
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
  opts?: { openAfter?: boolean; markDirty?: boolean; preserveRemoteUpdatedAt?: boolean }
): Project | null {
  if (typeof window === 'undefined') return null;

  const plist = get(projects);
  const idx = plist.findIndex((p) => p.id === project.id);
  const prev = idx >= 0 ? plist[idx] : null;
  const merged: Project = {
    ...project,
    created_at: prev?.created_at ?? project.created_at,
    updated_at: opts?.preserveRemoteUpdatedAt
      ? String(project.updated_at || new Date().toISOString())
      : new Date().toISOString(),
    cloud_workspace_source_user_id:
      project.cloud_workspace_source_user_id ?? prev?.cloud_workspace_source_user_id
  };
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
  clearDeletedProjectTombstoneForReimport(merged.id);
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
 * - remoteProjectMetaNewer: 프로젝트 메타가 원격이 더 최신 → 원격 목록에 없는 id는 삭제로 간주, 동일 id는 updated_at이 같거나 더 새로운 쪽(원격 동률 시 원격 우선).
 *   **반환 배열의 평면 순서는 `remoteNodes`와 동일**하게 유지(형제 드래그 순서·파일럿 렌더 정합).
 * - 그렇지 않음: 로컬 메타가 같거나 더 최신 → 원격에서 더 새로운 updated_at인 노드만 흡수(로컬 전용 id·삭제 유지).
 * `suppressRecentDeletesProjectId`가 있으면 `registerRecentlyDeletedNodeIdsForCloudMerge`로 등록된 id는
 * **원격 메타가 더 최신이어도** 로컬에 없을 때는 넣지 않음(소유자 슬라이스가 merge 실패 등으로 옛 목록을 유지할 때 되살림 방지).
 */
export function mergeNodeListsForCloud(
  localNodes: Node[],
  remoteNodes: Node[],
  remoteProjectMetaNewer: boolean,
  /** 최근 삭제 억제를 적용할 프로젝트 id(선택) */
  suppressRecentDeletesProjectId?: string | null
): Node[] {
  const byId = new Map<string, Node>();
  for (const n of localNodes) {
    byId.set(n.id, n);
  }
  if (remoteProjectMetaNewer) {
    const suppress = recentDeleteIdsForCloudMerge(suppressRecentDeletesProjectId ?? null);
    const remoteIds = new Set(remoteNodes.map((x) => x.id));
    for (const id of [...byId.keys()]) {
      if (!remoteIds.has(id)) byId.delete(id);
    }
    for (const rn of remoteNodes) {
      const cur = byId.get(rn.id);
      if (!cur && suppress.has(rn.id)) continue;
      if (!cur || parseTs(rn.updated_at) >= parseTs(cur.updated_at)) {
        byId.set(rn.id, rn);
      }
    }
    /** 원격 스냅샷의 평면 배열 순서 유지 — 파일럿 형제 순서·레이아웃(`nodes.filter(parent_id)`)과 일치 */
    const ordered: Node[] = [];
    for (const rn of remoteNodes) {
      const v = byId.get(rn.id);
      if (v) ordered.push(v);
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
        byId.set(rn.id, rn);
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
    return ordered;
  }
  return [...byId.values()];
}

function projectMetaFieldsDiffer(a: Project, b: Project): boolean {
  return (
    a.name !== b.name ||
    a.author !== b.author ||
    a.start_date !== b.start_date ||
    a.end_date !== b.end_date ||
    (a.description ?? '') !== (b.description ?? '') ||
    (a.owner_user_id ?? '') !== (b.owner_user_id ?? '')
  );
}

/**
 * 내 plannode_workspace 행 기준: 원격 번들과 로컬을 합침.
 * 프로젝트 메타 최신 여부와 무관하게 노드 수준 LWW는 항상 적용한다.
 * - remoteProjectMetaNewer: 원격 목록에 없는 id를 삭제로 간주 + 동일 id는 updated_at 비교
 * - !remoteProjectMetaNewer: 원격에서 더 새로운 노드만 흡수(로컬 전용 노드·순서 유지)
 *
 * **히스토리 병합(append-only, LWW):**
 * - 로컬 `historyEntries` 있으면, 원격 항목과 병합
 * - 각 항목의 `version` 필드 기반 LWW (같은 버전이면 최신 `at` 우선)
 * - append-only 원칙: 기존 히스토리 덮어쓰기 금지, 신규 항목만 추가
 * - 중복 제거: 같은 `at`, `reason`, `project_id` 조합은 1번만
 * - 최종 정렬: 최신순
 */
export function mergeWorkspaceBundleFromCloudRemote(remote: WorkspaceBundle): number {
  if (typeof window === 'undefined') return 0;
  let n = 0;
  const rp = Array.isArray(remote.projects) ? remote.projects : [];
  const skipIds = new Set<string>([
    ...readPendingWorkspaceDeletionSet(),
    ...readDeletedProjectTombstoneIdSet()
  ]);
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
    /** 로컬 메타가 더 새더라도 노드 수준 LWW는 항상 수행 — 배지·순서 변경 반영 */
    const mergedNodes = mergeNodeListsForCloud(localNodes, remoteList, remoteProjectMetaNewer, project.id);
    const keepSrc = local?.cloud_workspace_source_user_id ?? project.cloud_workspace_source_user_id;

    const mergedProject: Project = remoteProjectMetaNewer
      ? { ...project, cloud_workspace_source_user_id: keepSrc }
      : local
        ? { ...local, cloud_workspace_source_user_id: keepSrc }
        : { ...project, cloud_workspace_source_user_id: keepSrc };

    if (!local) {
      upsertImportedPlannodeTreeV1(mergedProject, mergedNodes, {
        openAfter: false,
        markDirty: false,
        preserveRemoteUpdatedAt: true
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
        preserveRemoteUpdatedAt: remoteProjectMetaNewer
      });
      n++;
    }
  }

  /** 히스토리 병합(append-only, LWW) */
  mergeHistoryEntriesFromCloudRemote(remote.historyEntries ?? []);

  if (n > 0) {
    const cur = get(currentProject);
    if (cur) {
      const ref = get(projects).find((p) => p.id === cur.id);
      if (ref) selectProject(ref);
    }
  }
  return n;
}
