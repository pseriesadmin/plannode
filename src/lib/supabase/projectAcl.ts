import { supabase } from '$lib/supabase/client';
import type { Project, Node } from '$lib/supabase/client';
import { isSupabaseCloudConfigured } from '$lib/supabase/env';
import { getAuthEmail, getAuthEmailResolved, getAuthUserId } from '$lib/stores/authSession';
import { writable } from 'svelte/store';
import { selectProject, updateProjectMeta, upsertImportedPlannodeTreeV1 } from '$lib/stores/projects';
import { isMissingRelationError, userFacingAclErrorFromSupabase } from '$lib/supabase/aclErrors';
import { isPlatformMaster } from '$lib/supabase/platformMaster';
import { MAX_SHARED_COLLABORATORS } from '$lib/plannodeCollabLimits';

const TABLE = 'plannode_project_acl';

export function normalizeAclEmail(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase();
}

/** Supabase 미설정 시: 로컬만 쓰는 구버전 호환(접근 허용 검사 생략) */
export function isAclEnforced(): boolean {
  return isSupabaseCloudConfigured();
}

/** 행 개수. -2 = 테이블 없음·스키마 캐시(404·PGRST205), -1 = 기타 오류 */
export async function countAclRows(projectId: string): Promise<number> {
  if (!isAclEnforced()) return 0;
  const q = () =>
    supabase.from(TABLE).select('id', { count: 'exact', head: true }).eq('project_id', projectId);
  let { count, error } = await q();
  if (error && isMissingRelationError(error)) {
    await new Promise((r) => setTimeout(r, 700));
    ({ count, error } = await q());
  }
  if (error) {
    if (isMissingRelationError(error)) return -2;
    return -1;
  }
  return count ?? 0;
}

/** 소유자 제외 멤버 행 개수. -2 = 테이블 없음, -1 = 기타 오류 */
export async function countMemberAclRows(projectId: string): Promise<number> {
  if (!isAclEnforced()) return 0;
  const q = () =>
    supabase
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('is_owner', false);
  let { count, error } = await q();
  if (error && isMissingRelationError(error)) {
    await new Promise((r) => setTimeout(r, 700));
    ({ count, error } = await q());
  }
  if (error) {
    if (isMissingRelationError(error)) return -2;
    return -1;
  }
  return count ?? 0;
}

/**
 * 프로젝트 열기 권한: 소유자 uid 일치 / ACL에 이메일 등록 / 레거시(소유자·ACL 없음)는 로그인 사용자 전원 허용
 */
