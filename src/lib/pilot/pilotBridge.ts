import { get } from 'svelte/store';
import type { Node, Project } from '$lib/supabase/client';
import { currentProject, nodes as nodesStore } from '$lib/stores/projects';
import { initPlannode, dismissPilotRelinkGuide } from './plannodePilot.js';
export { dismissPilotRelinkGuide };
import {
  persistNodesFromPilot,
  persistNodesFromRemoteStructureOp,
  isNodesSetFromPilotPersist,
  recentAddIdsForCloudMerge
} from '$lib/stores/projects';
import { authSession, getAuthUserId } from '$lib/stores/authSession';
import { supabase } from '$lib/supabase/client';
import { isSupabaseCloudConfigured } from '$lib/supabase/env';
import { ensureCollabSliceFreshBeforePersist, registerFlushPilotNodesBeforeCollabMerge, flushPendingCollabPull } from '$lib/supabase/sync';

/**
 * EPIC D — structure ops vs hydrate/persist 이중 계약 (브리지 층 요약)
 *
 * | 경로 | 진실·역할 |
 * |------|-----------|
 * | **structure Broadcast** (`:structure` / `structure-op`) | 편집 중 **파일럿 `nodes`** 갱신(add/delete/move/**update_node**) · 수신 직후 `persistNodesFromRemoteStructureOp`(더티·`touchProject` 없음, pull preserve용). **PARITY-B:** 소유·공유 모두 Broadcast + (설정 시) op persist. |
 * | **onPersist** (아래) | 파일럿 → `persistNodesFromPilot` → revision pull(LWW). **저장본 정본**. |
 * | **nodesStore.subscribe → hydrateFromStore** | 클라우드 pull·스토어 병합 후 캔버스 반영. |
 * | **모달 열림** | hydrate는 파일럿 `hydrateFromStore`에서 **보류**(`MODAL_EDIT_HYDRATE_DEFER`). 브리지는 스토어 구독을 유지 — 닫을 때 pending 1회 반영. |
 * | **캔버스 상호작용** | drag/pan/wheel burst 중 hydrate **보류**(`CANVAS_INTERACTION_DEFER` · P1-04) — pull·`nodes.set`은 즉시, pointerup·wheel idle 후 pending 1회. **collab revision poll/pull**도 동일 조건에서 defer(`pendingCollabPull` · E4-1). |
 * | **text ops** (`:text`) | 모달 description만. structure 채널과 **topic 분리**. |
 *
 * @see docs/plannode_ot2_tree_ops_channel_spike.md · plan-output P-12.3
 * @see docs/plannode_workspace_sync_overview.md §7 (OT2-08에서 §7.5)
 */

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
/** E12 — pointerup 후 collab pull burst 완화 (500ms debounce) */
let collabPullDebounceTimer: ReturnType<typeof setTimeout> | null = null;

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

      if (typeof window !== 'undefined' && (window as any).__resetIdleSnapshotTimer) {
        (window as any).__resetIdleSnapshotTimer();
      }
    },
    onRemoteStructureStoreSync: ({ nodes: pilotNodes, curP }) => {
      if (syncingFromStore || !curP) return;
      persistNodesFromRemoteStructureOp(curP.id, pilotNodesToStore(curP.id, pilotNodes));
    },
    getAccessToken: async () => {
      const s = get(authSession);
      if (s?.access_token) return s.access_token;
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    },
    getPlanProjectId: () => get(currentProject)?.plan_project_id ?? null,
    /** 모달 저장 직전 — pull로만 스토어에 쌓인 상대 노드를 파일럿에 합침(structure·text ops와 별도). */
    getStoreNodesForCollabMerge: () => {
      const p = get(currentProject);
      if (!p?.id) return [];
      const list = get(nodesStore);
      if (list.length > 0) {
        const pid = list[0]?.project_id;
        if (pid && pid !== p.id) return [];
      }
      return storeNodesToPilot(list);
    },
    shouldPreserveNodeOnCollabPrune: (nodeId: string) => {
      const p = get(currentProject);
      if (!p?.id) return false;
      return recentAddIdsForCloudMerge(p.id).has(nodeId);
    },
    /** structure·text Broadcast 구독용 — EPIC D `armStructureOpsForProject`와 쌍 */
    getCollabAuthUserId: () => getAuthUserId(),
    /** EPIC E op persist workspace uid — 공유 멤버=소유자 uid · 소유자=본인 uid (PARITY-B) */
    getCollabWorkspaceSourceUserId: () => {
      const p = get(currentProject);
      const uid = getAuthUserId();
      if (!p?.id || !uid) return null;
      const src = p.cloud_workspace_source_user_id;
      if (src && src !== uid) return src;
      return uid;
    },
    /** 모달 저장 직전 — 공유 슬라이스 freshness best-effort (저장 차단 금지 · Phase D) */
    onBeforeModalPersist: async () => {
      const p = get(currentProject);
      if (!p?.id || !isSupabaseCloudConfigured()) return { ok: true };
      const uid = getAuthUserId();
      const src = p.cloud_workspace_source_user_id;
      if (!src || !uid || src === uid) return { ok: true };
      const r = await ensureCollabSliceFreshBeforePersist(p, 'modal-save');
      if (!r.ok && import.meta.env.DEV) {
        console.warn('[onBeforeModalPersist] degraded', p.id, r.reason);
      }
      return { ok: true, reason: r.reason, merged: r.merged };
    },
    onAfterPendingStoreHydrate: () => {
      if (collabPullDebounceTimer) clearTimeout(collabPullDebounceTimer);
      collabPullDebounceTimer = setTimeout(() => {
        collabPullDebounceTimer = null;
        flushPendingCollabPull();
      }, 500);
    }
  });

  if (!pilotApi) {
    return { destroy: () => {} };
  }

  registerFlushPilotNodesBeforeCollabMerge(() => {
    pilotApi?.flushPersistNow?.({ force: true });
  });

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

  /**
   * revision pull 등으로 스토어가 갱신될 때 캔버스 hydrate.
   * 모달·캔버스 상호작용 중 파일럿이 hydrate 본문을 보류해도 **구독 호출은 유지**(스토어는 즉시 병합, 캔버스는 pending 1회).
   * structure 수신은 `onRemoteStructureStoreSync`로 스토어만 맞춤(`isNodesSetFromPilotPersist`로 재hydrate 스킵). 로컬 편집·저장은 `onPersist`·pull.
   */
  const unsubNodes = nodesStore.subscribe((list) => {
    // Phase-3: relayout·materialize 중 spurious hydrate 차단 (isRelayoutInProgress 파일럿 노출값)
    if (!pilotApi || syncingFromStore || isNodesSetFromPilotPersist() || pilotApi.isRelayoutInProgress?.()) return;
    const p = get(currentProject);
    if (!p?.id) return;
    if (list.length > 0) {
      const pid = list[0]?.project_id;
      if (pid && pid !== p.id) return;
    }
    syncingFromStore = true;
    try {
      let pilotNodes = storeNodesToPilot(list);
      const snap = pilotApi.getSnapshot?.();
      if (snap?.curP?.id === p.id && Array.isArray(snap.nodes) && snap.nodes.length) {
        const storeIds = new Set(list.map((n) => n.id));
        for (const pn of snap.nodes) {
          if (pn?.id && !storeIds.has(pn.id)) {
            pilotNodes = [...pilotNodes, pn];
          }
        }
      }
      pilotApi.hydrateFromStore(p, pilotNodes);
    } finally {
      syncingFromStore = false;
    }
  });

  return {
    destroy() {
      if (collabPullDebounceTimer) {
        clearTimeout(collabPullDebounceTimer);
        collabPullDebounceTimer = null;
      }
      registerFlushPilotNodesBeforeCollabMerge(() => {});
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

export function pilotShouldDeferCollabPull(): boolean {
  return pilotApi?.shouldDeferCollabPull?.() ?? pilotIsCanvasInteractionDeferHydrate();
}

/** pull 직후·상호작용 종료 시 pending hydrate + deferred collab pull 1회 반영 */
export function pilotFlushPendingStoreHydrate(): void {
  pilotApi?.flushPendingStoreHydrate?.();
}

export function pilotIsCanvasInteractionDeferHydrate(): boolean {
  return pilotApi?.isCanvasInteractionDeferHydrate?.() ?? false;
}

export function pilotHasPendingGridPersist(): boolean {
  return pilotApi?.hasPendingGridPersist?.() ?? false;
}

/** 표준 배지 풀 저장·노드 정리 후 캔버스 칩 재반영 */
export function pilotRehydrateCurrentProjectFromStore(): void {
  if (!pilotApi) return;
  const p = get(currentProject);
  if (!p?.id) return;
  const list = get(nodesStore);
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
}
