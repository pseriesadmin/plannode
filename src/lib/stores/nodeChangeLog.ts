/**
 * 노드 카드 단위 변경 이력 로그 (추가·수정·삭제)
 * 스냅샷 백업과 별개 — 경량 메타만 저장 (full nodes 미포함)
 */
import { writable } from 'svelte/store';

export type NodeChangeAction = 'create' | 'edit' | 'delete' | 'snapshot';

export interface NodeChangeLogEntry {
  id: string;
  at: string;
  author?: string;
  nodeId: string;
  nodeName: string;
  action: NodeChangeAction;
}

const KEY_PREFIX = 'plannode_node_change_log_v1_';
const MAX_ENTRIES = 200;

function storageKey(projectId: string): string {
  return KEY_PREFIX + projectId;
}

function newChgId(): string {
  return `chg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function appendNodeChangeLog(projectId: string, entries: NodeChangeLogEntry[]): void {
  if (typeof window === 'undefined' || !entries.length) return;
  try {
    const key = storageKey(projectId);
    const existing: NodeChangeLogEntry[] = JSON.parse(localStorage.getItem(key) ?? '[]');
    const merged = existing.concat(entries);
    const trimmed = merged.length > MAX_ENTRIES ? merged.slice(merged.length - MAX_ENTRIES) : merged;
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch {
    // localStorage 쓰기 실패 무시
  }
}

export function listNodeChangeLog(projectId: string): NodeChangeLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(storageKey(projectId)) ?? '[]') as NodeChangeLogEntry[];
  } catch {
    return [];
  }
}

export function clearNodeChangeLog(projectId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(projectId));
  } catch {
    // ignore
  }
}

export { newChgId };

/** 현재 세션 작성자 — +page.svelte에서 로그인 후 set */
export const nodeChangeLogAuthor = writable<string | undefined>(undefined);

/**
 * 두 노드 배열을 비교해 추가·수정·삭제를 감지하고 변경 로그에 기록한다.
 * Node 타입에 의존하지 않도록 필요 필드만 추출하는 generic 시그니처 사용.
 * 과부하 없음 — Map 기반 O(n), localStorage write는 소량 엔트리만.
 */
export function recordNodeDiffToChangeLog(
  projectId: string,
  prevNodes: ReadonlyArray<{ id: string; name?: string; description?: string }>,
  nextNodes: ReadonlyArray<{ id: string; name?: string; description?: string }>,
  author?: string
): void {
  if (typeof window === 'undefined') return;
  if (!prevNodes.length && !nextNodes.length) return;

  const prevMap = new Map(prevNodes.map((n) => [n.id, n]));
  const nextMap = new Map(nextNodes.map((n) => [n.id, n]));
  const now = new Date().toISOString();
  const entries: NodeChangeLogEntry[] = [];

  for (const [id, n] of nextMap) {
    if (!prevMap.has(id)) {
      entries.push({
        id: newChgId(), at: now, author,
        nodeId: id, nodeName: n.name || '(제목 없음)', action: 'create'
      });
    } else {
      const prev = prevMap.get(id)!;
      if (prev.name !== n.name || prev.description !== n.description) {
        entries.push({
          id: newChgId(), at: now, author,
          nodeId: id, nodeName: n.name || '(제목 없음)', action: 'edit'
        });
      }
    }
  }
  for (const [id, n] of prevMap) {
    if (!nextMap.has(id)) {
      entries.push({
        id: newChgId(), at: now, author,
        nodeId: id, nodeName: n.name || '(삭제된 노드)', action: 'delete'
      });
    }
  }

  if (entries.length) appendNodeChangeLog(projectId, entries);
}

function changeLogDedupeKey(entry: NodeChangeLogEntry): string {
  if (entry.action === 'snapshot') return `snap:${entry.id}`;
  const t = Date.parse(entry.at);
  const minute = Number.isFinite(t) ? Math.floor(t / 60_000) : 0;
  return `op:${entry.nodeId}:${entry.action}:${minute}`;
}

/** db_/pwh_ 행이 chg_ 로컬보다 우선(작성자 email 보존) */
function changeLogSourceRank(id: string): number {
  if (id.startsWith('db_') || id.startsWith('pwh_')) return 0;
  return 1;
}

/**
 * 히스토리 모달용 — DB node_op · 스냅샷 요약 · 로컬 변경 로그 병합.
 * 중복 키는 db_/pwh_ id 우선, 최신순 정렬 후 MAX_ENTRIES(200) cap.
 */
export function mergeChangeLogForModal(
  db: NodeChangeLogEntry[],
  local: NodeChangeLogEntry[],
  summaries: NodeChangeLogEntry[] = []
): NodeChangeLogEntry[] {
  const byKey = new Map<string, NodeChangeLogEntry>();
  const upsert = (entry: NodeChangeLogEntry) => {
    const key = changeLogDedupeKey(entry);
    const prev = byKey.get(key);
    if (!prev || changeLogSourceRank(entry.id) < changeLogSourceRank(prev.id)) {
      byKey.set(key, entry);
    }
  };
  for (const e of db) upsert(e);
  for (const e of summaries) upsert(e);
  for (const e of local) upsert(e);
  return Array.from(byKey.values())
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, MAX_ENTRIES);
}
