import { get } from 'svelte/store';
import { supabase } from '$lib/supabase/client';
import {
  gatherWorkspaceBundle,
  mergeWorkspaceBundleFromCloudRemote,
  mergeNodeListsForCloud,
  loadProjectNodesFromLocalStorage,
  replaceWorkspaceFromBundle,
  upsertImportedPlannodeTreeV1,
  projects,
  currentProject,
  selectProject,
  projectWorkspaceNodesJsonSnapshot,
  clearPendingWorkspaceDeletions,
  type WorkspaceBundle
} from '$lib/stores/projects';
import {
  ensureOwnerAclRowForMyProject,
  fetchProjectSliceFromCloud,
  trySelectProject
} from '$lib/supabase/projectAcl';
import type { Node, Project } from '$lib/supabase/client';
import { isSupabaseCloudConfigured } from '$lib/supabase/env';
import { isWorkspaceMissingOrCacheError, WORKSPACE_SETUP_MSG } from '$lib/supabase/aclErrors';
import { markCloudWorkspaceSynced, markCloudWorkspaceFailed } from '$lib/stores/workspaceDirty';
import { getAuthUserId } from '$lib/stores/authSession';
import { captureNodeSnapshot } from '$lib/stores/nodeSnapshotHistory';
import {
  CLOUD_MERGE_SLICE_LOCK_TTL_SECONDS,
  CLOUD_MERGE_SLICE_MAX_ATTEMPTS,
  CLOUD_MERGE_SLICE_RETRY_BACKOFF_MS
} from '$lib/plannodeCollabLimits';

export { isSupabaseCloudConfigured };

const TABLE = 'plannode_workspace';

/** 내 plannode_workspace 행의 `updated_at` 캐시 — 자동 풀 시 불필요한 전체 병합 방지 */
export const OWN_WORKSPACE_REMOTE_TS_KEY = 'plannode_own_workspace_remote_updated_at';

async function requireSessionUserId(): Promise<{ userId: string | null; error?: string }> {
  const { data: sess } = await supabase.auth.getSession();
  const id = sess.session?.user?.id;
  if (!id) return { userId: null, error: '이메일 로그인이 필요해. 먼저 로그인해줘.' };
  return { userId: id };
}

function normalizeBundle(row: {
  projects_json: unknown;
  nodes_by_project_json: unknown;
}): WorkspaceBundle | null {
  const projects = row.projects_json;
  const nodesRaw = row.nodes_by_project_json;
  if (!Array.isArray(projects)) return null;
  if (typeof nodesRaw !== 'object' || nodesRaw === null || Array.isArray(nodesRaw)) return null;
  const nodesByProject: Record<string, Node[]> = {};
  for (const [k, v] of Object.entries(nodesRaw as Record<string, unknown>)) {
    nodesByProject[k] = Array.isArray(v) ? (v as Node[]) : [];
  }
  return { projects: projects as Project[], nodesByProject };
}

/** 업로드 직전: 서버 `updated_at`이 내가 마지막으로 맞춘 값과 다르면(다른 기기·탭) LWW로 로컬에 먼저 병합 */
async function mergeRemoteWorkspaceBeforeUpload(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('updated_at, projects_json, nodes_by_project_json')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return;

  const remoteTs = String((data as { updated_at?: string }).updated_at ?? '');
  if (!remoteTs) return;

  let prev = '';
  try {
    prev = localStorage.getItem(OWN_WORKSPACE_REMOTE_TS_KEY) ?? '';
  } catch {
    prev = '';
  }

  const bundle = normalizeBundle(data as { projects_json: unknown; nodes_by_project_json: unknown });
  if (!bundle?.projects?.length) return;

  if (remoteTs === prev) return;

  mergeWorkspaceBundleFromCloudRemote(bundle);
}

function isWorkspaceUpsertRpcMissing(err: { message?: string; code?: string; details?: string } | null): boolean {
  if (!err) return false;
  const m = (String(err.message ?? '') + ' ' + String(err.details ?? '')).toLowerCase();
  const c = String(err.code ?? '');
  return (
    c === 'PGRST202' ||
    c === 'PGRST301' ||
    /\b404\b/.test(m) ||
    m.includes('not found') ||
    m.includes('could not find') ||
    /function public\.plannode_workspace_upsert_workspace_bundle/i.test(String(err.message ?? ''))
  );
}

