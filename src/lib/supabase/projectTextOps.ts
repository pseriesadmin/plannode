/**
 * EPIC C 1단계 — 모달 텍스트 OT ops (Broadcast only, pull/LWW는 기존 sync).
 * @see docs/plannode_ot1_text_ops_channel_spike.md
 * @see docs/plannode_ot1_modal_poc_spike.md
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '$lib/supabase/client';
import { isSupabaseCloudConfigured } from '$lib/supabase/env';

export const TEXT_OPS_BROADCAST_EVENT = 'text-op';
const TEXT_OPS_CLIENT_ID_KEY = 'plannode.textOps.clientId.v1';

export type TextOpField = 'name' | 'description';

export type TextOpPayload = {
  type: 'insert' | 'delete';
  pos: number;
  text?: string;
  len?: number;
};

/** Broadcast 페이로드 v1 — OT1-04에서 description 필드만 송신 */
export type TextOp = {
  v: 1;
  project_id: string;
  node_id: string;
  field: TextOpField;
  client_id: string;
  seq: number;
  op: TextOpPayload;
};

export type TextOpHandler = (op: TextOp) => void;

let channel: RealtimeChannel | null = null;
let subscribedProjectId: string | null = null;
let broadcastSubscribed = false;
let myUserId = '';
let myClientId = '';
let sendSeq = 0;
let onTextOp: TextOpHandler | null = null;

function topicForProject(projectId: string): string {
  return `plannode:project:${projectId}:text`;
}

function getOrCreateClientId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    let id = sessionStorage.getItem(TEXT_OPS_CLIENT_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? `c_${crypto.randomUUID()}`
          : `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      sessionStorage.setItem(TEXT_OPS_CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return `c_${Date.now()}`;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function parseTextOpPayload(raw: unknown): TextOpPayload | null {
  if (!isRecord(raw)) return null;
  const type = raw.type;
  if (type !== 'insert' && type !== 'delete') return null;
  const pos = Number(raw.pos);
  if (!Number.isFinite(pos) || pos < 0) return null;
  if (type === 'insert') {
    const text = raw.text;
    if (typeof text !== 'string') return null;
    return { type: 'insert', pos: Math.floor(pos), text };
  }
  const len = Number(raw.len ?? 1);
  if (!Number.isFinite(len) || len < 1) return null;
  return { type: 'delete', pos: Math.floor(pos), len: Math.floor(len) };
}

/** 수신 Broadcast payload → TextOp (검증 실패 시 null) */
export function parseTextOp(raw: unknown): TextOp | null {
  const root = isRecord(raw) && 'payload' in raw ? (raw as { payload: unknown }).payload : raw;
  if (!isRecord(root)) return null;
  if (root.v !== 1) return null;
  const project_id = String(root.project_id ?? '').trim();
  const node_id = String(root.node_id ?? '').trim();
  const field = root.field;
  if (!project_id || !node_id) return null;
  if (field !== 'name' && field !== 'description') return null;
  const client_id = String(root.client_id ?? '').trim();
  if (!client_id) return null;
  const seq = Number(root.seq);
  if (!Number.isFinite(seq)) return null;
  const op = parseTextOpPayload(root.op);
  if (!op) return null;
  return {
    v: 1,
    project_id,
    node_id,
    field,
    client_id,
    seq: Math.floor(seq),
    op
  };
}

export function getProjectTextOpsClientId(): string {
  if (!myClientId) myClientId = getOrCreateClientId();
  return myClientId;
}

export function isProjectTextOpsSubscribed(projectId?: string): boolean {
  if (!broadcastSubscribed || !channel) return false;
  if (projectId && subscribedProjectId !== projectId) return false;
  return true;
}

export function unsubscribeProjectTextOps(): void {
  broadcastSubscribed = false;
  subscribedProjectId = null;
  myUserId = '';
  sendSeq = 0;
  onTextOp = null;
  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
  }
}

/**
 * 프로젝트 단위 텍스트 ops Broadcast 구독.
 * Presence 채널과 분리(`:text` suffix). self 수신은 끔 — 로컬 echo는 송신 측에서 처리.
 */
export async function subscribeProjectTextOps(
  projectId: string,
  userId: string,
  handler: TextOpHandler
): Promise<void> {
  if (!isSupabaseCloudConfigured() || typeof window === 'undefined') return;
  if (!projectId?.trim() || !userId?.trim()) return;

  const pid = projectId.trim();
  if (subscribedProjectId === pid && channel && broadcastSubscribed && onTextOp === handler) {
    return;
  }

  unsubscribeProjectTextOps();
  subscribedProjectId = pid;
  myUserId = userId.trim();
  myClientId = getOrCreateClientId();
  onTextOp = handler;

  const ch = supabase.channel(topicForProject(pid), {
    config: { broadcast: { ack: false, self: false } }
  });

  ch.on('broadcast', { event: TEXT_OPS_BROADCAST_EVENT }, (msg) => {
    const op = parseTextOp(msg);
    if (!op || op.project_id !== subscribedProjectId) return;
    if (op.client_id === myClientId) return;
    onTextOp?.(op);
  });

  channel = ch;
  ch.subscribe((status) => {
    if (channel !== ch) return;
    if (status === 'SUBSCRIBED') {
      broadcastSubscribed = true;
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      broadcastSubscribed = false;
    }
  });
}

/**
 * 원격에 텍스트 op 1건 전송. 구독·SUBSCRIBED 전에는 false.
 */
export function sendProjectTextOp(
  projectId: string,
  nodeId: string,
  field: TextOpField,
  op: TextOpPayload
): boolean {
  if (!isSupabaseCloudConfigured() || typeof window === 'undefined') return false;
  if (!broadcastSubscribed || !channel || subscribedProjectId !== projectId) return false;
  if (!nodeId?.trim()) return false;

  sendSeq += 1;
  const payload: TextOp = {
    v: 1,
    project_id: projectId,
    node_id: nodeId.trim(),
    field,
    client_id: getProjectTextOpsClientId(),
    seq: sendSeq,
    op
  };

  const status = channel.send({
    type: 'broadcast',
    event: TEXT_OPS_BROADCAST_EVENT,
    payload
  });

  return status === 'ok';
}
