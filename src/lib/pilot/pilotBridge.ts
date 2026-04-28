import { get } from 'svelte/store';
import type { Node, Project } from '$lib/supabase/client';
import { currentProject, nodes as nodesStore } from '$lib/stores/projects';
import { initPlannode, dismissPilotRelinkGuide } from './plannodePilot.js';
export { dismissPilotRelinkGuide };
import { persistNodesFromPilot, isNodesSetFromPilotPersist } from '$lib/stores/projects';
import { authSession } from '$lib/stores/authSession';
import { supabase } from '$lib/supabase/client';

function pilotNodeContentChanged(prev: Node | undefined, n: PilotRuntimeNode): boolean {
  if (!prev) return true;
  return (
    prev.name !== n.name ||
    (prev.description ?? '') !== (n.description ?? '') ||
    (prev.num ?? '') !== (n.num ?? '') ||
    (prev.parent_id ?? '') !== (n.parent_id ?? '') ||
    JSON.stringify(prev.badges ?? []) !== JSON.stringify(n.badges ?? []) ||
    JSON.stringify(prev.metadata ?? {}) !== JSON.stringify(n.metadata ?? {}) ||
    (prev.mx ?? null) !== (n.mx ?? null) ||
    (prev.my ?? null) !== (n.my ?? null) ||
    (prev.node_type ?? '') !== (n.node_type ?? '')
  );
}

/** 파일럿 런타임 노드 → 스토어 Node */
export function pilotNodesToStore(projectId: string, pilotNodes: PilotRuntimeNode[]): Node[] {
  const existing = get(nodesStore);
  const byId = new Map(existing.map((x) => [x.id, x]));
  const now = new Date().toISOString();
  return pilotNodes.map((n) => {
    const prev = byId.get(n.id);
    const depth = computeDepth(pilotNodes, n.id);
    const changed = pilotNodeContentChanged(prev, n);
    return {
      id: n.id,
      project_id: projectId,
      name: n.name,
      description: n.description ?? '',
      num: n.num,
      parent_id: n.parent_id ?? undefined,
      depth,
      badges: n.badges ?? [],
      metadata: n.metadata,
      mx: n.mx ?? undefined,
      my: n.my ?? undefined,
      node_type: n.node_type,
      created_at: prev?.created_at ?? now,
      updated_at: changed ? now : (prev?.updated_at ?? now)
    };
  });
}

type PilotRuntimeNode = {
  id: string;
  parent_id: string | null;
  name: string;
  description?: string;
  num?: string;
  badges?: string[];
  metadata?: unknown;
  node_type?: string;
  mx?: number | null;
  my?: number | null;
};

function computeDepth(flat: PilotRuntimeNode[], id: string, seen = new Set<string>()): number {
  if (seen.has(id)) return 0;
  seen.add(id);
  const n = flat.find((x) => x.id === id);
  if (!n || !n.parent_id) return 0;
  return 1 + computeDepth(flat, n.parent_id, seen);
}

/** 스토어 → 파일럿 (이름 필드 위주) */
export function storeNodesToPilot(list: Node[]): PilotRuntimeNode[] {
  return list.map((n) => ({
    id: n.id,
    parent_id: n.parent_id ?? null,
    name: n.name,
    description: n.description ?? '',
    num: n.num,
    badges: n.badges ?? [],
    metadata: n.metadata,
    node_type: (n as Node & { node_type?: string }).node_type,
    mx: n.mx ?? null,
    my: n.my ?? null
  }));
}

export type PilotApi = NonNullable<ReturnType<typeof initPlannode>>;

let pilotApi: PilotApi | null = null;
let syncingFromStore = false;