/** revision/락 RPC 미배포 시 조용히 생략 (docs/supabase/plannode_project_collab_revision_lock.sql) */
function isCollabRevisionRpcMissing(err: { message?: string; code?: string; details?: string } | null): boolean {
  if (!err) return false;
  const m = (String(err.message ?? '') + ' ' + String(err.details ?? '')).toLowerCase();
  const c = String(err.code ?? '');
  return (
    c === 'PGRST202' ||
    c === 'PGRST301' ||
    /\b404\b/.test(m) ||
    m.includes('not found') ||
    m.includes('could not find') ||
    /plannode_project_collab_get_revision/i.test(String(err.message ?? '')) ||
    /plannode_project_collab_try_acquire_lock/i.test(String(err.message ?? '')) ||
    /plannode_project_collab_release_lock/i.test(String(err.message ?? ''))
  );
}

function rpcBigintToNumber(data: unknown): number | null {
  if (data == null) return null;
  if (typeof data === 'number' && Number.isFinite(data)) return data;
  if (typeof data === 'string') {
    const n = Number(data);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

type UpsertBundleRpcResult = {
  ok?: boolean;
  reason?: string;
  server_updated_at?: string | null;
};

/** merge RPC와 동일한 키로 ACL 행이 SELECT RLS에 걸러져 보이는지 — 없으면 RPC 403만 반복되므로 호출 생략 */
async function canPushMergeSliceForProject(projectId: string, workspaceUserId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('plannode_project_acl')
    .select('id')
    .eq('project_id', projectId)
    .eq('workspace_source_user_id', workspaceUserId)
    .limit(1);
  if (error || !data?.length) return false;
  return true;
}

const mergeSliceWarnAt = new Map<string, number>();
const mergeSliceUserToastAt = new Map<string, number>();
const mergeLockUserToastAt = new Map<string, number>();
const mergeRevisionStaleToastAt = new Map<string, number>();
const MERGE_SLICE_WARN_COOLDOWN_MS = 120_000;

function collabErrorBlob(err: { message?: string; details?: string; code?: string } | null): string {
  if (!err) return '';
  return `${String(err.message ?? '')} ${String(err.details ?? '')} ${String(err.code ?? '')}`.toLowerCase();
}

function isMergeLockOrBusyError(err: { message?: string; details?: string } | null): boolean {
  const s = collabErrorBlob(err);
  return s.includes('merge_locked') || s.includes('locked_by_other');
}

function isRevisionStaleError(err: { message?: string; details?: string } | null): boolean {
  return collabErrorBlob(err).includes('revision_stale');
}

function isForbiddenMergeError(err: { message?: string; details?: string; code?: string } | null): boolean {
  const s = collabErrorBlob(err);
  return s.includes('forbidden') || s.includes('42501') || s.includes('pgrst301');
}

function notifyMergeLockBusyToastThrottled(projectId: string, projectName: string | undefined): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const prev = mergeLockUserToastAt.get(projectId) ?? 0;
  if (now - prev < MERGE_SLICE_WARN_COOLDOWN_MS) return;
  mergeLockUserToastAt.set(projectId, now);
  const nm = projectName?.trim() ?? '';
  const label = nm ? `「${nm.length > 40 ? `${nm.slice(0, 40)}…` : nm}」` : '이 공유 프로젝트';
  try {
    window.dispatchEvent(
      new CustomEvent('plannode-pilot-toast', {
        detail: {
          message: `${label}: 다른 멤버가 동시에 올리는 중이야. 잠시 후 자동으로 다시 시도할게.`
        }
      })
    );
  } catch {
    /* ignore */
  }
}

function notifyRevisionStaleSyncedToastThrottled(projectId: string, projectName: string | undefined): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const prev = mergeRevisionStaleToastAt.get(projectId) ?? 0;
  if (now - prev < MERGE_SLICE_WARN_COOLDOWN_MS) return;
  mergeRevisionStaleToastAt.set(projectId, now);
  const nm = projectName?.trim() ?? '';
  const label = nm ? `「${nm.length > 40 ? `${nm.slice(0, 40)}…` : nm}」` : '공유 프로젝트';
  try {
    window.dispatchEvent(
      new CustomEvent('plannode-pilot-toast', {
        detail: {
          message: `${label}: 소유자 쪽이 더 최신이어서 먼저 가져왔어. 화면 확인 후 필요하면 한 번 더 저장해줘.`
        }
      })
    );
  } catch {
    /* ignore */
  }
}