export async function canAccessProject(project: Project): Promise<boolean> {
  if (!isAclEnforced()) return true;
  const uid = getAuthUserId();
  const email = getAuthEmail();
  if (!uid || !email) return false;
  if (await isPlatformMaster()) return true;
  if (project.owner_user_id && project.owner_user_id === uid) return true;
  const n = await countAclRows(project.id);
  if (n === -2 || n === -1) return false;
  if (n === 0 && !project.owner_user_id) return true;
  const { data, error } = await supabase
    .from(TABLE)
    .select('id')
    .eq('project_id', project.id)
    .eq('email', email)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

/** ACL·테이블 존재 검사만 — 캔버스 열기는 `trySelectProject` */
export async function verifyProjectAccessForOpen(
  project: Project
): Promise<{ ok: boolean; message?: string }> {
  const n = await countAclRows(project.id);
  if (n === -2) {
    return {
      ok: false,
      message: userFacingAclErrorFromSupabase({
        code: 'PGRST205',
        message: "Could not find the table 'public.plannode_project_acl' in the schema cache"
      })
    };
  }
  const ok = await canAccessProject(project);
  if (!ok) {
    return {
      ok: false,
      message: '이 프로젝트에 접근할 권한이 없어. 소유자·플랫폼 마스터에게 이메일 등록을 요청해줘.'
    };
  }
  return { ok: true };
}

/** 선택 전 검사 후 selectProject — 레거시 첫 오픈 시 소유자 uid 로컬에 박지 않음(명시적 '소유자 등록'에서만) */
export async function trySelectProject(project: Project): Promise<{ ok: boolean; message?: string }> {
  const v = await verifyProjectAccessForOpen(project);
  if (!v.ok) return v;
  selectProject(project);
  return { ok: true };
}

export type AclRow = { email: string; is_owner: boolean };

/** 내 이메일로 초대된 프로젝트(클라우드 ACL 한 줄) */
export type AclInviteSummary = {
  project_id: string;
  workspace_source_user_id: string | null;
  is_owner: boolean;
};

/** 현재 로그인 이메일 기준 ACL 행(내가 접근 가능한 프로젝트 id·워크스페이스 소스) */
export async function fetchMyAclInviteSummaries(): Promise<{ rows: AclInviteSummary[]; error?: string }> {
  if (!isAclEnforced()) return { rows: [] };
  const email = getAuthEmail();
  if (!email) return { rows: [], error: '로그인이 필요해.' };
  const em = normalizeAclEmail(email);

  // 명시적으로 없는 컬럼을 select 하면 400 → '*' 는 «존재하는 컬럼만» 반환(옛·신 스키마 공통).
  const q = () => supabase.from(TABLE).select('*').eq('email', em);

  let { data, error } = await q();
  if (error && isMissingRelationError(error)) {
    await new Promise((r) => setTimeout(r, 700));
    ({ data, error } = await q());
  }
  if (error) {
    if (import.meta.env.DEV) {
      console.error('[fetchMyAclInviteSummaries] error:', error);
    }
    return { rows: [], error: userFacingAclErrorFromSupabase(error) };
  }

  const rows = (data ?? []).map((r) => ({
    project_id: String((r as { project_id?: string }).project_id ?? ''),
    workspace_source_user_id:
      ((r as { workspace_source_user_id?: string | null }).workspace_source_user_id as string | null) ?? null,
    is_owner: !!(r as { is_owner?: boolean }).is_owner
  }));

  return { rows: rows.filter((x) => x.project_id) };
}

/** ACL·소유자 판별용 최소 Project (로컬에 없는 id만 알 때) */
function aclStubProject(projectId: string): Project {
  const now = new Date().toISOString();
  return {
    id: projectId,
    name: '',
    author: '',
    start_date: '',
    end_date: '',
    created_at: now,
    updated_at: now
  };
}

function parseProjectFromJson(obj: unknown): Project | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const id = String(o.id ?? '');
  const name = String(o.name ?? '');
  const author = String(o.author ?? '');
  const start_date = String(o.start_date ?? '');
  const end_date = String(o.end_date ?? '');
  if (!id || !name) return null;
  const cw = o.cloud_workspace_source_user_id;
  return {
    id,
    name,
    author,
    start_date,
    end_date,
    description: o.description != null ? String(o.description) : undefined,
    owner_user_id: o.owner_user_id != null ? String(o.owner_user_id) : undefined,
    cloud_workspace_source_user_id:
      cw != null && String(cw).trim() ? String(cw).trim() : undefined,
    created_at: String(o.created_at ?? new Date().toISOString()),
    updated_at: String(o.updated_at ?? new Date().toISOString())
  };
}

/** RPC 슬라이스만 가져오기(동기화 루프·가져오기 공용) */
export async function fetchProjectSliceFromCloud(
  workspaceSourceUserId: string,
  projectId: string
): Promise<{ project: Project; nodes: Node[] } | null> {
  if (!isAclEnforced()) return null;
  if (!workspaceSourceUserId || !projectId) return null;
  const { data, error } = await supabase.rpc('plannode_workspace_fetch_project_slice', {
    p_workspace_user_id: workspaceSourceUserId,
    p_project_id: projectId
  });
  if (error || data == null) {
    if (import.meta.env.DEV && error) {
      console.warn('[fetchProjectSliceFromCloud]', projectId, error.message);
    }
    return null;
  }
  const bundle =
    typeof data === 'string'
      ? (JSON.parse(data) as { project?: unknown; nodes?: unknown })
      : (data as { project?: unknown; nodes?: unknown });
  if (!bundle?.project) return null;
  const project = parseProjectFromJson(bundle.project);
  const rawNodes = bundle.nodes;
  if (!project) return null;
  const nodes: Node[] = Array.isArray(rawNodes) ? (rawNodes as Node[]) : [];
  return { project, nodes };
}

export type ImportSharedProjectResult = {
  ok: boolean;
  message: string;
  /** 워크스페이스 RPC에 프로젝트 슬라이스가 없음(삭제·미동기·RLS 등) — 죽은 초대 정리에 사용 */
  sliceMissing?: boolean;
};

/**
 * 워크스페이스에 슬라이스가 없을 때: 멤버는 본인 ACL 행만 제거 · 내 워크스페이스 소유자 고스트 행이면 전체 ACL 삭제 시도
 * (RLS: docs/supabase/plannode_project_acl_delete_member_self_v1.sql 멤버 self-delete 필요)
 */
