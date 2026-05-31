/**
 * EPIC D 2단계 — 트리 structure ops (Broadcast + EPIC E op log persist).
 * @see docs/plannode_ot2_tree_ops_channel_spike.md
 * @see docs/plannode_ot2_tree_structure_poc_spike.md
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '$lib/supabase/client';
import { isSupabaseCloudConfigured } from '$lib/supabase/env';

export const STRUCTURE_OPS_BROADCAST_EVENT = 'structure-op';
const STRUCTURE_OPS_CLIENT_ID_KEY = 'plannode.structureOps.clientId.v1';
const STRUCTURE_OPS_ACK_SEQ_KEY = 'plannode.structureOps.ackSeq.v1';
const MAX_PENDING_STRUCTURE_OPS = 12;
const MAX_PENDING_PERSIST_OPS = 24;
const PENDING_FLUSH_RETRY_MS = 200;
const PERSIST_FLUSH_DEBOUNCE_MS = 120;

export type AddNodeOp = {
  type: 'add_node';
  node: {
    id: string;
    parent_id: string;
    name: string;
    description?: string;
    node_type?: string;
    num?: string;
    /** true: 수신측 bld 자동배치 — mx/my 무시(공유 add 스켈레톤) */
    layout_auto?: boolean;
    /** @deprecated layout_auto 없을 때만 — 구 ops 호환 */
    mx?: number;
    my?: number;
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

export type UpdateNodeOp = {
  type: 'update_node';
  node: {
    id: string;
    parent_id?: string;
    name?: string;
    description?: string;
    node_type?: string;
    num?: string;
    mx?: number | null;
    my?: number | null;
    updated_at?: string;
  };
};

export type StructureOpPayload =
  | AddNodeOp
  | DeleteNodeOp
  | MoveNodeOp
  | ReorderSiblingsOp
  | UpdateNodeOp;

export type StructureOp = {
  v: 1;
  project_id: string;
  client_id: string;
  seq: number;
  op: StructureOpPayload;
};

export type StructureOpHandler = (op: StructureOp) => void;

type PendingStructureOp = { projectId: string; op: StructureOpPayload };
type PendingPersistOp = {
  projectId: string;
  workspaceUserId: string;
  op: StructureOpPayload;
};

let channel: RealtimeChannel | null = null;
let subscribedProjectId: string | null = null;
let broadcastSubscribed = false;
let myClientId = '';
let sendSeq = 0;
let onStructureOp: StructureOpHandler | null = null;
let pendingStructureOps: PendingStructureOp[] = [];
let pendingPersistOps: PendingPersistOp[] = [];
/** 브라우저 타이머 id (DOM lib: number) */
let pendingFlushTimer: number | undefined;
let persistFlushTimer: number | undefined;

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
  if (!id || !parent_id) return null;
  const layout_auto = nodeRaw.layout_auto === true;
  const mx = parseFiniteNumber(nodeRaw.mx);
  const my = parseFiniteNumber(nodeRaw.my);
  if (!layout_auto && (mx === null || my === null)) return null;
  const name = nodeRaw.name != null ? String(nodeRaw.name) : '';
  const node: AddNodeOp['node'] = { id, parent_id, name };
  if (layout_auto) node.layout_auto = true;
  else {
    node.mx = mx;
    node.my = my;
  }
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