function notifyMergeSliceFailureToastThrottled(
  projectId: string,
  projectName: string | undefined,
  err: { message?: string; details?: string; code?: string } | null
): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const prev = mergeSliceUserToastAt.get(projectId) ?? 0;
  if (now - prev < MERGE_SLICE_WARN_COOLDOWN_MS) return;
  mergeSliceUserToastAt.set(projectId, now);
  const nm = projectName?.trim() ?? '';
  const label = nm ? `「${nm.length > 40 ? `${nm.slice(0, 40)}…` : nm}」` : '공유 프로젝트';
  let message = `${label}: 클라우드에 반영하지 못했어. 연결을 확인하거나 잠시 후 다시 저장해줘.`;
  if (isForbiddenMergeError(err)) {
    message = `${label}: 편집 권한이 없거나 로그인이 만료됐을 수 있어. 다시 로그인한 뒤 시도해줘.`;
  } else if (isRevisionStaleError(err)) {
    message = `${label}: 서버 쪽이 더 앞서 있어. 잠시 후 다시 저장하거나, 목록에서 새로고침해줘.`;
  } else {
    const blob = collabErrorBlob(err);
    if (blob.includes('pgrst202') || blob.includes('could not find') || blob.includes('function public.plannode_workspace_merge')) {
      message = `${label}: 서버 함수가 아직 맞지 않아. docs/supabase/plannode_project_collab_revision_lock.sql 를 실행했는지 확인해줘.`;
    }
  }
  try {
    window.dispatchEvent(
      new CustomEvent('plannode-pilot-toast', {
        detail: { message }
      })
    );
  } catch {
    /* ignore */
  }
}

function warnMergeSliceThrottled(projectId: string, message: string): void {
  if (!import.meta.env.DEV) return;
  const now = Date.now();
  const prev = mergeSliceWarnAt.get(projectId) ?? 0;
  if (now - prev < MERGE_SLICE_WARN_COOLDOWN_MS) return;
  mergeSliceWarnAt.set(projectId, now);
  console.warn(
    '[uploadWorkspaceToCloud] 소유자 워크스페이스에 공유 프로젝트 반영 실패(merge RPC·ACL):',
    projectId,
    message,
    '→ Supabase에서 docs/supabase/plannode_project_collab_revision_lock.sql(또는 acl_jwt_fix) 실행·ACL workspace_source_user_id 확인.'
  );
}

async function pushProjectSlicesToOwners(bundle: WorkspaceBundle, userId: string): Promise<void> {
  for (const p of bundle.projects) {
    const src = p.cloud_workspace_source_user_id;
    if (!src || src === userId) continue;
    const can = await canPushMergeSliceForProject(p.id, src);
    if (!can) continue;

    let lastErr: { message?: string; details?: string; code?: string } | null = null;
    let revisionStaleNotifiedThisPush = false;
    for (let attempt = 0; attempt < CLOUD_MERGE_SLICE_MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        const delay =
          CLOUD_MERGE_SLICE_RETRY_BACKOFF_MS * attempt + Math.floor(Math.random() * 220);
        await new Promise((r) => setTimeout(r, delay));
      }

      const fresh = gatherWorkspaceBundle();
      const proj = fresh.projects.find((x) => x.id === p.id);
      if (!proj) break;
      const nodes = fresh.nodesByProject[p.id] ?? [];
      const { cloud_workspace_source_user_id: _cw, ...meta } = proj;

      let baseRevision: number | null = null;
      const { data: revData, error: revErr } = await supabase.rpc('plannode_project_collab_get_revision', {
        p_workspace_user_id: src,
        p_project_id: p.id
      });
      if (!revErr) {
        const rn = rpcBigintToNumber(revData);
        if (rn !== null) baseRevision = rn;
      } else if (!isCollabRevisionRpcMissing(revErr) && import.meta.env.DEV) {
        console.warn('[pushProjectSlicesToOwners] plannode_project_collab_get_revision', revErr.message);
      }

      let lockHeld = false;
      const { data: lockData, error: lockErr } = await supabase.rpc('plannode_project_collab_try_acquire_lock', {
        p_workspace_user_id: src,
        p_project_id: p.id,
        p_ttl_seconds: CLOUD_MERGE_SLICE_LOCK_TTL_SECONDS
      });
      if (!lockErr && lockData && typeof lockData === 'object' && 'ok' in lockData) {
        const ok = (lockData as { ok?: boolean }).ok === true;
        const reason = String((lockData as { reason?: string }).reason ?? '');
        if (ok) {
          lockHeld = true;
        } else if (reason === 'locked_by_other') {
          notifyMergeLockBusyToastThrottled(p.id, proj.name);
          lastErr = { message: 'merge_locked' };
          continue;
        }
      } else if (lockErr && !isCollabRevisionRpcMissing(lockErr) && import.meta.env.DEV) {
        console.warn('[pushProjectSlicesToOwners] plannode_project_collab_try_acquire_lock', lockErr.message);
      }

      try {
        const { error: mErr } = await supabase.rpc('plannode_workspace_merge_project_slice', {
          p_workspace_user_id: src,
          p_project_id: p.id,
          p_project: meta,
          p_nodes: nodes,
          p_base_revision: baseRevision
        });
        if (!mErr) {
          lastErr = null;
          break;
        }
        lastErr = mErr;
        const msg = String(mErr.message ?? '');
        const det = String((mErr as { details?: string }).details ?? '');
        if (msg.includes('revision_stale') || det.includes('revision_stale')) {
          await pullSharedProjectSlicesIfNewer();
          if (!revisionStaleNotifiedThisPush) {
            revisionStaleNotifiedThisPush = true;
            notifyRevisionStaleSyncedToastThrottled(p.id, proj.name);
          }
          continue;
        }
        if (msg.includes('merge_locked') || det.includes('merge_locked')) {
          notifyMergeLockBusyToastThrottled(p.id, proj.name);
          continue;
        }
      } finally {
        if (lockHeld) {
          const { error: relErr } = await supabase.rpc('plannode_project_collab_release_lock', {
            p_workspace_user_id: src,
            p_project_id: p.id
          });
          if (relErr && !isCollabRevisionRpcMissing(relErr) && import.meta.env.DEV) {
            console.warn('[pushProjectSlicesToOwners] plannode_project_collab_release_lock', relErr.message);
          }
        }
      }
    }
    if (lastErr) {
      warnMergeSliceThrottled(p.id, lastErr.message ?? '');
      if (!isMergeLockOrBusyError(lastErr)) {
        notifyMergeSliceFailureToastThrottled(p.id, p.name, lastErr);
      }
    }
  }
}

