/** 공유 프로젝트: 소유자 제외 멤버(ACL `is_owner = false`) 최대 인원. 소유자 포함 총 5계정 */
export const MAX_SHARED_COLLABORATORS = 4;

/** 소유자를 포함한 프로젝트 접근 계정 최대 수 */
export const MAX_PROJECT_ACCESS_ACCOUNTS = MAX_SHARED_COLLABORATORS + 1;

/** Presence에 동시에 반영하는 상대 계정 수(본인 제외). ACL 상한과 동일하게 유지 */
export const MAX_CONCURRENT_PRESENCE_OTHERS = 4;

/** 소유자 워크스페이스로 공유 슬라이스 merge RPC 재시도 횟수(락·revision_stale 등) */
export const CLOUD_MERGE_SLICE_MAX_ATTEMPTS = 5;

/** `plannode_project_collab_try_acquire_lock` 에 넘기는 TTL(초). 서버 상한 600초 이내 */
export const CLOUD_MERGE_SLICE_LOCK_TTL_SECONDS = 180;

/** merge 재시도 사이 기본 대기(ms). attempt(1…)에 곱해 지수적으로 늘림 */
export const CLOUD_MERGE_SLICE_RETRY_BACKOFF_MS = 280;
