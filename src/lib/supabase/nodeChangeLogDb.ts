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
      action: entry.action
    } as Record<string, unknown>
  }));

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
      return {
        id: `db_${row.id}`,
        at: typeof p.at === 'string' && p.at ? p.at : row.occurred_at,
        author: typeof row.actor_email === 'string' ? row.actor_email : undefined,
        nodeId: p.nodeId,
        nodeName: typeof p.nodeName === 'string' ? p.nodeName : '',
        action: p.action as NodeChangeAction
      };
    })
    .filter((x): x is NodeChangeLogEntry => x !== null);
}
