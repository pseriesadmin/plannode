import { writable } from 'svelte/store';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '$lib/supabase/client';
import { normalizeAclEmail } from '$lib/supabase/projectAcl';
import { MAX_CONCURRENT_PRESENCE_OTHERS } from '$lib/plannodeCollabLimits';

export type ProjectPresencePeer = {
  user_id: string;
  email: string;
  /** 원격 사용자가 파일럿에서 선택 중인 노드 id (없으면 null) */
  selected_node_id?: string | null;
};

export const projectPresencePeers = writable<ProjectPresencePeer[]>([]);
/** 상한 초과로 Presence 목록에서 잘린 상대 수(레거시 데이터 등). 0이면 전부 표시 */
export const projectPresencePeersOverflow = writable(0);
export const projectPresenceSelectedEmail = writable<string | null>(null);

let channel: RealtimeChannel | null = null;
let subscribedProjectId: string | null = null;
let myPresenceUserId = '';
let myPresenceEmail: string | null = null;
let mySelectedNodeId: string | null = null;
/** SUBSCRIBED 이전에 track 하면 클라이언트에 따라 불안정 — 이 플래그 이후에만 갱신 track */
let presenceRealtimeSubscribed = false;

function sendPresenceTrack(ch: RealtimeChannel): void {
  void ch.track({
    user_id: myPresenceUserId,
    email: normalizeAclEmail(String(myPresenceEmail ?? '')),
    selected_node_id: mySelectedNodeId
  });
}

/** 첫 presence sync는 기존 접속자 전부를 "신규"로 치지 않음 */
let presenceFirstSync = true;
let presenceLastPeerUserIds = new Set<string>();
let presenceJoinDebounceTimer: ReturnType<typeof setTimeout> | null = null;
/** 구독 후 명시적 track 타이머 */
let presenceResyncTimer: ReturnType<typeof setTimeout> | null = null;
/** null 선택 해제 시 즉시 전송 방지 — 다음 유효 선택을 기다렸다 없으면 null 전송 */
let presenceNullDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function peerFromMeta(raw: unknown): ProjectPresencePeer | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as {
    user_id?: string;
    email?: string;
    selected_node_id?: string | null;
    selectedNodeId?: string | null;
  };
  const user_id = String(m.user_id ?? '').trim();
  if (!user_id) return null;
  const sidRaw = m.selected_node_id ?? m.selectedNodeId;
  const selected_node_id =
    sidRaw != null && String(sidRaw).trim() ? String(sidRaw).trim() : null;
  return {
    user_id,
    email: normalizeAclEmail(String(m.email ?? '')),
    selected_node_id
  };
}

export function unsubscribeProjectPresence() {
  presenceRealtimeSubscribed = false;
  projectPresenceSelectedEmail.set(null);
  projectPresencePeers.set([]);
  projectPresencePeersOverflow.set(0);
  myPresenceUserId = '';
  myPresenceEmail = null;
  mySelectedNodeId = null;
  subscribedProjectId = null;
  presenceFirstSync = true;
  presenceLastPeerUserIds = new Set();
  if (presenceJoinDebounceTimer) {
    clearTimeout(presenceJoinDebounceTimer);
    presenceJoinDebounceTimer = null;
  }
  if (presenceResyncTimer) {
    clearTimeout(presenceResyncTimer);
    presenceResyncTimer = null;
  }
  if (presenceNullDebounceTimer) {
    clearTimeout(presenceNullDebounceTimer);
    presenceNullDebounceTimer = null;
  }
  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
  }
}

export function toggleProjectPresencePeerEmail(email: string) {
  projectPresenceSelectedEmail.update((cur) => (cur === email ? null : email));
}

/** 파일럿 노드 선택 시 Presence track 갱신 — 트리 뷰 협업 표시용 */
export function updateMySelectedNode(nodeId: string | null): void {
  const next = nodeId && String(nodeId).trim() ? String(nodeId).trim() : null;
  mySelectedNodeId = next;
  if (!channel || !presenceRealtimeSubscribed) return;

  // 유효 노드 선택 시: null debounce 취소 후 즉시 전송
  if (next) {
    if (presenceNullDebounceTimer) {
      clearTimeout(presenceNullDebounceTimer);
      presenceNullDebounceTimer = null;
    }
    sendPresenceTrack(channel);
    return;
  }

  // null(선택 해제) 시: 600ms 후 다음 선택이 없으면 null 전송
  // — 캔버스 빈 공간 클릭 후 바로 다른 노드를 클릭하는 패턴에서 깜박임 방지
  if (presenceNullDebounceTimer) clearTimeout(presenceNullDebounceTimer);
  const ch = channel;
  presenceNullDebounceTimer = window.setTimeout(() => {
    presenceNullDebounceTimer = null;
    if (presenceRealtimeSubscribed && channel === ch && mySelectedNodeId === null) {
      sendPresenceTrack(ch);
    }
  }, 600);
}

/**
 * 현재 프로젝트 화면에 있는 계정끼리 동시 접속 표시(Realtime Presence).
 * allowedEmails가 비어 있으면 ACL 미사용·레거시·**소유자 세션(호출부에서 `[]` 전달)**과 동일하게 이메일 필터 없이 표시(본인 제외).
 *
 * **공유 프로젝트:** 멤버는 RLS 때문에 ACL 전체를 못 읽을 수 있어 `allowedEmails`에 소유자가 빠짐.
 * `alwaysShowUserIds`에 `cloud_workspace_source_user_id`(소유자 auth uid)를 넣으면 이메일 필터와 무관하게 표시.
 */
