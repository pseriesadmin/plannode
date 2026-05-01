/** PostgREST: 테이블 미생성·스키마 캐시 없음 등 (컬럼 부재는 제외 — 옛 마이그레이션과 구분) */
export function isMissingRelationError(err: { code?: string; message?: string; details?: string } | null): boolean {
  if (!err) return false;
  const c = String(err.code ?? '');
  const m = String(err.message ?? '') + String(err.details ?? '');
  if (/column\b.*does not exist|does not exist.*\bcolumn\b/i.test(m)) return false;
  if (/\bPGRST204\b|\b42703\b/i.test(c + m)) return false;
  return (
    c === 'PGRST205' ||
    c === '42P01' ||
    m.includes('schema cache') ||
    m.includes('Could not find the table') ||
    /relation\s+["']?[^"'\s]+["']?\s+does not exist/i.test(m)
  );
}

/** select 목록에 없는 컬럼(예: workspace_source_user_id 미적용 DB) */
export function isUnknownSelectColumnError(err: { code?: string; message?: string; details?: string } | null): boolean {
  if (!err) return false;
  const c = String(err.code ?? '');
  const m = (String(err.message ?? '') + String(err.details ?? '')).toLowerCase();
  return (
    /\bPGRST204\b/.test(c) ||
    /\b42703\b/.test(c) ||
    (m.includes('column') && m.includes('does not exist')) ||
    /could not find.*\b(column|field)\b/i.test(m)
  );
}

export const ACL_TABLE_MISSING_MSG =
  'DB에 plannode_project_acl 테이블이 없어(404). Supabase → SQL Editor에서 docs/supabase/plannode_platform_master.sql 실행 후 docs/supabase/plannode_project_acl.sql 을 실행해줘.';

export const ACL_SCHEMA_COLUMN_DRIFT_MSG =
  'ACL 테이블은 있는데 스키마가 옛 버전이야(또는 일부 컬럼만 없음). Supabase → SQL Editor에서 최신 docs/supabase/plannode_project_acl.sql 전체를 실행한 뒤, docs/supabase/plannode_workspace_fetch_project_slice.sql 과 NOTIFY pgrst 스크립트를 실행해줘.';

export const PLATFORM_MASTER_MISSING_MSG =
  'plannode_platform_master 테이블이 없어. docs/supabase/plannode_platform_master.sql 을 먼저 실행해줘.';

/** 테이블은 있는데 PostgREST 스키마 캐시만 낡은 경우 */
export function isSchemaCacheStaleMessage(msg: string): boolean {
  const m = String(msg ?? '');
  return m.includes('schema cache') || m.includes('PGRST205');
}

export const ACL_SCHEMA_RELOAD_HINT =
  "PostgREST가 새 테이블을 아직 반영하지 않은 상태야.\n\n① Supabase → SQL Editor에서 아래 한 줄 실행\n② 이 창에서 「다시 불러오기」\n③ 그래도 안 되면 Table Editor에 테이블이 보이는지 확인 후, 마이그레이션 SQL을 다시 실행해줘.\n\nNOTIFY pgrst, 'reload schema';";

/** plannode_workspace 없음·스키마 캐시(PGRST205 등) */
export function isWorkspaceMissingOrCacheError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const m = String(err.message ?? '');
  return err.code === 'PGRST205' || err.code === '42P01' || m.includes('plannode_workspace');
}

export const WORKSPACE_SETUP_MSG =
  "클라우드 워크스페이스 테이블(plannode_workspace)이 없거나 API가 아직 인식하지 못했어.\n\n① Supabase → SQL Editor에서 docs/supabase/plannode_workspace.sql 실행\n② 같은 창에서 NOTIFY pgrst, 'reload schema'; 한 줄 실행(또는 SQL 파일 끝에 포함됨)\n③ 잠시 뒤 ☁↑ 다시 시도";

export function userFacingAclErrorFromSupabase(err: { message?: string; code?: string; details?: string } | null): string {
  if (!err) return '알 수 없는 오류';
  const msg = String(err.message ?? '');
  if (isSchemaCacheStaleMessage(msg)) return ACL_SCHEMA_RELOAD_HINT;
  if (isUnknownSelectColumnError(err)) return ACL_SCHEMA_COLUMN_DRIFT_MSG;
  if (isMissingRelationError(err)) return ACL_TABLE_MISSING_MSG;
  if (/infinite recursion|policy.*recurs/i.test(msg)) {
    return 'DB 접근 정책(RLS) 재귀 오류야. Supabase SQL Editor에서 docs/supabase/plannode_project_acl.sql 전체를 다시 실행해줘(함수·정책 패치 포함).';
  }
  return msg;
}

/** 모달에서 「다시 불러오기」 버튼 표시 여부 */
export function isAclReloadHelpMessage(msg: string): boolean {
  return String(msg).includes('NOTIFY pgrst') || String(msg).includes('다시 불러오기');
}
