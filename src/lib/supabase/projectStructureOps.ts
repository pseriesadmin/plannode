/**
 * EPIC D 2단계 — 트리 structure ops (Broadcast only, pull/LWW는 기존 sync).
 * @see docs/plannode_ot2_tree_ops_channel_spike.md
 * @see docs/plannode_ot2_tree_structure_poc_spike.md
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '$lib/supabase/client';
import { isSupabaseCloudConfigured } from '$lib/supabase/env';

export const STRUCTURE_OPS_BROADCAST_EVENT = 'structure-op';
const STRUCTURE_OPS_CLIENT_ID_KEY = 'plannode.structureOps.clientId.v1';
const MAX_PENDING_STRUCTURE_OPS = 12;
const PENDING_FLUSH_RETRY_MS = 200;

export type AddNodeOp = {
  type: 'add_node';
  node: {
    id: string;
    parent_id: string;
    name: string;
    description?: string;
    node_type?: string;
    num?: string;
    mx: number;
    my: number;
  };
};

export type DeleteNodeOp = {
  type: 'delete_node';
  node_id: string;
};

export type MoveNodeOp = {
  type: 'move_node';
  node_id: string;
  parent_id: string;
  mx: number;
  my: number;
  num?: string;
};

export type ReorderSiblingsOp = {
  type: 'reorder_siblings';
  parent_id: string;
  ordered_ids: string[];
};

export type StructureOpPayload = AddNodeOp | DeleteNodeOp | MoveNodeOp | ReorderSiblingsOp;

export type StructureOp = {
  v: 1;
  project_id: string;
  client_id: string;
  seq: number;
  op: StructureOpPayload;
};

export type StructureOpHandler = (op: StructureOp) => void;

type PendingStructureOp = { projectId: string; op: StructureOpPayload };

let channel: RealtimeChannel | null = null;
let subscribedProjectId: string | null = null;
let broadcastSubscribed = false;
let myClientId = '';
let sendSeq = 0;
let onStructureOp: StructureOpHandler | null = null;
let pendingStructureOps: PendingStructureOp[] = [];
/** 브라우저 타이머 id (DOM lib: number) */
let pendingFlushTimer: number | undefined;

function topicForProject(projectId: string): string {
  return `plannode:project:${projectId}:structure`;
}

