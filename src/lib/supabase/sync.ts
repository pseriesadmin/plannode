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

type UpsertBundleRpcResult = {
  ok?: boolean;
  reason?: string;
  server_updated_at?: string | null;
};

async function pushProjectSlicesToOwners(bundle: WorkspaceBundle, userId: string): Promise<void> {
  for (const p of bundle.projects) {
    const src = p.cloud_workspace_source_user_id;
    if (!src || src === userId) continue;
    const nodes = bundle.nodesByProject[p.id] ?? [];
    const { cloud_workspace_source_user_id: _cw, ...meta } = p;
    const { error: mErr } = await supabase.rpc('plannode_workspace_merge_project_slice', {
      p_workspace_user_id: src,
      p_project_id: p.id,
      p_project: meta,
      p_nodes: nodes
    });
    if (mErr && import.meta.env.DEV) {
      console.warn(
        '[uploadWorkspaceToCloud] 소유자 워크스페이스에 공유 프로젝트 반영 실패(merge RPC 미설치·RLS 등):',
        p.id,
        mErr.message
      );
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
    const remoteMetaNewer = rTime > lTime;
    const localNodes = loadProjectNodesFromLocalStorage(local.id);
    const mergedNodes = mergeNodeListsForCloud(localNodes, slice.nodes, remoteMetaNewer);
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
