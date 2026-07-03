/**
 * 공유 프로젝트 워크스페이스 히스토리 (`plannode_project_workspace_history`)
 * docs/supabase/20260514_plannode_project_workspace_history.sql
 */
import { get, writable } from 'svelte/store';
import type { StoredNodeSnapshot } from '$lib/stores/nodeSnapshotHistory';
import { coerceStringToNodeSnapshotReason } from '$lib/stores/nodeSnapshotHistory';
import type { Node } from '$lib/supabase/client';
import { supabase } from './client';
import { isSupabaseCloudConfigured } from './env';
import { currentProject, nodes, buildNodeSnapshotCaptureMeta } from '$lib/stores/projects';

/** RPC `p_payload` 문자열 길이 가드(서버 1.8M와 여유) */
const PAYLOAD_ROUGH_MAX = 1_700_000;

/** 클라우드 히스토리 append — false 유지(협업 공유 타임라인). 과부하 시 debounce(60s/120s)만 조정 */
const PWH_CLOUD_APPEND_DISABLED = false;

/** `uploadWorkspaceToCloud` 성공 후 서버 append — 마지막 성공 시점 기준 트레일링 디바운스(TASK GATE B 2단계) */
const CLOUD_UPLOAD_PWH_DEBOUNCE_MS = 60_000;
/**
 * 주기 동기(≈32s)가 업로드 성공을 반복 호출하면 60s 타이머만 계속 리셋되어 append가 **영원히 안 도는** 문제 방지:
 * 첫 스케줄 시점부터 이 시간이 지나면 무조건 1회 플러시.
 */
const CLOUD_UPLOAD_PWH_MAX_WAIT_MS = 120_000;

let cloudUploadPwhTimer: ReturnType<typeof setTimeout> | null = null;
let cloudUploadPwhMaxTimer: ReturnType<typeof setTimeout> | null = null;
let cloudUploadPwhFirstScheduledAt: number | null = null;

function clearCloudUploadPwhTimers(): void {
  if (cloudUploadPwhTimer != null) {
    window.clearTimeout(cloudUploadPwhTimer);
    cloudUploadPwhTimer = null;
  }
  if (cloudUploadPwhMaxTimer != null) {
    window.clearTimeout(cloudUploadPwhMaxTimer);
    cloudUploadPwhMaxTimer = null;
  }
  cloudUploadPwhFirstScheduledAt = null;
}

/** Realtime INSERT 시 모달 등이 `fetchProjectWorkspaceHistorySnapshots`를 다시 읽도록 — `+page.svelte` 구독 */
export const projectWorkspaceHistoryRealtimeTick = writable(0);

function genSnapId(): string {
  return `snap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 워크스페이스 업로드 성공 직후 호출 — (1) 마지막 성공 후 **60s 무업로드** 시 append (2) 첫 스케줄 후 **120s** 경과 시에도 반드시 1회 append.
 */
export function scheduleAppendProjectWorkspaceHistoryAfterCloudUploadSuccess(): void {
  if (PWH_CLOUD_APPEND_DISABLED) return;
  if (!isSupabaseCloudConfigured() || typeof window === 'undefined') return;

  if (cloudUploadPwhFirstScheduledAt == null) {
    cloudUploadPwhFirstScheduledAt = Date.now();
    cloudUploadPwhMaxTimer = window.setTimeout(() => {
      cloudUploadPwhMaxTimer = null;
      void flushAppendProjectWorkspaceHistoryAfterCloudUploadQuiet();
    }, CLOUD_UPLOAD_PWH_MAX_WAIT_MS);
  }

  if (cloudUploadPwhTimer != null) window.clearTimeout(cloudUploadPwhTimer);
  cloudUploadPwhTimer = window.setTimeout(() => {
    cloudUploadPwhTimer = null;
    void flushAppendProjectWorkspaceHistoryAfterCloudUploadQuiet();
  }, CLOUD_UPLOAD_PWH_DEBOUNCE_MS);
}

async function flushAppendProjectWorkspaceHistoryAfterCloudUploadQuiet(): Promise<void> {
  if (!isSupabaseCloudConfigured() || typeof window === 'undefined') return;
  clearCloudUploadPwhTimers();
  const proj = get(currentProject);
  const nodeList = get(nodes);
  const pid = proj?.id?.trim();
  if (!proj || !pid || !Array.isArray(nodeList)) return;
  const snap: StoredNodeSnapshot = {
    id: genSnapId(),
    at: new Date().toISOString(),
    reason: 'cloud_upload',
    nodes: JSON.parse(JSON.stringify(nodeList)) as Node[],
    ...buildNodeSnapshotCaptureMeta('cloud_upload', proj, nodeList)
  };
  const payload = snapshotToPayload(snap);
  if (JSON.stringify(payload).length > PAYLOAD_ROUGH_MAX) {
    if (import.meta.env.DEV) {
      console.warn('[pwh cloud_upload append] payload too large, skip', pid);
    }
    return;
  }
  const { error } = await supabase.rpc('plannode_append_project_workspace_history', {
    p_project_id: pid,
    p_reason: String(snap.reason ?? ''),
    p_source: 'cloud_upload',
    p_payload: payload
  });
  if (error) {
    if (import.meta.env.DEV) {
      console.warn('[pwh cloud_upload append]', pid, error.message);
    }
    return;
  }
  if (import.meta.env.DEV) {
    console.info('[pwh cloud_upload append] ok', pid);
  }
  try {
    window.dispatchEvent(
      new CustomEvent('plannode-pwh-after-cloud-append', { detail: { projectId: pid } })
    );
  } catch {
    /* ignore */
  }
}

/**
 * `plannode_project_workspace_history` INSERT — Supabase Realtime `postgres_changes`.
 * 선행: `docs/supabase/20260515_plannode_pwh_realtime_publication.sql` 로 publication 추가.
 */
export function subscribeProjectWorkspaceHistoryRealtime(projectId: string): () => void {
  if (!isSupabaseCloudConfigured() || typeof window === 'undefined' || !projectId.trim()) {
    return () => {};
  }
  const pid = projectId.trim();
  const channel = supabase
    .channel(`pwh-rt:${pid}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'plannode_project_workspace_history',
        filter: `project_id=eq.${pid}`
      },
      () => {
        if (get(currentProject)?.id === pid) {
          projectWorkspaceHistoryRealtimeTick.update((n) => n + 1);
        }
      }
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

