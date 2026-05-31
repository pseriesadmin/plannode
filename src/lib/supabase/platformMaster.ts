import { supabase } from '$lib/supabase/client';
import { isSupabaseCloudConfigured } from '$lib/supabase/env';
import { getAuthUserId } from '$lib/stores/authSession';
import { isMissingRelationError } from '$lib/supabase/aclErrors';

const TABLE = 'plannode_platform_master';

let _pmCache: { uid: string; result: boolean; at: number } | null = null;
const PM_CACHE_TTL_MS = 60_000;

export function invalidatePlatformMasterCache(): void {
  _pmCache = null;
}

/** 로그인 직후 1회: 테이블이 비어 있으면 현재 사용자를 플랫폼 마스터로 등록 */
export async function tryClaimPlatformMasterIfVacant(): Promise<void> {
  if (!isSupabaseCloudConfigured()) return;
  const uid = getAuthUserId();
  if (!uid) return;
  const { data, error } = await supabase.from(TABLE).select('user_id').eq('id', 1).maybeSingle();
  if (error) {
    if (isMissingRelationError(error)) return;
    return;
  }
  if (data) return;
  invalidatePlatformMasterCache();
  const ins = await supabase.from(TABLE).insert({ id: 1, user_id: uid });
  if (ins.error && !isMissingRelationError(ins.error)) {
    console.warn('[platform_master]', ins.error.message);
  }
}

export async function isPlatformMaster(): Promise<boolean> {
  if (!isSupabaseCloudConfigured()) return false;
  const uid = getAuthUserId();
  if (!uid) return false;
  const now = Date.now();
  if (_pmCache && _pmCache.uid === uid && now - _pmCache.at < PM_CACHE_TTL_MS) {
    return _pmCache.result;
  }
  const { data, error } = await supabase.from(TABLE).select('user_id').eq('id', 1).maybeSingle();
  if (error) return false;
  if (!data) return false;
  const result = (data as { user_id: string }).user_id === uid;
  _pmCache = { uid, result, at: now };
  return result;
}