export async function pruneStaleInviteAfterSliceMissing(
  inv: AclInviteSummary
): Promise<{ outcome: 'pruned' | 'skipped'; message?: string }> {
  if (!isAclEnforced()) return { outcome: 'skipped' };

  if (!inv.is_owner) {
    const email = getAuthEmail();
    if (!email) return { outcome: 'skipped', message: '로그인이 필요해.' };
    const { data: deletedRows, error } = await supabase
      .from(TABLE)
      .delete()
      .eq('project_id', inv.project_id)
      .eq('is_owner', false)
      .eq('email', normalizeAclEmail(email))
      .select('id');
    if (error) {
      if (import.meta.env.DEV) {
        console.warn('[pruneStaleInviteAfterSliceMissing] member row delete:', error.message);
      }
      return { outcome: 'skipped', message: userFacingAclErrorFromSupabase(error) };
    }
    if (!deletedRows?.length) {
      return {
        outcome: 'skipped',
        message:
          '초대 행을 지우지 못했어. Supabase에서 docs/supabase/plannode_project_acl_delete_member_self_v1.sql 을 실행했는지 확인해줘.'
      };
    }
    return { outcome: 'pruned' };
  }

  const uid = getAuthUserId();
  if (!uid || inv.workspace_source_user_id !== uid) {
    return { outcome: 'skipped' };
  }

  const stub = aclStubProject(inv.project_id);
  const d = await deleteAllAclRowsForProjectIfOwner(stub);
  if (!d.ok) {
    if (import.meta.env.DEV) {
      console.warn('[pruneStaleInviteAfterSliceMissing] owner acl purge:', d.message);
    }
    return { outcome: 'skipped', message: d.message };
  }
  return { outcome: 'pruned' };
}

/** RPC: 소유자 워크스페이스에서 한 프로젝트만 가져와 로컬에 합침 후 ACL 통과 여부만 검사(캔버스 열기는 호출측) */
export async function importSharedProjectFromWorkspace(
  workspaceSourceUserId: string,
  projectId: string
): Promise<ImportSharedProjectResult> {
  if (!isAclEnforced()) return { ok: false, message: 'Supabase가 꺼져 있어.' };
  if (!workspaceSourceUserId || !projectId) {
    return { ok: false, message: '클라우드 소스 정보가 없어. 소유자가 접근 목록을 다시 저장한 뒤 시도해줘.' };
  }

  const email = getAuthEmail();
  if (import.meta.env.DEV) {
    console.info('[importSharedProjectFromWorkspace]', {
      workspaceSourceUserId,
      projectId,
      myEmail: email
    });
  }

  const slice = await fetchProjectSliceFromCloud(workspaceSourceUserId, projectId);
  if (!slice) {
    return {
      ok: false,
      sliceMissing: true,
      message:
        '프로젝트를 찾지 못했어. 소유자가 클라우드에 올렸는지, ACL에 네 이메일이 맞는지 확인해줘.'
    };
  }

  const projectWithSrc: Project = {
    ...slice.project,
    cloud_workspace_source_user_id: workspaceSourceUserId
  };
  const merged = upsertImportedPlannodeTreeV1(projectWithSrc, slice.nodes, { openAfter: false });
  if (!merged) return { ok: false, message: '로컬에 저장하지 못했어.' };
  const v = await verifyProjectAccessForOpen(merged);
  if (!v.ok) return { ok: false, message: v.message ?? '열 권한이 없어.' };
  return { ok: true, message: `불러왔어: ${merged.name}` };
}