type PwhRow = {
  id: string;
  occurred_at: string;
  reason: string | null;
  source: string;
  payload: Record<string, unknown> | null;
};

function snapshotToPayload(s: StoredNodeSnapshot): Record<string, unknown> {
  return {
    id: s.id,
    at: s.at,
    reason: s.reason,
    nodes: s.nodes,
    ...(s.author !== undefined ? { author: s.author } : {}),
    ...(s.version !== undefined ? { version: s.version } : {}),
    ...(s.pipelineLabel !== undefined ? { pipelineLabel: s.pipelineLabel } : {}),
    ...(s.nodeCount !== undefined ? { nodeCount: s.nodeCount } : {})
  };
}

/**
 * 수동 스냅 등 1건을 서버 append-only 로그에 남김. 실패·미설정은 조용히 무시.
 */
export async function appendProjectWorkspaceHistoryFromSnapshot(
  projectId: string,
  snapshot: StoredNodeSnapshot,
  source = 'manual'
): Promise<void> {
  if (!isSupabaseCloudConfigured() || typeof window === 'undefined') return;
  const pid = String(projectId ?? '').trim();
  if (!pid) return;
  const payload = snapshotToPayload(snapshot);
  if (JSON.stringify(payload).length > PAYLOAD_ROUGH_MAX) return;

  const { error } = await supabase.rpc('plannode_append_project_workspace_history', {
    p_project_id: pid,
    p_reason: String(snapshot.reason ?? ''),
    p_source: String(source || 'client'),
    p_payload: payload
  });
  if (error && import.meta.env.DEV) {
    console.warn('[appendProjectWorkspaceHistoryFromSnapshot]', error.message);
  }
}

export function workspaceHistoryRowToStoredSnapshot(row: PwhRow): StoredNodeSnapshot | null {
  const p = row.payload;
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  if (!Array.isArray(o.nodes)) return null;
  const id = typeof o.id === 'string' && o.id.length ? o.id : `pwh_${row.id}`;
  const at = typeof o.at === 'string' && o.at.length ? o.at : row.occurred_at;
  const reason = coerceStringToNodeSnapshotReason(String(o.reason ?? row.reason ?? 'cloud_history'));
  const snap: StoredNodeSnapshot = {
    id,
    at,
    reason,
    nodes: o.nodes as Node[]
  };
  if (typeof o.author === 'string') snap.author = o.author;
  if (typeof o.version === 'string') snap.version = o.version;
  if (typeof o.pipelineLabel === 'string') snap.pipelineLabel = o.pipelineLabel;
  else if (row.source && row.source !== 'client') snap.pipelineLabel = `서버:${row.source}`;
  if (typeof o.nodeCount === 'number' && Number.isFinite(o.nodeCount)) snap.nodeCount = o.nodeCount;
  return snap;
}

export async function fetchProjectWorkspaceHistorySnapshots(
  projectId: string,
  limit = 50
): Promise<StoredNodeSnapshot[]> {
  if (!isSupabaseCloudConfigured() || typeof window === 'undefined') return [];
  const pid = String(projectId ?? '').trim();
  if (!pid) return [];
  const raw = Number(limit);
  const lim = Math.min(100, Math.max(1, Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 50));
  const { data, error } = await supabase
    .from('plannode_project_workspace_history')
    .select('id, occurred_at, reason, source, payload')
    .eq('project_id', pid)
    .order('occurred_at', { ascending: false })
    .limit(lim);
  if (error || !Array.isArray(data)) {
    if (error && import.meta.env.DEV) {
      console.warn('[fetchProjectWorkspaceHistorySnapshots]', error.message);
    }
    return [];
  }
  return (data as PwhRow[])
    .map((r) => workspaceHistoryRowToStoredSnapshot(r))
    .filter((x): x is StoredNodeSnapshot => x != null);
}