function parseUpdateNodeOp(raw: Record<string, unknown>): UpdateNodeOp | null {
  const nodeRaw = raw.node;
  if (!isRecord(nodeRaw)) return null;
  const id = parseNonEmptyString(nodeRaw.id);
  if (!id) return null;
  const node: UpdateNodeOp['node'] = { id };
  if (nodeRaw.name != null) node.name = String(nodeRaw.name);
  const description = parseNonEmptyString(nodeRaw.description);
  if (description !== null) node.description = description;
  const parent_id = parseNonEmptyString(nodeRaw.parent_id);
  if (parent_id) node.parent_id = parent_id;
  const node_type = parseNonEmptyString(nodeRaw.node_type);
  if (node_type) node.node_type = node_type;
  const num = parseNonEmptyString(nodeRaw.num);
  if (num) node.num = num;
  if (nodeRaw.mx != null) {
    const mx = parseFiniteNumber(nodeRaw.mx);
    node.mx = mx;
  }
  if (nodeRaw.my != null) {
    const my = parseFiniteNumber(nodeRaw.my);
    node.my = my;
  }
  const updated_at = parseNonEmptyString(nodeRaw.updated_at);
  if (updated_at) node.updated_at = updated_at;
  return { type: 'update_node', node };
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
    case 'update_node':
      return parseUpdateNodeOp(raw);
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
  clearPendingPersistOps();
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

/** Vitest — broadcast pending 큐 길이 */
export function getStructureOpsPendingCount(): number {
  return pendingStructureOps.length;
}

/** Vitest — persist pending 큐 길이 */
export function getStructureOpsPersistPendingCount(): number {
  return pendingPersistOps.length;
}

function ackSeqStorageKey(projectId: string): string {
  return `${STRUCTURE_OPS_ACK_SEQ_KEY}.${projectId}`;
}

export function getStructureOpsPersistAckSeq(projectId: string): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(ackSeqStorageKey(projectId));
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function setStructureOpsPersistAckSeq(projectId: string, seq: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ackSeqStorageKey(projectId), String(Math.max(0, Math.floor(seq))));
  } catch {
    /* ignore */
  }
}

function clearPendingPersistOps(): void {
  pendingPersistOps = [];
  if (persistFlushTimer !== undefined && typeof window !== 'undefined') {
    window.clearTimeout(persistFlushTimer);
    persistFlushTimer = undefined;
  }
}

function schedulePersistFlush(): void {
  if (persistFlushTimer !== undefined || typeof window === 'undefined') return;
  persistFlushTimer = window.setTimeout(() => {
    persistFlushTimer = undefined;
    void flushAllPendingStructureOpsPersist();
  }, PERSIST_FLUSH_DEBOUNCE_MS);
}

/** PUSH-P2-03 — cloud upload 예약 시 append 단독 flush 취소(upload 경로에서 일괄 flush) */
export function cancelStructureOpsPersistDebounce(): void {
  if (persistFlushTimer !== undefined && typeof window !== 'undefined') {
    window.clearTimeout(persistFlushTimer);
    persistFlushTimer = undefined;
  }
}

/** EPIC E — cloud persist 큐에 op 추가 (Broadcast와 병행) */
export function enqueueStructureOpForCloudPersist(
  projectId: string,
  workspaceUserId: string,
  op: StructureOpPayload
): void {
  const pid = projectId.trim();
  const wid = workspaceUserId.trim();
  if (!pid || !wid) return;
  pendingPersistOps.push({ projectId: pid, workspaceUserId: wid, op });
  if (pendingPersistOps.length > MAX_PENDING_PERSIST_OPS) {
    pendingPersistOps = pendingPersistOps.slice(-MAX_PENDING_PERSIST_OPS);
  }
  schedulePersistFlush();
}

function isStructureOpsRpcMissing(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const msg = String(err.message ?? '').toLowerCase();
  return msg.includes('plannode_append_structure_ops') || msg.includes('could not find');
}

/** E9-1 — concurrent append race · PK (workspace, project, seq) duplicate */
function isStructureOpsDuplicateKeyError(err: { message?: string; code?: string; details?: string } | null): boolean {
  if (!err) return false;
  const blob = `${String(err.message ?? '')} ${String(err.details ?? '')} ${String(err.code ?? '')}`.toLowerCase();
  return err.code === '23505' || blob.includes('duplicate key') || blob.includes('structure_ops_pkey');
}

const persistFlushInFlight = new Map<string, Promise<StructureOpsFlushResult>>();

async function recoverStructureOpsFlushAfterDuplicateKey(
  projectId: string,
  workspaceUserId: string,
  batchSize: number
): Promise<StructureOpsFlushResult> {
  const ack = getStructureOpsPersistAckSeq(projectId);
  const bundle = await fetchStructureOpsSince(workspaceUserId, projectId, ack);
  if (bundle && bundle.last_applied_seq > ack) {
    setStructureOpsPersistAckSeq(projectId, bundle.last_applied_seq);
    if (import.meta.env.DEV) {
      console.info('[flushStructureOpsPersistForProject] duplicate key — ack recovered', projectId, {
        ack,
        last: bundle.last_applied_seq
      });
    }
    return {
      ok: true,
      flushed: batchSize,
      lastSeq: bundle.last_applied_seq,
      revision: bundle.revision
    };
  }
  return { ok: false, flushed: 0 };
}