/** 초대받은 프로젝트 자동 로드: 로컬에 없는 프로젝트를 클라우드에서 일괄 불러오기 */
export async function autoLoadInvitedProjects(
  localProjectIds?: string[]
): Promise<{
  loaded: number;
  skipped: number;
  /** 이미 로컬 목록에 있는 project_id (자동 가져오기 불필요) */
  skippedAlreadyLocal: number;
  /** ACL에 workspace_source_user_id 없음 — 소유자가 멤버 행 복구·☁ 동기 필요할 수 있음 */
  skippedNoWorkspaceSource: number;
  /** 슬라이스 없음 → 멤버 본인 행·고스트 소유자 ACL 정리 성공 건수 */
  prunedStaleInvites: number;
  errors: Array<{ projectId: string; message: string }>;
}> {
  const empty = {
    loaded: 0,
    skipped: 0,
    skippedAlreadyLocal: 0,
    skippedNoWorkspaceSource: 0,
    prunedStaleInvites: 0,
    errors: [] as Array<{ projectId: string; message: string }>
  };
  if (!isAclEnforced()) return empty;

  const { rows: acl, error: aclErr } = await fetchMyAclInviteSummaries();
  if (aclErr || !acl.length) return empty;

  const localIds = new Set(localProjectIds || []);

  let loaded = 0;
  let skippedAlreadyLocal = 0;
  let skippedNoWorkspaceSource = 0;
  let prunedStaleInvites = 0;
  const errors: Array<{ projectId: string; message: string }> = [];

  for (const inv of acl) {
    // 로컬에 이미 있으면 스킵
    if (localIds.has(inv.project_id)) {
      skippedAlreadyLocal++;
      continue;
    }

    if (!inv.workspace_source_user_id) {
      if (import.meta.env.DEV) {
        console.warn('[autoLoadInvitedProjects] skipping — no workspace_source_user_id:', {
          projectId: inv.project_id,
          isOwner: inv.is_owner
        });
      }
      skippedNoWorkspaceSource++;
      continue;
    }

    if (import.meta.env.DEV) {
      console.info('[autoLoadInvitedProjects] loading project:', {
        projectId: inv.project_id,
        workspaceSourceUserId: inv.workspace_source_user_id,
        isOwner: inv.is_owner
      });
    }

    const r = await importSharedProjectFromWorkspace(
      inv.workspace_source_user_id,
      inv.project_id
    );
    if (r.ok) {
      loaded++;
    } else if (r.sliceMissing) {
      const pr = await pruneStaleInviteAfterSliceMissing(inv);
      if (pr.outcome === 'pruned') {
        prunedStaleInvites++;
        if (import.meta.env.DEV) {
          console.info('[autoLoadInvitedProjects] pruned stale invite:', inv.project_id);
        }
      } else {
        const detail = pr.message ? ` (${pr.message})` : '';
        errors.push({ projectId: inv.project_id, message: `${r.message}${detail}` });
      }
    } else {
      errors.push({ projectId: inv.project_id, message: r.message });
    }
  }

  const skipped = skippedAlreadyLocal + skippedNoWorkspaceSource;

  return { loaded, skipped, skippedAlreadyLocal, skippedNoWorkspaceSource, prunedStaleInvites, errors };
}

export async function fetchProjectAcl(projectId: string): Promise<{ rows: AclRow[]; error?: string }> {
  if (!isAclEnforced()) return { rows: [] };
  const q = () =>
    supabase
      .from(TABLE)
      .select('email, is_owner')
      .eq('project_id', projectId);
  let { data, error } = await q();
  if (error && isMissingRelationError(error)) {
    await new Promise((r) => setTimeout(r, 700));
    ({ data, error } = await q());
  }
  if (error) return { rows: [], error: userFacingAclErrorFromSupabase(error) };
  const rows = (data ?? [])
    .map((r) => ({
      email: normalizeAclEmail(String((r as { email?: string }).email ?? '')),
      is_owner: !!(r as { is_owner?: boolean }).is_owner
    }))
    .sort((a, b) => (a.is_owner === b.is_owner ? 0 : a.is_owner ? -1 : 1));
  return { rows };
}

/** 프로젝트에 ACL 행이 없을 때: 현재 계정을 소유자로 등록 + 로컬 owner_user_id 설정 */
export async function claimProjectOwner(project: Project): Promise<{ ok: boolean; message: string }> {
  if (!isAclEnforced()) return { ok: false, message: 'Supabase가 설정되어 있지 않아.' };
  const email = getAuthEmail();
  const uid = getAuthUserId();
  if (!email || !uid) return { ok: false, message: '로그인이 필요해.' };
  if (project.owner_user_id && project.owner_user_id !== uid) {
    return { ok: false, message: '이미 다른 계정이 소유자로 지정되어 있어.' };
  }
  const n = await countAclRows(project.id);
  if (n > 0) return { ok: false, message: '이미 접근 목록이 있어. 소유자만 편집할 수 있어.' };
  const ins = () =>
    supabase.from(TABLE).insert({
      project_id: project.id,
      email,
      is_owner: true,
      workspace_source_user_id: uid
    });
  let { error } = await ins();
  if (error && isMissingRelationError(error)) {
    await new Promise((r) => setTimeout(r, 700));
    ({ error } = await ins());
  }
  if (error) {
    return { ok: false, message: userFacingAclErrorFromSupabase(error) };
  }
  updateProjectMeta(project.id, { owner_user_id: uid });
  return { ok: true, message: '소유자로 등록했어.' };
}

