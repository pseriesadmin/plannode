import { writable } from 'svelte/store';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '$lib/supabase/client';
import { normalizeAclEmail } from '$lib/supabase/projectAcl';
import { MAX_CONCURRENT_PRESENCE_OTHERS } from '$lib/plannodeCollabLimits';

export type ProjectPresencePeer = {
  user_id: string;
  email: string;
};

export const projectPresencePeers = writable<ProjectPresencePeer[]>([]);
/** 상한 초과로 Presence 목록에서 잘린 상대 수(레거시 데이터 등). 0이면 전부 표시 */
export const projectPresencePeersOverflow = writable(0);
export const projectPresenceSelectedEmail = writable<string | null>(null);

let channel: RealtimeChannel | null = null;
let subscribedProjectId: string | null = null;

/** 첫 presence sync는 기존 접속자 전부를 "신규"로 치지 않음 */
let presenceFirstSync = true;
let presenceLastPeerUserIds = new Set<string>();
let presenceJoinDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function peerFromMeta(raw: unknown): ProjectPresencePeer | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as { user_id?: string; email?: string };
  const user_id = String(m.user_id ?? '').trim();
  if (!user_id) return null;
  return { user_id, email: normalizeAclEmail(String(m.email ?? '')) };
}

export function unsubscribeProjectPresence() {
  projectPresenceSelectedEmail.set(null);
  projectPresencePeers.set([]);
  projectPresencePeersOverflow.set(0);
  subscribedProjectId = null;
  presenceFirstSync = true;
  presenceLastPeerUserIds = new Set();
  if (presenceJoinDebounceTimer) {
    clearTimeout(presenceJoinDebounceTimer);
    presenceJoinDebounceTimer = null;
  }
  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
  }
}

export function toggleProjectPresencePeerEmail(email: string) {
  projectPresenceSelectedEmail.update((cur) => (cur === email ? null : email));
}

/**
 * 현재 프로젝트 화면에 있는 계정끼리 동시 접속 표시(Realtime Presence).
 * allowedEmails가 비어 있으면 ACL 미사용·레거시와 동일하게 필터 없이 표시(본인 제외).
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
  if (subscribedProjectId === projectId && channel) return;

  unsubscribeProjectPresence();
  subscribedProjectId = projectId;

  const allowedSet =
    allowedEmails.length > 0 ? new Set(allowedEmails.map((e) => normalizeAclEmail(e))) : null;
  const alwaysUid = new Set(alwaysShowUserIds.map((u) => String(u ?? '').trim()).filter(Boolean));

  const topic = `plannode:project:${projectId}`;
  const ch = supabase.channel(topic, {
    config: { presence: { key: myUserId } }
  });

  ch.on('presence', { event: 'sync' }, () => {
    const state = ch.presenceState() as Record<string, unknown[]>;
    const list: ProjectPresencePeer[] = [];
    const seen = new Set<string>();
    for (const metas of Object.values(state)) {
      if (!Array.isArray(metas)) continue;
      for (const raw of metas) {
        const p = peerFromMeta(raw);
        if (!p || p.user_id === myUserId) continue;
        if (allowedSet && p.email && !allowedSet.has(p.email) && !alwaysUid.has(p.user_id)) continue;
        if (seen.has(p.user_id)) continue;
        seen.add(p.user_id);
        list.push(p);
      }
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

    if (newcomers.length > 0 && typeof window !== 'undefined' && subscribedProjectId) {
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
  });

  ch.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await ch.track({
        user_id: myUserId,
        email: normalizeAclEmail(String(myEmail ?? ''))
      });
    }
  });

  channel = ch;
}