async function flushStructureOpsPersistForProjectInner(
  projectId: string,
  workspaceUserId: string,
  baseRevision: number | null = null
): Promise<StructureOpsFlushResult> {
  if (!isSupabaseCloudConfigured() || typeof window === 'undefined') {
    return { ok: true, flushed: 0 };
  }
  const pid = projectId.trim();
  const wid = workspaceUserId.trim();
  if (!pid || !wid) return { ok: true, flushed: 0 };

  const batch = pendingPersistOps.filter(
    (p) => p.projectId === pid && p.workspaceUserId === wid
  );
  if (!batch.length) return { ok: true, flushed: 0 };

  const opsPayload = batch.map((b) => b.op);
  const { data, error } = await supabase.rpc('plannode_append_structure_ops', {
    p_workspace_user_id: wid,
    p_project_id: pid,
    p_ops: opsPayload,
    p_client_id: getProjectStructureOpsClientId(),
    p_base_revision: baseRevision
  });

  if (error) {
    if (isStructureOpsRpcMissing(error)) {
      return { ok: false, flushed: 0 };
    }
    if (isStructureOpsDuplicateKeyError(error)) {
      const recovered = await recoverStructureOpsFlushAfterDuplicateKey(pid, wid, opsPayload.length);
      if (recovered.ok) {
        pendingPersistOps = pendingPersistOps.filter(
          (p) => !(p.projectId === pid && p.workspaceUserId === wid)
        );
        return recovered;
      }
    }
    if (import.meta.env.DEV) {
      console.warn('[flushStructureOpsPersistForProject]', pid, error.message);
    }
    return { ok: false, flushed: 0 };
  }

  pendingPersistOps = pendingPersistOps.filter(
    (p) => !(p.projectId === pid && p.workspaceUserId === wid)
  );

  const result = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const lastSeq = Number(result.last_applied_seq);
  const revision = Number(result.revision);
  if (Number.isFinite(lastSeq)) {
    setStructureOpsPersistAckSeq(pid, lastSeq);
  }

  return {
    ok: true,
    flushed: opsPayload.length,
    lastSeq: Number.isFinite(lastSeq) ? lastSeq : undefined,
    revision: Number.isFinite(revision) ? revision : undefined
  };
}

export async function flushStructureOpsPersistForProject(
  projectId: string,
  workspaceUserId: string,
  baseRevision: number | null = null
): Promise<StructureOpsFlushResult> {
  const pid = projectId.trim();
  const wid = workspaceUserId.trim();
  if (!pid || !wid) return { ok: true, flushed: 0 };

  const key = structureOpsPersistFlushKey(wid, pid);
  const inflight = persistFlushInFlight.get(key);
  if (inflight) return inflight;

  const run = flushStructureOpsPersistForProjectInner(pid, wid, baseRevision);
  persistFlushInFlight.set(key, run);
  try {
    return await run;
  } finally {
    if (persistFlushInFlight.get(key) === run) {
      persistFlushInFlight.delete(key);
    }
  }
}

export type StructureOpsFlushResult = {
  ok: boolean;
  flushed: number;
  lastSeq?: number;
  revision?: number;
};

export function structureOpsPersistFlushKey(workspaceUserId: string, projectId: string): string {
  return `${workspaceUserId.trim()}:${projectId.trim()}`;
}

/** PUSH-P2-02 — 해당 프로젝트에 cloud persist 대기 op가 남았는지 */
export function hasPendingStructureOpsPersistForProject(
  projectId: string,
  workspaceUserId: string
): boolean {
  const pid = projectId.trim();
  const wid = workspaceUserId.trim();
  if (!pid || !wid) return false;
  return pendingPersistOps.some((p) => p.projectId === pid && p.workspaceUserId === wid);
}