/** 로컬 전체 → Supabase 한 행 upsert(RPC 조건부 갱신 우선, 충돌 시 병합 후 최대 3회 재시도) */
export async function uploadWorkspaceToCloud(): Promise<{ ok: boolean; message: string }> {
  if (!isSupabaseCloudConfigured()) {
    return { ok: false, message: 'Supabase URL/키가 .env에 없어.' };
  }
  const { userId, error: authErr } = await requireSessionUserId();
  if (!userId) return { ok: false, message: authErr || '로그인 실패' };

  const MAX_ATTEMPTS = 4;
  let lastConflict = false;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await mergeRemoteWorkspaceBeforeUpload(userId);

    const bundle = gatherWorkspaceBundle();
    for (const p of bundle.projects) {
      if (p.owner_user_id === userId) {
        const acl = await ensureOwnerAclRowForMyProject(p.id);
        if (!acl.ok && import.meta.env.DEV) {
          console.warn('[uploadWorkspaceToCloud] 소유자 ACL 보장 실패:', p.id, acl.message);
        }
      }
    }

    const payload = {
      user_id: userId,
      projects_json: bundle.projects,
      nodes_by_project_json: bundle.nodesByProject,
      updated_at: new Date().toISOString()
    };

    const { data: pre } = await supabase.from(TABLE).select('updated_at').eq('user_id', userId).maybeSingle();
    const expectedTs =
      pre && (pre as { updated_at?: string }).updated_at != null
        ? String((pre as { updated_at: string }).updated_at)
        : null;

    const { data: rpcData, error: rpcError } = await supabase.rpc('plannode_workspace_upsert_workspace_bundle', {
      p_projects_json: bundle.projects,
      p_nodes_by_project_json: bundle.nodesByProject,
      p_expected_server_updated_at: expectedTs
    });

    if (rpcError) {
      if (isWorkspaceUpsertRpcMissing(rpcError)) {
        const { error } = await supabase.from(TABLE).upsert(payload, { onConflict: 'user_id' });
        if (error) {
          markCloudWorkspaceFailed();
          if (isWorkspaceMissingOrCacheError(error)) {
            if (import.meta.env.DEV) {
              console.info('[plannode cloud upload] 워크스페이스 테이블·스키마 설정 필요(PGRST205). SQL 실행 후 NOTIFY 권장.');
            }
            return { ok: false, message: WORKSPACE_SETUP_MSG };
          }
          console.error('[plannode cloud upload]', error);
          return {
            ok: false,
            message:
              error.code === '42P01'
                ? '테이블이 없어. docs/supabase/plannode_workspace.sql 을 실행해줘.'
                : error.message
          };
        }
        await pushProjectSlicesToOwners(bundle, userId);
        try {
          localStorage.setItem(OWN_WORKSPACE_REMOTE_TS_KEY, payload.updated_at);
        } catch {
          /* ignore */
        }
        clearPendingWorkspaceDeletions();
        markCloudWorkspaceSynced();
        return { ok: true, message: '클라우드에 올렸어 ✓' };
      }
      markCloudWorkspaceFailed();
      console.error('[plannode cloud upload] RPC', rpcError);
      return { ok: false, message: rpcError.message };
    }

    const res = rpcData as UpsertBundleRpcResult | null;
    if (res?.ok === false && res.reason === 'conflict') {
      lastConflict = true;
      if (attempt < MAX_ATTEMPTS - 1) continue;
      const { error: upErr } = await supabase.from(TABLE).upsert(payload, { onConflict: 'user_id' });
      if (upErr) {
        markCloudWorkspaceFailed();
        console.error('[plannode cloud upload] 충돌 후 폴백 upsert', upErr);
        return { ok: false, message: upErr.message };
      }
      await pushProjectSlicesToOwners(bundle, userId);
      try {
        localStorage.setItem(OWN_WORKSPACE_REMOTE_TS_KEY, payload.updated_at);
      } catch {
        /* ignore */
      }
      clearPendingWorkspaceDeletions();
      markCloudWorkspaceSynced();
      if (import.meta.env.DEV) {
        console.info('[uploadWorkspaceToCloud] 서버 타임스탬프 충돌 반복 → 무조건 upsert로 마무리했어.');
      }
      return { ok: true, message: '클라우드에 올렸어 ✓' };
    }

    if (!res?.ok) {
      markCloudWorkspaceFailed();
      return {
        ok: false,
        message: res?.reason === 'auth' ? '로그인 세션이 만료됐을 수 있어. 다시 로그인해줘.' : '클라우드 저장에 실패했어.'
      };
    }

    const serverTs = res.server_updated_at != null && String(res.server_updated_at) ? String(res.server_updated_at) : payload.updated_at;
    await pushProjectSlicesToOwners(bundle, userId);
    try {
      localStorage.setItem(OWN_WORKSPACE_REMOTE_TS_KEY, serverTs);
    } catch {
      /* ignore */
    }
    clearPendingWorkspaceDeletions();
    markCloudWorkspaceSynced();
    if (lastConflict && import.meta.env.DEV) {
      console.info('[uploadWorkspaceToCloud] 충돌 후 재병합·재시도로 저장 완료.');
    }
    return { ok: true, message: '클라우드에 올렸어 ✓' };
  }

  markCloudWorkspaceFailed();
  return { ok: false, message: '클라우드 저장 재시도 한도를 넘었어. 잠시 후 다시 시도해줘.' };
}

