import { get } from 'svelte/store';
import type { Node, Project } from '$lib/supabase/client';
import { currentProject, nodes as nodesStore } from '$lib/stores/projects';
import { initPlannode } from './plannodePilot.js';
import { persistNodesFromPilot } from '$lib/stores/projects';

function pilotNodeContentChanged(prev: Node | undefined, n: PilotRuntimeNode): boolean {
  if (!prev) return true;
  return (
    prev.name !== n.name ||
    (prev.description ?? '') !== (n.description ?? '') ||
    (prev.num ?? '') !== (n.num ?? '') ||
    (prev.parent_id ?? '') !== (n.parent_id ?? '') ||
    JSON.stringify(prev.badges ?? []) !== JSON.stringify(n.badges ?? []) ||
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
    }
  });

  if (!pilotApi) {
    return { destroy: () => {} };
  }

  const unsub = currentProject.subscribe((p) => {
    if (!pilotApi) return;
    if (!p) {
      pilotApi.clearCanvas();
      return;
    }
    const list = get(nodesStore);
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
      pilotApi?.destroy();
      pilotApi = null;
    }
  };
}

export function pilotSetActiveView(view: 'tree' | 'prd' | 'spec' | 'ai') {
  pilotApi?.setActiveView(view);
}