/** 새 프로젝트 생성 직후: 소유자 ACL 행 삽입(로컬 owner_user_id는 createProject에서 이미 설정) */
export async function ensureOwnerAclForNewProject(
  projectId: string,
  email: string
): Promise<{ ok: boolean; message?: string }> {
  if (!isAclEnforced()) return { ok: true };
  const em = normalizeAclEmail(email);
  const uid = getAuthUserId();
  const ins = () =>
    supabase.from(TABLE).insert({
      project_id: projectId,
      email: em,
      is_owner: true,
      ...(uid ? { workspace_source_user_id: uid } : {})
    });
  let { error } = await ins();
  if (error && isMissingRelationError(error)) {
    await new Promise((r) => setTimeout(r, 700));
    ({ error } = await ins());
  }
  if (error) {
    if (error.code === '23505') return { ok: true };
    return { ok: false, message: userFacingAclErrorFromSupabase(error) };
  }
  return { ok: true };
}

/**
 * 클라우드 사용 시: 내가 소유한 프로젝트에 소유자 ACL 행이 반드시 있게 함(생성·업로드·가져오기 공통).
 * 이메일은 스토어 실패 시 getUser()로 재해석.
 */
export async function ensureOwnerAclRowForMyProject(projectId: string): Promise<{ ok: boolean; message?: string }> {
  if (!isAclEnforced()) return { ok: true };
  const uid = getAuthUserId();
  if (!uid) return { ok: false, message: '로그인이 필요해.' };
  const email = await getAuthEmailResolved();
  if (!email) {
    return { ok: false, message: '계정 이메일을 확인할 수 없어. 이메일 로그인 후 다시 시도해줘.' };
  }

  const q = () =>
    supabase.from(TABLE).select('id').eq('project_id', projectId).eq('is_owner', true).limit(1).maybeSingle();
  let { data: ownerEx, error: selErr } = await q();
  if (selErr && isMissingRelationError(selErr)) {
    await new Promise((r) => setTimeout(r, 600));
    ({ data: ownerEx, error: selErr } = await q());
  }
  if (selErr) return { ok: false, message: userFacingAclErrorFromSupabase(selErr) };
  if (ownerEx) {
    updateProjectMeta(projectId, { owner_user_id: uid });
    return { ok: true };
  }

  let last: { ok: boolean; message?: string } = { ok: false, message: '소유자 ACL 저장에 실패했어.' };
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 350 * attempt));
    const r = await ensureOwnerAclForNewProject(projectId, email);
    if (r.ok) {
      updateProjectMeta(projectId, { owner_user_id: uid });
      return { ok: true };
    }
    last = r;
  }
  return last;
}

/** 한 세션에서 RPC 404 확인 후 불필요한 네트워크 반복 방지(RPC 배포 후에는 새로고침) */
let skipRpcRepairProjectSources = false;

function isRpcNotAvailableError(err: { message?: string; code?: string; details?: string } | null): boolean {
  if (!err) return false;
  const m = (String(err.message ?? '') + ' ' + String(err.details ?? '')).toLowerCase();
  const c = String(err.code ?? '');
  return (
    c === 'PGRST202' ||
    c === 'PGRST301' ||
    /\b404\b/.test(m) ||
    m.includes('not found') ||
    m.includes('requested resource') ||
    m.includes('could not find') ||
    /function public\.plannode_project_acl_repair_project_sources/i.test(String(err.message ?? ''))
  );
}