function getOrCreateClientId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    let id = sessionStorage.getItem(STRUCTURE_OPS_CLIENT_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? `c_${crypto.randomUUID()}`
          : `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      sessionStorage.setItem(STRUCTURE_OPS_CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return `c_${Date.now()}`;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function parseFiniteNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseNonEmptyString(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s ? s : null;
}

function parseAddNodeOp(raw: Record<string, unknown>): AddNodeOp | null {
  const nodeRaw = raw.node;
  if (!isRecord(nodeRaw)) return null;
  const id = parseNonEmptyString(nodeRaw.id);
  const parent_id = parseNonEmptyString(nodeRaw.parent_id);
  const name = parseNonEmptyString(nodeRaw.name);
  const mx = parseFiniteNumber(nodeRaw.mx);
  const my = parseFiniteNumber(nodeRaw.my);
  if (!id || !parent_id || !name || mx === null || my === null) return null;
  const node: AddNodeOp['node'] = { id, parent_id, name, mx, my };
  const description = parseNonEmptyString(nodeRaw.description);
  if (description) node.description = description;
  const node_type = parseNonEmptyString(nodeRaw.node_type);
  if (node_type) node.node_type = node_type;
  const num = parseNonEmptyString(nodeRaw.num);
  if (num) node.num = num;
  return { type: 'add_node', node };
}

function parseDeleteNodeOp(raw: Record<string, unknown>): DeleteNodeOp | null {
  const node_id = parseNonEmptyString(raw.node_id);
  if (!node_id) return null;
  return { type: 'delete_node', node_id };
}

function parseMoveNodeOp(raw: Record<string, unknown>): MoveNodeOp | null {
  const node_id = parseNonEmptyString(raw.node_id);
  const parent_id = parseNonEmptyString(raw.parent_id);
  const mx = parseFiniteNumber(raw.mx);
  const my = parseFiniteNumber(raw.my);
  if (!node_id || !parent_id || mx === null || my === null) return null;
  const op: MoveNodeOp = { type: 'move_node', node_id, parent_id, mx, my };
  const num = parseNonEmptyString(raw.num);
  if (num) op.num = num;
  return op;
}

function parseReorderSiblingsOp(raw: Record<string, unknown>): ReorderSiblingsOp | null {
  const parent_id = parseNonEmptyString(raw.parent_id);
  if (!parent_id) return null;
  const orderedRaw = raw.ordered_ids;
  if (!Array.isArray(orderedRaw) || orderedRaw.length === 0) return null;
  const ordered_ids: string[] = [];
  for (const item of orderedRaw) {
    const id = parseNonEmptyString(item);
    if (!id) return null;
    ordered_ids.push(id);
  }
  return { type: 'reorder_siblings', parent_id, ordered_ids };
}

function parseStructureOpPayload(raw: unknown): StructureOpPayload | null {
  if (!isRecord(raw)) return null;
  const type = raw.type;
  switch (type) {
    case 'add_node':
      return parseAddNodeOp(raw);
    case 'delete_node':
      return parseDeleteNodeOp(raw);
    case 'move_node':
      return parseMoveNodeOp(raw);
    case 'reorder_siblings':
      return parseReorderSiblingsOp(raw);
    default:
      return null;
  }
}

/** 수신 Broadcast payload → StructureOp (검증 실패 시 null) */
export function parseStructureOp(raw: unknown): StructureOp | null {
  const root = isRecord(raw) && 'payload' in raw ? (raw as { payload: unknown }).payload : raw;
  if (!isRecord(root)) return null;
  if (root.v !== 1) return null;
  const project_id = parseNonEmptyString(root.project_id);
  const client_id = parseNonEmptyString(root.client_id);
  if (!project_id || !client_id) return null;
  const seq = Number(root.seq);
  if (!Number.isFinite(seq)) return null;
  const op = parseStructureOpPayload(root.op);
  if (!op) return null;
  return {
    v: 1,
    project_id,
    client_id,
    seq: Math.floor(seq),
    op
  };
}

export function getProjectStructureOpsClientId(): string {
  if (!myClientId) myClientId = getOrCreateClientId();
  return myClientId;
}

export function isProjectStructureOpsSubscribed(projectId?: string): boolean {
  if (!broadcastSubscribed || !channel) return false;
  if (projectId && subscribedProjectId !== projectId) return false;
  return true;
}

/** Vitest — 모듈 상태 초기화 */
export function resetStructureOpsStateForTest(): void {
  clearPendingStructureOps();
  broadcastSubscribed = false;
  subscribedProjectId = null;
  sendSeq = 0;
  onStructureOp = null;
  myClientId = '';
  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
  }
}

/** Vitest — pending 큐 길이 */
export function getStructureOpsPendingCount(): number {
  return pendingStructureOps.length;
}

function clearPendingStructureOps(): void {
  pendingStructureOps = [];
  if (pendingFlushTimer !== undefined) {
    window.clearTimeout(pendingFlushTimer);
    pendingFlushTimer = undefined;
  }
}

function schedulePendingFlushRetry(): void {
  if (pendingFlushTimer !== undefined || typeof window === 'undefined') return;
  pendingFlushTimer = window.setTimeout(() => {
    pendingFlushTimer = undefined;
    flushPendingStructureOps();
    if (pendingStructureOps.length > 0) schedulePendingFlushRetry();
  }, PENDING_FLUSH_RETRY_MS);
}

function enqueuePendingStructureOp(projectId: string, op: StructureOpPayload): void {
  const pid = projectId.trim();
  if (!pid) return;
  pendingStructureOps.push({ projectId: pid, op });
  if (pendingStructureOps.length > MAX_PENDING_STRUCTURE_OPS) {
    pendingStructureOps = pendingStructureOps.slice(-MAX_PENDING_STRUCTURE_OPS);
  }
  schedulePendingFlushRetry();
}

function trySendStructureOpNow(projectId: string, op: StructureOpPayload): boolean {
  if (!broadcastSubscribed || !channel || subscribedProjectId !== projectId) return false;

  sendSeq += 1;
  const payload: StructureOp = {
    v: 1,
    project_id: projectId,
    client_id: getProjectStructureOpsClientId(),
    seq: sendSeq,
    op
  };

  void channel.send({
    type: 'broadcast',
    event: STRUCTURE_OPS_BROADCAST_EVENT,
    payload
  });
  // ack:false — send()는 Promise<RealtimeChannelSendResponse>; 구독 중이면 요청 접수로 성공 처리
  return true;
}

function flushPendingStructureOps(): void {
  if (!pendingStructureOps.length) return;
  if (!broadcastSubscribed || !channel || !subscribedProjectId) return;

  const pid = subscribedProjectId;
  const remaining: PendingStructureOp[] = [];
  for (const item of pendingStructureOps) {
    if (item.projectId !== pid) {
      remaining.push(item);
      continue;
    }
    if (!trySendStructureOpNow(item.projectId, item.op)) {
      remaining.push(item);
    }
  }
  pendingStructureOps = remaining;
  if (remaining.length > 0) schedulePendingFlushRetry();
}

export function unsubscribeProjectStructureOps(): void {
  broadcastSubscribed = false;
  subscribedProjectId = null;
  sendSeq = 0;
  onStructureOp = null;
  clearPendingStructureOps();
  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
  }
}

/**
 * 프로젝트 단위 structure ops Broadcast 구독.
 * `:text`·Presence·revision 신호와 topic 분리. self 수신은 끔.
 */
export async function subscribeProjectStructureOps(
  projectId: string,
  userId: string,
  handler: StructureOpHandler
): Promise<void> {
  if (!isSupabaseCloudConfigured() || typeof window === 'undefined') return;
  if (!projectId?.trim() || !userId?.trim()) return;

  const pid = projectId.trim();

  // SUBSCRIBED 대기 중 재 arm 시 채널을 끊지 않음 (구독 레이스·첫 addChild 손실 방지)
  if (subscribedProjectId === pid && channel) {
    onStructureOp = handler;
    if (broadcastSubscribed) flushPendingStructureOps();
    return;
  }

  unsubscribeProjectStructureOps();
  subscribedProjectId = pid;
  myClientId = getOrCreateClientId();
  onStructureOp = handler;

  const ch = supabase.channel(topicForProject(pid), {
    config: { broadcast: { ack: false, self: false } }
  });

  ch.on('broadcast', { event: STRUCTURE_OPS_BROADCAST_EVENT }, (msg) => {
    const op = parseStructureOp(msg);
    if (!op || op.project_id !== subscribedProjectId) return;
    if (op.client_id === myClientId) return;
    onStructureOp?.(op);
  });

  channel = ch;
  ch.subscribe((status) => {
    if (channel !== ch) return;
    if (status === 'SUBSCRIBED') {
      broadcastSubscribed = true;
      flushPendingStructureOps();
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      broadcastSubscribed = false;
    }
  });
}

/**
 * 원격에 structure op 1건 전송.
 * SUBSCRIBED 전·일시 실패 시 pending 큐에 넣고 연결 후 flush.
 */
export function sendProjectStructureOp(projectId: string, op: StructureOpPayload): boolean {
  if (!isSupabaseCloudConfigured() || typeof window === 'undefined') return false;
  const pid = projectId.trim();
  if (!pid) return false;

  if (trySendStructureOpNow(pid, op)) return true;

  enqueuePendingStructureOp(pid, op);
  return false;
}