export function mountPilotBridge(): { destroy: () => void } {
  if (pilotApi) pilotApi.destroy();

  pilotApi = initPlannode({
    delegateTabs: true,
    delegateProjectModal: true,
    seedDemoProjects: false,
    onPersist: ({ nodes: pilotNodes, curP }) => {
      if (syncingFromStore || !curP) return;
      const mapped = pilotNodesToStore(curP.id, pilotNodes);
      persistNodesFromPilot(curP.id, mapped);
    },
    getAccessToken: async () => {
      const s = get(authSession);
      if (s?.access_token) return s.access_token;
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    },
    getPlanProjectId: () => get(currentProject)?.plan_project_id ?? null
  });

  if (!pilotApi) {
    return { destroy: () => {} };
  }

  /** 같은 프로젝트에서 `updated_at` 등 메타만 바뀔 때마다 hydrate → clearUndo 가 반복되던 문제 방지 */
  let lastCurrentProjectId: string | null = null;

  const unsub = currentProject.subscribe((p) => {
    if (!pilotApi) return;
    if (!p) {
      lastCurrentProjectId = null;
      pilotApi.clearCanvas();
      return;
    }
    const sameProject = lastCurrentProjectId === p.id;
    lastCurrentProjectId = p.id;
    if (sameProject) {
      pilotApi.patchProjectMeta?.(p);
      return;
    }
    const list = get(nodesStore);
    syncingFromStore = true;
    try {
      pilotApi.hydrateFromStore(p, storeNodesToPilot(list));
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          pilotApi?.trySilentViewportFit?.();
        });
      });
    } finally {
      syncingFromStore = false;
    }
  });

  const unsubNodes = nodesStore.subscribe((list) => {
    if (!pilotApi || syncingFromStore || isNodesSetFromPilotPersist()) return;
    const p = get(currentProject);
    if (!p?.id) return;
    if (list.length > 0) {
      const pid = list[0]?.project_id;
      if (pid && pid !== p.id) return;
    }
    syncingFromStore = true;
    try {
      pilotApi.hydrateFromStore(p, storeNodesToPilot(list));
    } finally {
      syncingFromStore = false;
    }
  });

  return {
    destroy() {
      unsub();
      unsubNodes();
      pilotApi?.destroy();
      pilotApi = null;
    }
  };
}

export function pilotSetActiveView(view: 'tree' | 'prd' | 'spec' | 'ia' | 'ai') {
  pilotApi?.setActiveView(view);
}

/** PRD 뷰가 활성일 때만 `buildPRD` — 스토어 변경 반응용 (+page, PILOT §9) */
export function pilotRefreshPrdView() {
  pilotApi?.refreshPrdView?.();
}

/** L1 `serializeToPrompt` + `OutputIntent.PRD` + 핵심 PRD 요약 절(v2.0) 클립보드 */
export function pilotCopyPrdL1CoreSummaryPrompt() {
  pilotApi?.copyPrdL1CoreSummaryPrompt?.();
}

/** 노드맵 배치 — 우측분포(right) · 하위분포(topdown), localStorage와 동기 */
export function pilotGetNodeMapLayoutMode(): 'right' | 'topdown' | null {
  return pilotApi?.getNodeMapLayoutMode?.() ?? null;
}

export function pilotSetNodeMapLayout(mode: 'right' | 'topdown') {
  pilotApi?.setNodeMapLayout?.(mode);
}

/** 기능명세 그리드와 동일 SSoT — UTF-8 BOM CSV(CRLF), 엑셀 더블클릭 열기용 */
export function pilotExportSpecSheetCsv() {
  pilotApi?.exportSpecSheetCsv?.();
}

/** 기능명세 그리드 편집분 즉시 스토어 반영(지연 persist 플러시) */
export function pilotFlushPersistNow() {
  pilotApi?.flushPersistNow?.();
}

/** 지연 persist(50ms)가 대기 중이면 이탈 직전에 `pilotFlushPersistNow()` 호출 권장 */
export function pilotHasPendingGridPersist(): boolean {
  return pilotApi?.hasPendingGridPersist?.() ?? false;
}