/** RPC 없을 때: UPDATE RLS(plannode_project_acl_update_policy.sql)가 있으면 소유자 세션으로 멤버 workspace 채움 */
async function repairWorkspaceSourcesViaOwnerUpdates(
  projectId: string
): Promise<{ ok: boolean; fixed?: number; message?: string }> {
  const uid = getAuthUserId();
  const myEmail = (await getAuthEmailResolved()) ?? getAuthEmail();
  if (!uid || !myEmail) return { ok: false, message: '로그인이 필요해.' };

  const { data: rows, error: selErr } = await supabase
    .from(TABLE)
    .select('email, is_owner, workspace_source_user_id')
    .eq('project_id', projectId);

  if (selErr) {
    return { ok: false, message: userFacingAclErrorFromSupabase(selErr) };
  }

  let list = (rows ?? []) as Array<{ email?: string; is_owner?: boolean; workspace_source_user_id?: string | null }>;
  let ownerRow = list.find((r) => r.is_owner);

  if (!ownerRow) {
    const n = await countAclRows(projectId);
    if (n === -2 || n === -1) {
      return { ok: false, message: 'ACL 테이블을 불러올 수 없어. Supabase SQL 적용 여부를 확인해줘.' };
    }
    if (n === 0) {
      const insAcl = await ensureOwnerAclForNewProject(projectId, myEmail);
      if (!insAcl.ok) {
        return { ok: false, message: insAcl.message ?? '소유자 ACL을 만들 수 없어.' };
      }
      updateProjectMeta(projectId, { owner_user_id: uid });
      const refetch = await supabase
        .from(TABLE)
        .select('email, is_owner, workspace_source_user_id')
        .eq('project_id', projectId);
      if (refetch.error) {
        return { ok: false, message: userFacingAclErrorFromSupabase(refetch.error) };
      }
      list = (refetch.data ?? []) as Array<{
        email?: string;
        is_owner?: boolean;
        workspace_source_user_id?: string | null;
      }>;
      ownerRow = list.find((r) => r.is_owner);
      if (!ownerRow) {
        return { ok: false, message: '소유자 ACL을 만든 뒤에도 조회되지 않아. 새로고침해줘.' };
      }
    } else {
      return {
        ok: false,
        message:
          'ACL에 소유자 행이 없어. 접근 모달에서 「내 계정을 소유자로 등록」을 하거나, 멤버만 있는 비정상 행을 DB에서 정리해줘.'
      };
    }
  }
  const ownerEm = normalizeAclEmail(String(ownerRow.email ?? ''));
  if (ownerEm !== normalizeAclEmail(myEmail)) {
    return { ok: false, message: '이 프로젝트의 소유자만 복구할 수 있어.' };
  }

  let ws = ownerRow.workspace_source_user_id ?? null;
  let fixed = 0;

  if (!ws) {
    const { error: upOwner } = await supabase
      .from(TABLE)
      .update({ workspace_source_user_id: uid })
      .eq('project_id', projectId)
      .eq('is_owner', true)
      .eq('email', ownerEm);
    if (upOwner) {
      const um = String(upOwner.message ?? '');
      if (/403|permission|policy|rls/i.test(um)) {
        return {
          ok: false,
          message:
            'ACL 수정이 막혀 있어. Supabase에서 docs/supabase/plannode_project_acl_update_policy.sql 을 실행한 뒤 새로고침해줘.'
        };
      }
      return { ok: false, message: userFacingAclErrorFromSupabase(upOwner) };
    }
    ws = uid;
    fixed += 1;
  }

  for (const r of list) {
    if (r.is_owner) continue;
    const em = normalizeAclEmail(String(r.email ?? ''));
    const curWs = r.workspace_source_user_id ?? null;
    if (curWs === ws) continue;
    const { error: upMem } = await supabase
      .from(TABLE)
      .update({ workspace_source_user_id: ws })
      .eq('project_id', projectId)
      .eq('email', em)
      .eq('is_owner', false);
    if (!upMem) fixed += 1;
    else {
      const um = String(upMem.message ?? '');
      if (/403|permission|policy|rls/i.test(um)) {
        return {
          ok: false,
          message:
            '멤버 행 수정이 막혀 있어. Supabase에서 docs/supabase/plannode_project_acl_update_policy.sql 을 실행한 뒤 새로고침해줘.'
        };
      }
      return { ok: false, message: userFacingAclErrorFromSupabase(upMem) };
    }
  }

  return { ok: true, fixed };
}

/**
 * 소유자: 해당 프로젝트 ACL의 workspace_source_user_id 정리.
 * ① RPC(plannode_project_acl_repair_project_sources_rpc.sql) 우선
 * ② 없으면 UPDATE 폴백(plannode_project_acl_update_policy.sql 또는 plannode_project_acl.sql 재실행)
 */