/** append 성공 + pending 없음 → slice merge RPC 생략 가능 */
export function collabPushCanSkipSliceMergeAfterOpsFlush(
  projectId: string,
  workspaceUserId: string,
  priorBatchFlush: Map<string, StructureOpsFlushResult>,
  attemptFlush: StructureOpsFlushResult
): boolean {
  if (hasPendingStructureOpsPersistForProject(projectId, workspaceUserId)) return false;
  const key = structureOpsPersistFlushKey(workspaceUserId, projectId);
  const prior = priorBatchFlush.get(key);
  const batchSynced = prior?.ok === true && (prior.flushed ?? 0) > 0;
  const attemptSynced = attemptFlush.ok === true && attemptFlush.flushed > 0;
  if (attemptFlush.ok === false) return false;
  return batchSynced || attemptSynced;
}

/** COLLAB-PERF-2 E1 — pullStructureOpsForProject 결과 + revision 판정 */
export type StructureOpsPullResult = {
  ok: boolean;
  applied: number;
  lastAppliedSeq?: number;
  revision?: number;
};

/** ops RPC 성공 + (적용됨 또는 revision 동일) → full slice merge 생략 가능 */
export function collabPullCanSkipSliceMergeAfterOpsPull(
  projectId: string,
  workspaceUserId: string,
  pullResult: StructureOpsPullResult,
  opts: { revisionUnchanged: boolean }
): boolean {
  if (hasPendingStructureOpsPersistForProject(projectId, workspaceUserId)) return false;
  if (!pullResult.ok) return false;
  if (pullResult.applied > 0) return true;
  return opts.revisionUnchanged;
}

export async function flushAllPendingStructureOpsPersist(): Promise<
  Map<string, StructureOpsFlushResult>
> {
  const results = new Map<string, StructureOpsFlushResult>();
  const seen = new Set<string>();
  for (const item of [...pendingPersistOps]) {
    const key = structureOpsPersistFlushKey(item.workspaceUserId, item.projectId);
    if (seen.has(key)) continue;
    seen.add(key);
    const r = await flushStructureOpsPersistForProject(item.projectId, item.workspaceUserId);
    results.set(key, r);
  }
  return results;
}

export type FetchedStructureOpsBundle = {
  ops: Array<{ seq: number; op: StructureOpPayload; client_id?: string }>;
  revision: number;
  last_applied_seq: number;
  nodes: unknown[];
};

export async function fetchStructureOpsSince(
  workspaceUserId: string,
  projectId: string,
  sinceSeq: number
): Promise<FetchedStructureOpsBundle | null> {
  if (!isSupabaseCloudConfigured()) return null;
  const { data, error } = await supabase.rpc('plannode_fetch_structure_ops_since', {
    p_workspace_user_id: workspaceUserId,
    p_project_id: projectId,
    p_since_seq: sinceSeq
  });
  if (error) {
    if (import.meta.env.DEV && !isStructureOpsRpcMissing(error)) {
      console.warn('[fetchStructureOpsSince]', projectId, error.message);
    }
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const root = data as Record<string, unknown>;
  const opsRaw = Array.isArray(root.ops) ? root.ops : [];
  const ops: FetchedStructureOpsBundle['ops'] = [];
  for (const row of opsRaw) {
    if (!isRecord(row)) continue;
    const seq = Number(row.seq);
    if (!Number.isFinite(seq)) continue;
    const op = parseStructureOpPayload(row.op);
    if (!op) continue;
    ops.push({
      seq: Math.floor(seq),
      op,
      client_id: parseNonEmptyString(row.client_id) ?? undefined
    });
  }
  return {
    ops,
    revision: Number(root.revision) || 0,
    last_applied_seq: Number(root.last_applied_seq) || 0,
    nodes: Array.isArray(root.nodes) ? root.nodes : []
  };
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
export function sendProjectStructureOp(
  projectId: string,
  op: StructureOpPayload,
  persistOpts?: { workspaceUserId: string }
): boolean {
  if (!isSupabaseCloudConfigured() || typeof window === 'undefined') return false;
  const pid = projectId.trim();
  if (!pid) return false;

  if (persistOpts?.workspaceUserId?.trim()) {
    enqueueStructureOpForCloudPersist(pid, persistOpts.workspaceUserId.trim(), op);
  }

  if (trySendStructureOpNow(pid, op)) return true;

  enqueuePendingStructureOp(pid, op);
  return false;
}
