/** URL·anon 키가 있을 때만 클라우드·로그인 게이트 활성 */
export function isSupabaseCloudConfigured(): boolean {
  try {
    const u = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim();
    const k = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
    return u.length > 10 && k.length > 20;
  } catch {
    return false;
  }
}