export async function repairProjectAclWorkspaceSources(
  projectId: string
): Promise<{ ok: boolean; fixed?: number; message?: string }> {
  if (!isAclEnforced()) return { ok: true, fixed: 0 };

  if (!skipRpcRepairProjectSources) {
    const { data, error } = await supabase.rpc('plannode_project_acl_repair_project_sources', {
      p_project_id: projectId
    });
    if (!error) {
      const n = typeof data === 'number' ? data : Number(data);
      return { ok: true, fixed: Number.isFinite(n) ? n : 0 };
    }
    if (isRpcNotAvailableError(error)) {
      skipRpcRepairProjectSources = true;
      if (import.meta.env.DEV) {
        console.info(
          '[repairProjectAclWorkspaceSources] RPC 미배포(404) — 이후 이 세션에서는 UPDATE 폴백만 사용. RPC 쓰려면 SQL 실행 후 새로고침.'
        );
      }
    } else {
      const msg = String(error.message ?? '');
      if (error.code === '42501' || /not project owner/i.test(msg)) {
        return { ok: false, message: '이 프로젝트의 소유자 ACL 행과 로그인 이메일이 일치하지 않아.' };
      }
      return { ok: false, message: userFacingAclErrorFromSupabase(error) };
    }
  }

  return await repairWorkspaceSourcesViaOwnerUpdates(projectId);
}

let lastRepairAuthUid: string | null = null;
const repairedProjectSourceIds = new Set<string>();

/** 로컬에서 owner_user_id가 본인인 프로젝트마다 ACL workspace 소스 한 번씩 복구 */
export async function repairOwnedProjectsAclWorkspaceSources(
  projectList: Array<{ id: string; owner_user_id?: string }>,
  authUserId: string | null
): Promise<{ repaired: number; rpcMissing: boolean }> {
  if (!isAclEnforced() || !authUserId || !projectList.length) return { repaired: 0, rpcMissing: false };
  const owned = projectList.filter((p) => p.owner_user_id === authUserId);
  if (!owned.length) return { repaired: 0, rpcMissing: false };

  if (lastRepairAuthUid !== authUserId) {
    lastRepairAuthUid = authUserId;
    repairedProjectSourceIds.clear();
  }
  let repaired = 0;
  let rpcMissing = false;
  for (const p of owned) {
    if (repairedProjectSourceIds.has(p.id)) continue;
    repairedProjectSourceIds.add(p.id);
    const ens = await ensureOwnerAclRowForMyProject(p.id);
    if (!ens.ok && import.meta.env.DEV) {
      console.warn('[repairOwnedProjectsAclWorkspaceSources] 소유자 ACL 보장 실패', p.id, ens.message);
    }
    const r = await repairProjectAclWorkspaceSources(p.id);
    if (!r.ok) {
      if (
        r.message?.includes('RPC가 아직') ||
        r.message?.includes('plannode_project_acl_update_policy') ||
        r.message?.includes('ACL 수정이 막혀') ||
        r.message?.includes('멤버 행 수정이 막혀')
      ) {
        rpcMissing = true;
      }
      if (import.meta.env.DEV) console.warn('[repairOwnedProjectsAclWorkspaceSources]', p.id, r.message);
      continue;
    }
    if ((r.fixed ?? 0) > 0) repaired += r.fixed ?? 0;
  }
  return { repaired, rpcMissing };
}

export async function addAllowedEmail(
  projectId: string,
  rawEmail: string
): Promise<{ ok: boolean; message: string }> {
  if (!isAclEnforced()) return { ok: false, message: 'Supabase가 꺼져 있어.' };
  const email = normalizeAclEmail(rawEmail);
  if (!email || !email.includes('@')) return { ok: false, message: '올바른 이메일을 입력해줘.' };
  const uid = getAuthUserId();
  if (!uid) return { ok: false, message: '로그인이 필요해.' };

  const memberCount = await countMemberAclRows(projectId);
  if (memberCount >= 0 && memberCount >= MAX_SHARED_COLLABORATORS) {
    return {
      ok: false,
      message: `공유 멤버는 최대 ${MAX_SHARED_COLLABORATORS}명까지 등록할 수 있어. 불필요한 이메일을 제거한 뒤 다시 초대해줘.`
    };
  }

  /** 멤버 행의 워크스페이스 소스: 소유자가 추가할 때는 본인 uid(트리거가 소유자 행의 null을 복사하는 경우 방지). */
  let workspaceSourceUserId: string | undefined;
  if (await isPlatformMaster()) {
    const { data: ownerRow } = await supabase
      .from(TABLE)
      .select('workspace_source_user_id')
      .eq('project_id', projectId)
      .eq('is_owner', true)
      .maybeSingle();
    const w = (ownerRow as { workspace_source_user_id?: string | null } | null)?.workspace_source_user_id;
    if (w) workspaceSourceUserId = w;
  } else {
    workspaceSourceUserId = uid;
  }
  
  const ins = () =>
    supabase.from(TABLE).insert({
      project_id: projectId,
      email,
      is_owner: false,
      ...(workspaceSourceUserId ? { workspace_source_user_id: workspaceSourceUserId } : {})
    });
  let { error } = await ins();
  if (error && isMissingRelationError(error)) {
    await new Promise((r) => setTimeout(r, 700));
    ({ error } = await ins());
  }
  if (error) {
    if (error.code === '23505') return { ok: false, message: '이미 등록된 이메일이야.' };
    const em = String(error.message ?? '');
    if (error.code === '23514' && /최대 5명|공유 멤버/.test(em)) {
      return {
        ok: false,
        message: `공유 멤버는 최대 ${MAX_SHARED_COLLABORATORS}명까지 등록할 수 있어. 불필요한 이메일을 제거한 뒤 다시 초대해줘.`
      };
    }
    return { ok: false, message: userFacingAclErrorFromSupabase(error) };
  }

  void repairProjectAclWorkspaceSources(projectId);

  const { scheduleCloudFlush } = await import('$lib/supabase/workspacePush');
  scheduleCloudFlush('add-acl', 100);

  return { ok: true, message: '추가했어.' };
}

