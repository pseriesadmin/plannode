import { supabase } from '$lib/supabase/client';
import { isSupabaseCloudConfigured } from '$lib/supabase/env';
import { getAuthUserId } from '$lib/stores/authSession';
import { isMissingRelationError } from '$lib/supabase/aclErrors';

const TABLE = 'plannode_platform_master';

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
  const ins = await supabase.from(TABLE).insert({ id: 1, user_id: uid });
  if (ins.error && !isMissingRelationError(ins.error)) {
    console.warn('[platform_master]', ins.error.message);
  }
}

export async function isPlatformMaster(): Promise<boolean> {
  if (!isSupabaseCloudConfigured()) return false;
  const uid = getAuthUserId();
  if (!uid) return false;
  const { data, error } = await supabase.from(TABLE).select('user_id').eq('id', 1).maybeSingle();
  if (error) return false;
  if (!data) return false;
  return (data as { user_id: string }).user_id === uid;
}
