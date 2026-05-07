/**
 * 경량 노드 스냅샷 히스토리 (PRD M3 F3-3) — GATE B: plan-output P-4.5 **A** 로컬 전용.
 * 서버 스키마 없음. 트리 SSoT는 건드리지 않고 JSON 복제만 저장.
 */
import type { Node } from '$lib/supabase/client';

const KEY = (projectId: string) => `plannode_node_snapshots_v1_${projectId}`;

export const NODE_SNAPSHOT_RING_MAX = 8;
/** 단일 localStorage 키 대략 상한(바이트 아님 문자 길이 근사) */
export const NODE_SNAPSHOT_JSON_ROUGH_MAX = 420_000;

export type NodeSnapshotReason = 'presence_peer' | 'pre_pull' | 'manual' | 'import';

export type StoredNodeSnapshot = {
  id: string;
  at: string;
  reason: NodeSnapshotReason;
  nodes: Node[];
};

export type NodeDiffSummary = {
  added: number;
  removed: number;
  changed: number;
};

function genId(): string {
  return `snap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function parseStored(raw: string | null): StoredNodeSnapshot[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .filter(
        (x) =>
          x &&
          typeof x === 'object' &&
          typeof (x as StoredNodeSnapshot).id === 'string' &&
          typeof (x as StoredNodeSnapshot).at === 'string' &&
          Array.isArray((x as StoredNodeSnapshot).nodes)
      )
      .map((x) => x as StoredNodeSnapshot);
  } catch {
    return [];
  }
}

/**
 * 스냅샷 1건 저장(링). 용량 초과 시 앞에서 제거. 실패 시 false.
 */
export function captureNodeSnapshot(
  projectId: string,
  nodes: Node[],
  reason: NodeSnapshotReason
): boolean {
  if (typeof window === 'undefined' || !projectId) return false;
  const entry: StoredNodeSnapshot = {
    id: genId(),
    at: new Date().toISOString(),
    reason,
    nodes: JSON.parse(JSON.stringify(nodes)) as Node[]
  };
  let list = parseStored(
    (() => {
      try {
        return localStorage.getItem(KEY(projectId));
      } catch {
        return null;
      }
    })()
  );
  list.push(entry);
  while (list.length > NODE_SNAPSHOT_RING_MAX) {
    list = list.slice(-NODE_SNAPSHOT_RING_MAX);
  }
  let json = JSON.stringify(list);
  while (json.length > NODE_SNAPSHOT_JSON_ROUGH_MAX && list.length > 1) {
    list = list.slice(1);
    json = JSON.stringify(list);
  }
  try {
    localStorage.setItem(KEY(projectId), json);
    return true;
  } catch {
    return false;
  }
}

export function listNodeSnapshots(projectId: string): StoredNodeSnapshot[] {
  if (typeof window === 'undefined' || !projectId) return [];
  try {
    return parseStored(localStorage.getItem(KEY(projectId)));
  } catch {
    return [];
  }
}

function nodeShallowSignature(n: Node): string {
  return JSON.stringify({
    i: n.id,
    n: n.name,
    p: n.parent_id ?? null,
    u: n.num ?? '',
    d: n.description ?? '',
    b: n.badges ?? [],
    t: n.updated_at
  });
}

/** node id → 비교에 쓰는 필드 시그니처 */
export function summarizeNodeDiff(a: Node[], b: Node[]): NodeDiffSummary {
  const am = new Map(a.map((n) => [n.id, n]));
  const bm = new Map(b.map((n) => [n.id, n]));
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const id of bm.keys()) {
    if (!am.has(id)) added++;
  }
  for (const id of am.keys()) {
    if (!bm.has(id)) removed++;
  }
  for (const id of am.keys()) {
    const an = am.get(id);
    const bn = bm.get(id);
    if (an && bn && nodeShallowSignature(an) !== nodeShallowSignature(bn)) changed++;
  }
  return { added, removed, changed };
}
