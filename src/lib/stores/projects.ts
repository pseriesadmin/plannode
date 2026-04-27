import { writable, get } from 'svelte/store';
import type { Project, Node } from '$lib/supabase/client';
import { markCloudWorkspaceDirty, markCloudWorkspaceSynced } from '$lib/stores/workspaceDirty';

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

/** 클라우드 LWW 병합이 로컬 삭제 직후 서버 스냅샷으로 프로젝트를 되살리지 않도록 유지 */
const WORKSPACE_PENDING_DELETE_IDS_KEY = 'plannode_workspace_pending_delete_ids_v1';

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

  // 현재 열린 프로젝트 복원
  try {
    const currentStored = localStorage.getItem(CURRENT_PROJECT_KEY);
    if (currentStored) {
      const currentProj = JSON.parse(currentStored) as Project | null;
      if (currentProj) {
        // 프로젝트가 여전히 목록에 있는지 확인
        const plist = get(projects);
        const exists = plist.some((p) => p.id === currentProj.id);
        if (exists) {
          selectProject(currentProj);
        }
      }
    }
  } catch (e) {
    console.error('Failed to restore current project:', e);
  }
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
      const rootNode = makeRootNode(project);
      const nodeList = [rootNode];
      nodes.set(nodeList);
      localStorage.setItem(NODES_KEY_PREFIX + project.id, JSON.stringify(nodeList));
      markCloudWorkspaceDirty();
    }
  } catch (e) {
    console.error('Failed to load nodes:', e);
    const rootNode = makeRootNode(project);
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

  const rootNode = makeRootNode(newProject);

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
  const cur = get(currentProject);
  if (!cur || cur.id !== projectId) return;
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
  markCloudWorkspaceDirty();
}

/** 클라우드 동기용: 현재 스토어 + localStorage 노드 묶음 */
export type WorkspaceBundle = {
  projects: Project[];
  nodesByProject: Record<string, Node[]>;
};

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
  return { projects: [...plist], nodesByProject };
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

  try {
    localStorage.setItem(NODES_KEY_PREFIX + merged.id, JSON.stringify(nodeList));
  } catch (e) {
    console.error('Failed to save imported nodes:', e);
    return null;
  }

  const selected = next.find((p) => p.id === merged.id) ?? merged;
  if (opts?.openAfter !== false) {
    selectProject(selected);
  }
  if (opts?.markDirty !== false) {
    markCloudWorkspaceDirty();
  }
  return selected;
}

const parseTs = (iso: string | undefined): number => {
  const t = Date.parse(String(iso ?? ''));
  return Number.isFinite(t) ? t : 0;
};

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
 * - 그렇지 않음: 로컬 메타가 같거나 더 최신 → 원격에서 더 새로운 updated_at인 노드만 흡수(로컬 전용 id·삭제 유지).
 */
export function mergeNodeListsForCloud(
  localNodes: Node[],
  remoteNodes: Node[],
  remoteProjectMetaNewer: boolean
): Node[] {
  const byId = new Map<string, Node>();
  for (const n of localNodes) {
    byId.set(n.id, n);
  }
  if (remoteProjectMetaNewer) {
    const remoteIds = new Set(remoteNodes.map((x) => x.id));
    for (const id of [...byId.keys()]) {
      if (!remoteIds.has(id)) byId.delete(id);
    }
    for (const rn of remoteNodes) {
      const cur = byId.get(rn.id);
      if (!cur || parseTs(rn.updated_at) >= parseTs(cur.updated_at)) {
        byId.set(rn.id, rn);
      }
    }
  } else {
    for (const rn of remoteNodes) {
      const cur = byId.get(rn.id);
      if (!cur || parseTs(rn.updated_at) > parseTs(cur.updated_at)) {
        byId.set(rn.id, rn);
      }
    }
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
 * 프로젝트 updated_at 비교에 더해, 동일 프로젝트라도 노드별 updated_at으로 수정·추가를 흡수하고,
 * 원격 메타가 더 최신일 때만 원격 목록에 없는 노드를 삭제로 반영.
 */
export function mergeWorkspaceBundleFromCloudRemote(remote: WorkspaceBundle): number {
  if (typeof window === 'undefined') return 0;
  let n = 0;
  const rp = Array.isArray(remote.projects) ? remote.projects : [];
  const skipIds = readPendingWorkspaceDeletionSet();
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
    const mergedNodes = mergeNodeListsForCloud(localNodes, remoteList, remoteProjectMetaNewer);
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
      upsertImportedPlannodeTreeV1(mergedProject, mergedNodes, {
        openAfter: false,
        markDirty: false,
        preserveRemoteUpdatedAt: remoteProjectMetaNewer
      });
      n++;
    }
  }
  if (n > 0) {
    const cur = get(currentProject);
    if (cur) {
      const ref = get(projects).find((p) => p.id === cur.id);
      if (ref) selectProject(ref);
    }
  }
  return n;
}
