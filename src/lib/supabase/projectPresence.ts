import { writable } from 'svelte/store';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '$lib/supabase/client';
import { normalizeAclEmail } from '$lib/supabase/projectAcl';

export type ProjectPresencePeer = {
  user_id: string;
  email: string;
};

export const projectPresencePeers = writable<ProjectPresencePeer[]>([]);
export const projectPresenceSelectedEmail = writable<string | null>(null);

let channel: RealtimeChannel | null = null;
let subscribedProjectId: string | null = null;

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
  subscribedProjectId = null;
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
 */
export async function subscribeProjectPresence(
  projectId: string,
  myUserId: string,
  myEmail: string | null,
  allowedEmails: string[]
): Promise<void> {
  if (!projectId || !myUserId) return;
  if (subscribedProjectId === projectId && channel) return;

  unsubscribeProjectPresence();
  subscribedProjectId = projectId;

  const allowedSet =
    allowedEmails.length > 0 ? new Set(allowedEmails.map((e) => normalizeAclEmail(e))) : null;

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
        if (allowedSet && p.email && !allowedSet.has(p.email)) continue;
        if (seen.has(p.user_id)) continue;
        seen.add(p.user_id);
        list.push(p);
      }
    }
    list.sort((a, b) => a.email.localeCompare(b.email));
    projectPresencePeers.set(list);
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