export async function removeAclEmail(
  projectId: string,
  email: string,
  isOwnerRow: boolean
): Promise<{ ok: boolean; message: string }> {
  if (!isAclEnforced()) return { ok: false, message: 'Supabase가 꺼져 있어.' };
  if (isOwnerRow) {
    const { rows } = await fetchProjectAcl(projectId);
    const owners = rows.filter((r) => r.is_owner);
    if (owners.length <= 1) return { ok: false, message: '마지막 소유자 행은 지울 수 없어.' };
  }
  const { error } = await supabase.from(TABLE).delete().eq('project_id', projectId).eq('email', normalizeAclEmail(email));
  if (error) {
    return { ok: false, message: userFacingAclErrorFromSupabase(error) };
  }
  return { ok: true, message: '제거했어.' };
}

/** 소유자 여부(로컬 owner_user_id 또는 ACL 소유자 행) */
export async function isCurrentUserProjectOwner(project: Project): Promise<boolean> {
  const uid = getAuthUserId();
  const email = getAuthEmail();
  if (!uid || !email) return false;
  if (await isPlatformMaster()) return true;
  if (project.owner_user_id && project.owner_user_id === uid) return true;
  const { data } = await supabase
    .from(TABLE)
    .select('is_owner')
    .eq('project_id', project.id)
    .eq('email', email)
    .maybeSingle();
  return !!(data as { is_owner?: boolean } | null)?.is_owner;
}

/** 소유자 세션만: 해당 프로젝트의 ACL 행 전부 삭제(RLS). 클라우드 미설정 시 no-op 성공. */
export async function deleteAllAclRowsForProjectIfOwner(
  project: Project
): Promise<{ ok: boolean; message?: string }> {
  if (!isAclEnforced()) return { ok: true };
  if (!(await isCurrentUserProjectOwner(project))) {
    return { ok: false, message: '소유자만 이 프로젝트의 접근 정보를 완전히 지울 수 있어.' };
  }
  const { error } = await supabase.from(TABLE).delete().eq('project_id', project.id);
  if (error) {
    return { ok: false, message: userFacingAclErrorFromSupabase(error) };
  }
  return { ok: true };
}

/** ACL 편집(소유자 등록·멤버 추가): 플랫폼 마스터 | 소유자 | 레거시(소유자·목록 없음) 첫 등록 */
export async function canManageProjectAcl(project: Project): Promise<boolean> {
  if (!isAclEnforced()) return false;
  const uid = getAuthUserId();
  if (!uid) return false;
  if (await isPlatformMaster()) return true;
  if (project.owner_user_id && project.owner_user_id === uid) return true;
  const n = await countAclRows(project.id);
  if (n === -2) return true;
  if (n === 0 && !project.owner_user_id) return true;
  return await isCurrentUserProjectOwner(project);
}

export const showAclModal = writable(false);
export const aclModalProject = writable<Project | null>(null);

export function openAclModal(project: Project): void {
  aclModalProject.set(project);
  showAclModal.set(true);
}

export function closeAclModal(): void {
  showAclModal.set(false);
  aclModalProject.set(null);
}
