import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

const URL = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const ANON = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export type AuthedClient = { supabase: SupabaseClient; user: User; accessToken: string };

/**
 * Supabase + 현재 Access Token으로 사용자 식별 (API 라우트 · RLS용 클라이언트)
 */
export async function getSupabaseUserForRequest(request: Request): Promise<AuthedClient | { error: 'no_config' | 'no_auth' | 'invalid_token' }> {
  if (!URL || !ANON) {
    return { error: 'no_config' };
  }
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return { error: 'no_auth' };
  }
  const accessToken = auth.slice(7).trim();
  if (!accessToken) {
    return { error: 'no_auth' };
  }
  const supabase = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { error: 'invalid_token' };
  }
  return { supabase, user: data.user, accessToken };
}
