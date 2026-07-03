/**
 * 노드 변경 로그 DB 동기화
 * plannode_project_workspace_history 테이블 재활용 (reason='node_op')
 * — 마이그레이션 불필요: 기존 RLS·actor_email 트리거·Realtime 그대로 사용
 *
 * 각 사용자가 자신의 변경만 INSERT → DB에서 전체 조회 시 모든 참여자 이력 통합
 */
import { supabase } from './client';
import { isSupabaseCloudConfigured } from './env';
import type { NodeChangeAction, NodeChangeLogEntry } from '$lib/stores/nodeChangeLog';

const REASON_NODE_OP = 'node_op';
const FLUSH_DEBOUNCE_MS = 2_000;
const MAX_BATCH_PER_FLUSH = 50;

const PERSISTED_NODE_OP_ACTIONS: NodeChangeAction[] = [
  'create',
  'edit',
  'delete',
  'badge',
  'move',
  'prd_draft'
];

let pendingBatch: Array<{ projectId: string; entry: NodeChangeLogEntry }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** persistNodesFromPilot에서만 호출 — 삭제는 즉시, 나머지는 2s 디바운스 배치 INSERT */
export function scheduleNodeChangeLogDbWrite(
  projectId: string,
  entries: NodeChangeLogEntry[]
): void {
  if (!isSupabaseCloudConfigured() || typeof window === 'undefined') return;
  for (const e of entries) pendingBatch.push({ projectId, entry: e });
  // [Fix-5] delete 이벤트는 노드 소실 전 정보이므로 디바운스 우회하여 즉시 플러시
  if (entries.some((e) => e.action === 'delete')) {
    if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null; }
    void flushToDb();
    return;
  }
  if (flushTimer !== null) clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushToDb();
  }, FLUSH_DEBOUNCE_MS);
}

async function flushToDb(): Promise<void> {
  if (!pendingBatch.length) return;
  const batch = pendingBatch.splice(0, MAX_BATCH_PER_FLUSH);

  // 각 row의 payload는 경량 메타만 — full nodes 미포함
  const rows = batch.map(({ projectId, entry }) => ({
    project_id: projectId,
    occurred_at: entry.at,
    reason: REASON_NODE_OP,
    source: 'client',
    // actor_user_id·actor_email은 BEFORE INSERT 트리거(server-side)가 auth.uid()로 자동 설정
    payload: {
      at: entry.at,
      nodeId: entry.nodeId,
      nodeName: entry.nodeName,
      action: entry.action,
      ...(entry.detail != null ? { detail: entry.detail } : {})
    } as Record<string, unknown>
  })).filter((row) => {
    const action = (row.payload as { action?: string }).action as NodeChangeAction | undefined;
    return action != null && PERSISTED_NODE_OP_ACTIONS.includes(action);
  });

  if (!rows.length) {
    if (pendingBatch.length) {
      flushTimer = window.setTimeout(() => {
        flushTimer = null;
        void flushToDb();
      }, FLUSH_DEBOUNCE_MS);
    }
    return;
  }

  const { error } = await supabase.from('plannode_project_workspace_history').insert(rows);
  if (error && import.meta.env.DEV) {
    console.warn('[nodeChangeLogDb] INSERT 실패:', error.message);
  }

  // 배치 초과분이 남아 있으면 재스케줄
  if (pendingBatch.length) {
    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      void flushToDb();
    }, FLUSH_DEBOUNCE_MS);
  }
}

type NclRow = {
  id: string;
  occurred_at: string;
  actor_email: string | null;
  payload: Record<string, unknown> | null;
};

/** 모달 열릴 때 호출 — 프로젝트 전체 참여자의 node_op 이력 최신순 반환 */
export async function fetchNodeChangeLogFromDb(
  projectId: string,
  limit = 200
): Promise<NodeChangeLogEntry[]> {
  if (!isSupabaseCloudConfigured() || typeof window === 'undefined') return [];
  const pid = projectId.trim();
  if (!pid) return [];

  const { data, error } = await supabase
    .from('plannode_project_workspace_history')
    .select('id, occurred_at, actor_email, payload')
    .eq('project_id', pid)
    .eq('reason', REASON_NODE_OP)
    .order('occurred_at', { ascending: false })
    .limit(Math.min(limit, 500));

  if (error) {
    if (import.meta.env.DEV) console.warn('[nodeChangeLogDb] fetch 실패:', error.message);
    return [];
  }
  if (!Array.isArray(data)) return [];

  return (data as NclRow[])
    .map((row): NodeChangeLogEntry | null => {
      const p = row.payload;
      if (!p || typeof p.nodeId !== 'string' || typeof p.action !== 'string') return null;
      const action = p.action as NodeChangeAction;
      if (!PERSISTED_NODE_OP_ACTIONS.includes(action)) return null;
      return {
        id: `db_${row.id}`,
        at: typeof p.at === 'string' && p.at ? p.at : row.occurred_at,
        author: typeof row.actor_email === 'string' ? row.actor_email : undefined,
        nodeId: p.nodeId,
        nodeName: typeof p.nodeName === 'string' ? p.nodeName : '',
        action,
        detail: typeof p.detail === 'string' ? p.detail : undefined
      };
    })
    .filter((x): x is NodeChangeLogEntry => x !== null);
}