export async function subscribeProjectPresence(
  projectId: string,
  myUserId: string,
  myEmail: string | null,
  allowedEmails: string[],
  alwaysShowUserIds: string[] = []
): Promise<void> {
  if (!projectId || !myUserId) return;
  if (subscribedProjectId === projectId && channel && presenceRealtimeSubscribed) return;
  /** SUBSCRIBED 이전 재진입 시 unsubscribe가 채널을 끊어 피어/아바타가 비는 경우 방지 */
  if (subscribedProjectId === projectId && channel && !presenceRealtimeSubscribed) return;

  unsubscribeProjectPresence();
  subscribedProjectId = projectId;
  myPresenceUserId = myUserId;
  myPresenceEmail = myEmail;
  mySelectedNodeId = null;

  const allowedSet =
    allowedEmails.length > 0 ? new Set(allowedEmails.map((e) => normalizeAclEmail(e))) : null;
  const alwaysUid = new Set(alwaysShowUserIds.map((u) => String(u ?? '').trim()).filter(Boolean));

  const topic = `plannode:project:${projectId}`;
  const ch = supabase.channel(topic, {
    config: { presence: { key: myUserId } }
  });

  /** presenceState() 전체를 읽어 peers 스토어 갱신 — sync·join 두 이벤트에서 공통 사용 */
  const syncPeersFromState = (isJoinEvent = false) => {
    const state = ch.presenceState() as Record<string, unknown[]>;
    const list: ProjectPresencePeer[] = [];
    const seen = new Set<string>();
    for (const metas of Object.values(state)) {
      if (!Array.isArray(metas)) continue;
      // 같은 key(user_id)에 여러 메타가 쌓일 수 있음 — 마지막 non-null selected_node_id 우선 채택
      let merged: ProjectPresencePeer | null = null;
      for (const raw of metas) {
        const p = peerFromMeta(raw);
        if (!p) continue;
        if (!merged) {
          merged = p;
        } else if (p.selected_node_id != null) {
          // 더 최신 항목에 유효한 selected_node_id가 있으면 덮어씀
          merged = { ...merged, selected_node_id: p.selected_node_id };
        }
      }
      if (!merged || merged.user_id === myUserId) continue;
      if (allowedSet && merged.email && !allowedSet.has(merged.email) && !alwaysUid.has(merged.user_id)) continue;
      if (seen.has(merged.user_id)) continue;
      seen.add(merged.user_id);
      list.push(merged);
    }
    list.sort((a, b) => a.email.localeCompare(b.email));

    const overflow = Math.max(0, list.length - MAX_CONCURRENT_PRESENCE_OTHERS);
    projectPresencePeersOverflow.set(overflow);
    const capped = list.slice(0, MAX_CONCURRENT_PRESENCE_OTHERS);

    const currentIds = new Set(capped.map((p) => p.user_id));
    if (presenceFirstSync) {
      presenceFirstSync = false;
      presenceLastPeerUserIds = currentIds;
      projectPresencePeers.set(capped);
      return;
    }
    const newcomers = capped.filter((p) => !presenceLastPeerUserIds.has(p.user_id));
    presenceLastPeerUserIds = currentIds;
    projectPresencePeers.set(capped);

    if (!isJoinEvent && newcomers.length > 0 && typeof window !== 'undefined' && subscribedProjectId) {
      if (presenceJoinDebounceTimer) clearTimeout(presenceJoinDebounceTimer);
      const pid = subscribedProjectId;
      const snap = [...newcomers];
      presenceJoinDebounceTimer = window.setTimeout(() => {
        presenceJoinDebounceTimer = null;
        window.dispatchEvent(
          new CustomEvent('plannode-presence-peers-joined', {
            detail: { projectId: pid, peers: snap }
          })
        );
      }, 800);
    }
  };

  /** sync: 채널 전체 상태 동기화 (접속·이탈·메타 변경 모두 커버) */
  ch.on('presence', { event: 'sync' }, () => syncPeersFromState(false));

  /** join: track() 메타 업데이트 시 상대방에게 즉시 반영 — selected_node_id 갱신용 */
  ch.on('presence', { event: 'join' }, () => syncPeersFromState(true));

  channel = ch;
  ch.subscribe(async (status) => {
    if (channel !== ch) return;
    if (status === 'SUBSCRIBED') {
      presenceRealtimeSubscribed = true;
      sendPresenceTrack(ch);
      
      // 타이머 정리
      if (presenceResyncTimer) {
        clearTimeout(presenceResyncTimer);
      }
      
      /** 파일럿 selId는 유지되는데 mySelectedNodeId만 구독 시 null로 초기화됨 → maybeEmit 스킵으로 상대에게 null 고정 방지 */
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('plannode-presence-subscribed', {
            detail: { projectId: subscribedProjectId }
          })
        );
      }
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      presenceRealtimeSubscribed = false;
      if (presenceResyncTimer) {
        clearTimeout(presenceResyncTimer);
        presenceResyncTimer = null;
      }
    }
  });
}