/** Supabase → 로컬 교체 후 첫 프로젝트 열기 */
export async function downloadWorkspaceFromCloud(): Promise<{ ok: boolean; message: string }> {
  if (!isSupabaseCloudConfigured()) {
    return { ok: false, message: 'Supabase URL/키가 .env에 없어.' };
  }
  const { userId, error: authErr } = await requireSessionUserId();
  if (!userId) return { ok: false, message: authErr || '로그인 실패' };

  const { data, error } = await supabase
    .from(TABLE)
    .select('projects_json, nodes_by_project_json, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (isWorkspaceMissingOrCacheError(error)) {
      if (import.meta.env.DEV) console.info('[plannode cloud download] 워크스페이스 테이블·스키마 설정 필요(PGRST205).');
      return { ok: false, message: WORKSPACE_SETUP_MSG };
    }
    console.error('[plannode cloud download]', error);
    return { ok: false, message: error.message };
  }
  if (!data) {
    return { ok: false, message: '클라우드에 저장된 데이터가 없어. 먼저 올려줘.' };
  }

  const bundle = normalizeBundle(data as { projects_json: unknown; nodes_by_project_json: unknown });
  if (!bundle) {
    return { ok: false, message: '클라우드 데이터 형식이 맞지 않아.' };
  }

  replaceWorkspaceFromBundle(bundle);
  const rowTs = (data as { updated_at?: string }).updated_at;
  if (typeof rowTs === 'string' && rowTs) {
    try {
      localStorage.setItem(OWN_WORKSPACE_REMOTE_TS_KEY, rowTs);
    } catch {
      /* ignore */
    }
  }
  if (bundle.projects.length > 0) {
    let opened = false;
    for (const p of bundle.projects) {
      const r = await trySelectProject(p);
      if (r.ok) {
        opened = true;
        break;
      }
    }
    if (!opened) {
      return {
        ok: true,
        message: '클라우드에서 받았어 ✓ (접근 허용된 프로젝트가 없어 자동으로 열지 못했어. 목록에서 선택해줘.)'
      };
    }
  }
  return { ok: true, message: '클라우드에서 받았어 ✓' };
}