type PwhSummaryRow = {
  id: string;
  occurred_at: string;
  reason: string | null;
  source: string;
  actor_email: string | null;
  payload: Record<string, unknown> | null;
};

/** +page.svelte formatSnapshotReason과 동일 문자열 (+page import 없이 유지) */
function formatPwhSummaryReasonLabel(reason: string | null | undefined): string {
  const r = String(reason ?? '').trim();
  if (r === 'presence_peer') return '동시 접속';
  if (r === 'pre_pull') return '클라우드·병합 반영 직전';
  if (r === 'import') return '파일 가져오기·AI 덮어쓰기 직전';
  if (r === 'project_close') return '프로젝트 전환 직전';
  if (r === 'idle_10min') return '10분 무편집 저장';
  if (r === 'persist') return '캔버스 저장';
  if (r === 'cloud_upload') return '클라우드 업로드';
  if (r === 'project_create') return '프로젝트 생성';
  if (r === 'manual') return '수동 스냅샷';
  if (r === 'cloud_history') return '클라우드 병합 기록';
  if (r) return r;
  return '스냅샷';
}

function formatSummaryNodeCountLabel(raw: unknown): string {
  let n: number | undefined;
  if (typeof raw === 'number' && Number.isFinite(raw)) n = raw;
  else if (Array.isArray(raw)) n = raw.length;
  if (n === undefined || !Number.isFinite(n) || n < 0) return '— nodes';
  const num = n >= 1000 ? String(n) : String(n).padStart(3, '0');
  return `${num} nodes`;
}

/** 과거 full snapshot 행 — node_op 제외, 경량 요약(limit 기본 30) */
export async function fetchProjectHistorySummaryRows(
  projectId: string,
  limit = 30
): Promise<NodeChangeLogEntry[]> {
  if (!isSupabaseCloudConfigured() || typeof window === 'undefined') return [];
  const pid = projectId.trim();
  if (!pid) return [];

  const raw = Number(limit);
  const lim = Math.min(50, Math.max(1, Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30));

  const { data, error } = await supabase
    .from('plannode_project_workspace_history')
    .select('id, occurred_at, reason, source, actor_email, payload')
    .eq('project_id', pid)
    .neq('reason', REASON_NODE_OP)
    .order('occurred_at', { ascending: false })
    .limit(lim);

  if (error) {
    if (import.meta.env.DEV) console.warn('[nodeChangeLogDb] summary fetch 실패:', error.message);
    return [];
  }
  if (!Array.isArray(data)) return [];

  return (data as PwhSummaryRow[])
    .map((row): NodeChangeLogEntry | null => {
      const p = row.payload;
      const payloadReason =
        p && typeof p.reason === 'string' ? p.reason : null;
      const reasonLabel = formatPwhSummaryReasonLabel(payloadReason ?? row.reason);
      const nodeCountRaw =
        p && p.nodeCount !== undefined
          ? p.nodeCount
          : p && Array.isArray(p.nodes)
            ? p.nodes.length
            : undefined;
      const at =
        p && typeof p.at === 'string' && p.at
          ? p.at
          : row.occurred_at;
      const author =
        typeof row.actor_email === 'string' && row.actor_email
          ? row.actor_email
          : p && typeof p.author === 'string'
            ? p.author
            : undefined;
      return {
        id: `pwh_${row.id}`,
        at,
        author,
        nodeId: '',
        nodeName: `${reasonLabel} · ${formatSummaryNodeCountLabel(nodeCountRaw)}`,
        action: 'snapshot'
      };
    })
    .filter((x): x is NodeChangeLogEntry => x !== null);
}
