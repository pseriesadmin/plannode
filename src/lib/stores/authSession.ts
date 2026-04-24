import { writable, get } from 'svelte/store';
import type { Session, User } from '@supabase/supabase-js';
import { browser } from '$app/environment';
import { supabase } from '$lib/supabase/client';
import { isSupabaseCloudConfigured } from '$lib/supabase/env';

export const authSession = writable<Session | null>(null);
export const authUser = writable<User | null>(null);
export const authLoading = writable(true);

/** 로그인된 사용자 이메일(ACL 매칭용). 없으면 null */
export function getAuthEmail(): string | null {
  const u = get(authUser);
  const e = u?.email ?? (u?.user_metadata?.email as string | undefined);
  if (!e || typeof e !== 'string') return null;
  return e.trim().toLowerCase();
}

/** 스토어에 이메일이 아직 없을 때(로그인 직후·생성 직후 레이스) `getUser()`로 보강 */
export async function getAuthEmailResolved(): Promise<string | null> {
  const sync = getAuthEmail();
  if (sync) return sync;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const u = data.user;
  const e = u.email ?? (u.user_metadata?.email as string | undefined);
  if (!e || typeof e !== 'string') return null;
  return e.trim().toLowerCase();
}

export function getAuthUserId(): string | null {
  return get(authUser)?.id ?? null;
}

let unsub: { unsubscribe: () => void } | null = null;

export function initAuthSession(): void {
  if (!browser) return;
  if (!isSupabaseCloudConfigured()) {
    authSession.set(null);
    authUser.set(null);
    authLoading.set(false);
    return;
  }
  authLoading.set(true);
  void supabase.auth.getSession().then(({ data: { session } }) => {
    authSession.set(session);
    authUser.set(session?.user ?? null);
    authLoading.set(false);
  });
  if (unsub) unsub.unsubscribe();
  const { data } = supabase.auth.onAuthStateChange((_evt, session) => {
    authSession.set(session);
    authUser.set(session?.user ?? null);
    authLoading.set(false);
  });
  unsub = data.subscription;
}

export async function signInWithEmailPassword(
  email: string,
  password: string
): Promise<{ ok: boolean; message: string }> {
  const em = email.trim().toLowerCase();
  const { error } = await supabase.auth.signInWithPassword({ email: em, password });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: '로그인했어.' };
}

export async function signUpWithEmailPassword(
  email: string,
  password: string
): Promise<{ ok: boolean; message: string }> {
  const em = email.trim().toLowerCase();
  const { error } = await supabase.auth.signUp({ email: em, password });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: '가입 요청을 보냈어. 이메일 인증이 켜져 있으면 메일함을 확인해줘.' };
}

export async function signOutEverywhere(): Promise<void> {
  await supabase.auth.signOut();
  authSession.set(null);
  authUser.set(null);
}