/** 내 워크스페이스 행이 서버에서 바뀌었으면 프로젝트별 LWW로 로컬에 합침 */
export async function pullOwnWorkspaceIfChanged(): Promise<number> {
  if (typeof window === 'undefined' || !isSupabaseCloudConfigured()) return 0;
  const { userId } = await requireSessionUserId();
  if (!userId) return 0;

  const { data, error } = await supabase
    .from(TABLE)
    .select('updated_at, projects_json, nodes_by_project_json')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return 0;

  const remoteTs = String((data as { updated_at?: string }).updated_at ?? '');
  let prev = '';
  try {
    prev = localStorage.getItem(OWN_WORKSPACE_REMOTE_TS_KEY) ?? '';
  } catch {
    prev = '';
  }
  if (!remoteTs || prev === remoteTs) return 0;

  const bundle = normalizeBundle(data as { projects_json: unknown; nodes_by_project_json: unknown });
  if (!bundle) return 0;

  const n = mergeWorkspaceBundleFromCloudRemote(bundle);
  try {
    localStorage.setItem(OWN_WORKSPACE_REMOTE_TS_KEY, remoteTs);
  } catch {
    /* ignore */
  }
  return n;
}

/** 초대(공유) 프로젝트: 소유자 워크스페이스 슬라이스가 더 최신이면 로컬에 반영 */
export async function pullSharedProjectSlicesIfNewer(): Promise<number> {
  if (typeof window === 'undefined' || !isSupabaseCloudConfigured()) return 0;
  const uid = getAuthUserId();
  if (!uid) return 0;

  const parseTs = (iso: string | undefined): number => {
    const t = Date.parse(String(iso ?? ''));
    return Number.isFinite(t) ? t : 0;
  };

  let n = 0;
  const plist = get(projects);
  for (const local of plist) {
    const src = local.cloud_workspace_source_user_id;
    if (!src || src === uid) continue;

    const slice = await fetchProjectSliceFromCloud(src, local.id);
    if (!slice) continue;

    const rTime = parseTs(slice.project.updated_at);
    const lTime = parseTs(local.updated_at);
    /** 엄격히 초과할 때만 원격 슬라이스를 노드 LWW에 반영 — 같거나 로컬이 더 새면 로컬만 유지(소유자 merge 실패·옛 슬라이스) */
    const remoteMetaNewer = rTime > lTime;
    const localNodes = loadProjectNodesFromLocalStorage(local.id);
    const mergedNodes = remoteMetaNewer
      ? mergeNodeListsForCloud(localNodes, slice.nodes, true, local.id)
      : localNodes;
    const mergedProject = remoteMetaNewer
      ? { ...slice.project, cloud_workspace_source_user_id: src }
      : { ...local, cloud_workspace_source_user_id: src };

    const nodesChanged =
      projectWorkspaceNodesJsonSnapshot(mergedNodes) !== projectWorkspaceNodesJsonSnapshot(localNodes);
    const metaChanged =
      remoteMetaNewer &&
      (mergedProject.name !== local.name ||
        mergedProject.author !== local.author ||
        mergedProject.start_date !== local.start_date ||
        mergedProject.end_date !== local.end_date ||
        (mergedProject.description ?? '') !== (local.description ?? ''));
    const projectTsChanged =
      remoteMetaNewer && String(mergedProject.updated_at || '') !== String(local.updated_at || '');

    if (!nodesChanged && !metaChanged && !projectTsChanged) continue;

    captureNodeSnapshot(local.id, localNodes, 'pre_pull');
    upsertImportedPlannodeTreeV1(mergedProject, mergedNodes, {
      openAfter: false,
      markDirty: false,
      preserveRemoteUpdatedAt: remoteMetaNewer
    });
    n++;

    const cur = get(currentProject);
    if (cur?.id === local.id) {
      const ref = get(projects).find((p) => p.id === local.id);
      if (ref) selectProject(ref);
    }
  }
  return n;
}
