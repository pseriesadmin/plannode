<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { get } from 'svelte/store';
  import {
    projects,
    currentProject,
    nodes,
    activeView,
    showProjectModal,
    createProject,
    upsertImportedPlannodeTreeV1,
    updateProjectMeta,
    updateProjectFields,
    updateProjectPrdSectionDraft,
    deleteProject,
    registerPendingWorkspaceDeletion,
    getPendingWorkspaceDeletionIds,
    mergeModalListCloudCanon,
    captureLogoutSessionSnapshot,
    clearSessionProjectSelectionForLogout,
    readLogoutSessionSnapshotV1,
    clearLogoutSessionSnapshot,
    extractProjectSliceFromBundle,
    mergeWorkspaceBundleFromCloudRemote,
    loadProjectNodesFromLocalStorage,
    projectWorkspaceNodesJsonSnapshot,
    replaceProjectNodesFromHistory
  } from '$lib/stores/projects';
  import type { LogoutSessionSnapshotV1 } from '$lib/stores/projects';
  import {
    captureNodeSnapshot,
    listNodeSnapshots,
    summarizeNodeDiff,
    type StoredNodeSnapshot
  } from '$lib/stores/nodeSnapshotHistory';
  import {
    parsePlannodeTreeV1ImportText,
    type ParsePlannodeTreeV1Result,
    PLANNODE_TREE_IMPORT_BJI_ARIA_LABEL,
    PLANNODE_TREE_IMPORT_BJI_TITLE
  } from '$lib/plannodeTreeV1';
  import { extractAndParseTree } from '$lib/ai/agendaResponseParser';
  import { extractDocxPlainTextFromFile } from '$lib/docxPlainText';
  import {
    outlinePlainTextToPlannodeTreeV1,
    parseMarkdownFileForProjectImport
  } from '$lib/outlineToPlannodeTreeV1';
  import { supabase, type Project, type Node } from '$lib/supabase/client';
  import {
    isSupabaseCloudConfigured,
    fetchOwnWorkspaceProjectMetasForModal,
    fetchOwnWorkspaceBundleFresh,
    mergeSharedProjectSliceFromCloudIfApplicable
  } from '$lib/supabase/sync';
  import { flushCloudWorkspaceNow, scheduleCloudFlush } from '$lib/supabase/workspacePush';
  import { startCloudBackgroundSync, stopCloudBackgroundSync } from '$lib/supabase/cloudBackgroundSync';
  import { cloudSyncBadge } from '$lib/stores/workspaceDirty';
  import {
    canAccessProject,
    isAclEnforced,
    trySelectProject,
    ensureOwnerAclRowForMyProject,
    repairOwnedProjectsAclWorkspaceSources,
    openAclModal,
    closeAclModal,
    showAclModal,
    aclModalProject,
    fetchMyAclInviteSummaries,
    importSharedProjectFromWorkspace,
    pruneStaleInviteAfterSliceMissing,
    autoLoadInvitedProjects,
    fetchProjectAcl,
    fetchProjectSliceFromCloud,
    isCurrentUserProjectOwner,
    deleteAllAclRowsForProjectIfOwner,
    type AclInviteSummary
  } from '$lib/supabase/projectAcl';
  import {
    subscribeProjectPresence,
    unsubscribeProjectPresence,
    projectPresencePeers,
    projectPresencePeersOverflow,
    projectPresenceSelectedEmail,
    toggleProjectPresencePeerEmail,
    updateMySelectedNode,
    type ProjectPresencePeer
  } from '$lib/supabase/projectPresence';
  import { getAuthUserId, getAuthEmail, signOutEverywhere, authUser, authLoading, authSession } from '$lib/stores/authSession';
  import ProjectAclModal from '$lib/components/ProjectAclModal.svelte';
  import BadgeImportMappingOverlay from '$lib/components/BadgeImportMappingOverlay.svelte';
  import StandardBadgePoolModal from '$lib/components/StandardBadgePoolModal.svelte';
  import IAExportMenu from '$lib/components/IAExportMenu.svelte';
  import IAGridSheet from '$lib/components/IAGridSheet.svelte';
  import {
    mountPilotBridge,
    pilotSetActiveView,
    pilotRefreshPrdView,
    pilotCopyPrdL1CoreSummaryPrompt,
    pilotExportSpecSheetCsv,
    pilotFlushPersistNow,
    pilotHasPendingGridPersist,
    dismissPilotRelinkGuide,
    pilotSetNodeMapLayout
  } from '$lib/pilot/pilotBridge';
  import { pendingIaExportIntent } from '$lib/stores/iaExportIntent';
  import type { IAExportIntent } from '$lib/ai/iaExportRunner';
  import { slugExportName } from '$lib/ai/iaGridCsvExport';
  import type { PageData } from './$types';
  import { PRD_SECTION_KEYS, getPrdAutoSections, type PrdSectionKey } from '$lib/prdStandardV20';
  import { plannodeUpdateLogNewestFirst } from '$lib/plannodeUpdateLog';

  /** SvelteKit이 주입 — 미선언 시 콘솔 "unknown prop" 경고 */
  export let data: PageData;
  export let params: Record<string, string> = {};

  let projectName = '';
  let projectAuthor = '';
  let projectStart = '';
  let projectEnd = '';
  let projectDesc = '';
  /** 프로젝트 생성(+선택적 AI 트리) 처리 중 — 중복 클릭 방지 */
  let projectCreateBusy = false;

  /** 프로젝트 관리 모달 안 — 표준 배지 풀(localStorage) */
  let showBadgePoolModal = false;

  /** 서버 `resolveAnthropicApiKey.ts`의 `PLANNODE_USER_ANTHROPIC_KEY_HEADER`와 동일해야 함 */
  const PLANNODE_USER_ANTHROPIC_KEY_HEADER = 'x-plannode-user-anthropic-key';
  const LS_USER_ANTHROPIC_KEY = 'plannode_user_anthropic_key_v1';

  /** NOW-37: Anthropic 키 BYOK(브라우저) — 중첩 모달 */
  let showModelApiModal = false;
  let modelApiKeyDraft = '';
  let hasStoredAnthropicKey = false;

  function readStoredUserAnthropicKey(): string {
    if (typeof localStorage === 'undefined') return '';
    return String(localStorage.getItem(LS_USER_ANTHROPIC_KEY) ?? '').trim();
  }

  function openModelApiModal() {
    if (typeof localStorage !== 'undefined') {
      hasStoredAnthropicKey = readStoredUserAnthropicKey().length > 0;
    } else {
      hasStoredAnthropicKey = false;
    }
    modelApiKeyDraft = '';
    showModelApiModal = true;
  }

  function saveModelApiKey() {
    const v = modelApiKeyDraft.trim();
    if (!v) {
      showPilotToast('키를 입력해줘.');
      return;
    }
    try {
      localStorage.setItem(LS_USER_ANTHROPIC_KEY, v);
    } catch {
      showPilotToast('저장에 실패했어. 브라우저 저장 공간을 확인해줘.');
      return;
    }
    modelApiKeyDraft = '';
    hasStoredAnthropicKey = true;
    showPilotToast('저장했어. AI 트리·AI 탭 요청에 반영돼.');
  }

  function clearModelApiKey() {
    try {
      localStorage.removeItem(LS_USER_ANTHROPIC_KEY);
    } catch {
      /* ignore */
    }
    modelApiKeyDraft = '';
    hasStoredAnthropicKey = false;
    showPilotToast('브라우저에 저장된 키를 지웠어.');
  }

  /** 가져오기 직후 upsertImportedPlannodeTreeV1(배지 sanitize·학습 병합) 동안 짧게 표시 */
  let showBadgeImportMappingOverlay = false;
  const BADGE_IMPORT_OVERLAY_MIN_MS = 260;

  /** #BJI 실패 시 프로젝트 모달 안 인라인 안내(GATE B IMPORT UX) */
  let projectImportError = '';

  /** 로컬 노드 스냅샷 히스토리(협업 경량 · PRD M3 F3-3) */
  let showSnapshotHistoryModal = false;
  let snapshotListVersion = 0;

  /** M2-UPDATE-CHANGELOG: Plannode 릴리스 노트 모달 */
  let showPlannodeUpdateModal = false;
  let updateLogOpenId: string | null = null;

  $: updateLogRows = plannodeUpdateLogNewestFirst();

  function openPlannodeUpdateModal() {
    updateLogOpenId = null;
    showPlannodeUpdateModal = true;
  }

  function closePlannodeUpdateModal() {
    showPlannodeUpdateModal = false;
    updateLogOpenId = null;
  }

  function toggleUpdateLogAccordion(id: string) {
    updateLogOpenId = updateLogOpenId === id ? null : id;
  }

  $: snapshotRows = (() => {
    snapshotListVersion;
    return $currentProject ? [...listNodeSnapshots($currentProject.id)].reverse() : [];
  })();

  /** 로그아웃 스냅과 불일치해 연 직후: 최신(병합) 트리 ↔ 로그아웃 직전 트리 전환 (모달 없음) */
  let postLogoutOpenPair: {
    projectId: string;
    logoutNodes: Node[];
    latestNodes: Node[];
    atLatest: boolean;
  } | null = null;

  $: if (postLogoutOpenPair && $currentProject && $currentProject.id !== postLogoutOpenPair.projectId) {
    postLogoutOpenPair = null;
  }

  function projectInLogoutSnapshot(snap: LogoutSessionSnapshotV1, projectId: string): boolean {
    if (snap.bundle.projects.some((p) => p.id === projectId)) return true;
    return Object.prototype.hasOwnProperty.call(snap.bundle.nodesByProject, projectId);
  }

  function refreshSnapshotList() {
    snapshotListVersion++;
  }

  function onManualNodeSnapshot() {
    if (!$currentProject) return;
    const ok = captureNodeSnapshot($currentProject.id, get(nodes), 'manual');
    if (ok) {
      refreshSnapshotList();
      showPilotToast('지금 트리 상태를 히스토리에 남겼어.');
    } else {
      showPilotToast('히스토리 저장에 실패했어. 노드 수·용량을 줄이거나 잠시 후 다시 시도해줘.');
    }
  }

  function snapshotDiffLine(s: StoredNodeSnapshot): string {
    if (!$currentProject) return '—';
    const cur = get(nodes);
    const d = summarizeNodeDiff(s.nodes, cur);
    return `추가 ${d.added} · 삭제 ${d.removed} · 변경 ${d.changed} (스냅샷 시점 대비 현재)`;
  }

  function formatSnapshotReason(r: StoredNodeSnapshot['reason']): string {
    if (r === 'presence_peer') return '동시 접속';
    if (r === 'pre_pull') return '클라우드·병합 반영 직전';
    if (r === 'import') return '파일 가져오기·AI 덮어쓰기 직전';
    return '수동';
  }

  async function restoreSnapshotToWorkspace(s: StoredNodeSnapshot) {
    const p = $currentProject;
    if (!p) return;
    if (
      !confirm(
        '이 스냅샷 시점의 노드 트리로 바꿀까요? (상단 되돌리기·Ctrl+Z는 캔버스 편집만 되돌립니다. 기능명세 그리드 미저장분은 먼저 반영해 주세요.)'
      )
    ) {
      return;
    }
    pilotFlushPersistNow();
    const pid = p.id;
    const list = JSON.parse(JSON.stringify(s.nodes)) as Node[];
    for (const n of list) {
      if (n && typeof n === 'object') n.project_id = n.project_id ?? pid;
    }
    const ok = replaceProjectNodesFromHistory(pid, list);
    if (ok) {
      refreshSnapshotList();
      await tick();
      pilotRefreshPrdView();
      showPilotToast('워크스페이스 스냅샷으로 되돌렸어.');
      showSnapshotHistoryModal = false;
    } else {
      showPilotToast('되돌리기에 실패했어.');
    }
  }
  const PRD_BLOCKS: { key: PrdSectionKey; title: string; hint: string }[] = [
    {
      key: 's1',
      title: '1. 핵심 PRD 요약 (표준 가이드 v2.0)',
      hint: '개요·가치·시나리오·지표·속성. 마크다운을 직접 고치면 자동 저장되며, PRD 다운로드(BPR)에 반영돼요. 「노드 초안」은 해당 칸만 노드·프로젝트 메타에서 다시 뽑은 글로 되돌려요.'
    },
    {
      key: 's2',
      title: '2. 기능명세 (Feature Specification)',
      hint: '가이드 v2.0 — 트리·배지·기능 블록 마크다운. 편집·되돌림은 위와 같아요.'
    },
    {
      key: 's3',
      title: '3. 아키텍처 & 기술 정책',
      hint: '가이드 v2.0 §2'
    },
    {
      key: 's4',
      title: '4. 수용기준 & 비기능 요구사항',
      hint: '가이드 v2.0 §3'
    },
    {
      key: 's5',
      title: '5. 로드맵·위험 (v2.0 §4·§5)',
      hint: '로드맵 & 우선순위 + 위험 요소 & 완화 전략 (한 패널)'
    }
  ];

  let prdText: Record<PrdSectionKey, string> = { s1: '', s2: '', s3: '', s4: '', s5: '' };
  let lastPrdProjectId = '';

  $: prdAuto = $currentProject ? getPrdAutoSections($currentProject, $nodes) : null;

  $: if ($currentProject && prdAuto) {
    const pid = $currentProject.id;
    const drafts = $currentProject.prd_section_drafts;
    if (pid !== lastPrdProjectId) {
      lastPrdProjectId = pid;
      prdText = {
        s1: drafts?.s1?.trim() ? drafts.s1 : prdAuto.sections.s1,
        s2: drafts?.s2?.trim() ? drafts.s2 : prdAuto.sections.s2,
        s3: drafts?.s3?.trim() ? drafts.s3 : prdAuto.sections.s3,
        s4: drafts?.s4?.trim() ? drafts.s4 : prdAuto.sections.s4,
        s5: drafts?.s5?.trim() ? drafts.s5 : prdAuto.sections.s5
      };
    } else {
      const next = { ...prdText };
      let changed = false;
      for (const k of PRD_SECTION_KEYS) {
        const d = drafts?.[k];
        if ((d == null || String(d).trim() === '') && next[k] !== prdAuto.sections[k]) {
          next[k] = prdAuto.sections[k];
          changed = true;
        }
      }
      if (changed) prdText = next;
    }
  } else if (!$currentProject) {
    lastPrdProjectId = '';
    prdText = { s1: '', s2: '', s3: '', s4: '', s5: '' };
  }

  const prdDraftSaveTimers: Partial<Record<PrdSectionKey, ReturnType<typeof setTimeout>>> = {};

  function schedulePrdDraftSave(sec: PrdSectionKey) {
    const prev = prdDraftSaveTimers[sec];
    if (prev != null) clearTimeout(prev);
    prdDraftSaveTimers[sec] = setTimeout(() => {
      prdDraftSaveTimers[sec] = undefined;
      const p = get(currentProject);
      if (!p) return;
      const raw = prdText[sec];
      updateProjectPrdSectionDraft(p.id, sec, raw.trim() === '' ? null : raw);
    }, 450);
  }

  function revertPrdSectionDraft(sec: PrdSectionKey) {
    const p = get(currentProject);
    if (!p || !prdAuto) return;
    updateProjectPrdSectionDraft(p.id, sec, null);
    prdText = { ...prdText, [sec]: prdAuto.sections[sec] };
  }

  function disposePrdDraftTimers() {
    for (const k of PRD_SECTION_KEYS) {
      const t = prdDraftSaveTimers[k];
      if (t != null) clearTimeout(t);
      delete prdDraftSaveTimers[k];
    }
  }

  /** 프로젝트 모달: 다음 생성 시 적용할 배치만(파일럿 즉시 변경 안 함) */
  let nodeMapLayoutDefaultForCreate: 'right' | 'topdown' = 'right';

  let pilotReady = false;
  let jsonImportInput: HTMLInputElement;

  const cloudSyncAvailable = isSupabaseCloudConfigured();

  /** 새 프로젝트 생성 시에만 캔버스에 적용할 노드맵 배치(캔버스 열린 프로젝트와 무관) */
  const LS_NODE_MAP_NEW_PROJECT = 'plannode.nodeMapLayoutNewProjectDefault';
  function readNodeMapLayoutCreateDefault(): 'right' | 'topdown' {
    if (typeof localStorage === 'undefined') return 'right';
    try {
      const v = localStorage.getItem(LS_NODE_MAP_NEW_PROJECT);
      if (v === 'topdown' || v === 'right') return v;
    } catch (_) {}
    return 'right';
  }
  function writeNodeMapLayoutCreateDefault(m: 'right' | 'topdown') {
    try {
      localStorage.setItem(LS_NODE_MAP_NEW_PROJECT, m);
    } catch (_) {}
  }

  /** max-width:900px 툴바 레이아웃 — 모바일에서 프로젝트명으로 공유 모달 진입 */
  let toolbarCompact = false;

  /** 프로젝트 제목: 1.5초 롱프레스 후 인라인 수정 — 외부 터치·blur 시 저장 */
  const TITLE_LONG_PRESS_MS = 1500;
  let toolbarProjectTitleEditing = false;
  let toolbarTitleDraft = '';
  let toolbarTitleInputEl: HTMLInputElement | undefined;
  let toolbarTitleLpTimer: ReturnType<typeof setTimeout> | null = null;
  let toolbarTitleLpStart: { x: number; y: number } | null = null;
  let suppressNextToolbarTitleClick = false;

  let modalEditingProjectId: string | null = null;
  let modalEditingDraft = '';
  let modalCardTitleInputEl: HTMLInputElement | undefined;
  let modalTitleLpTimer: ReturnType<typeof setTimeout> | null = null;
  let modalTitleLpStart: { x: number; y: number } | null = null;
  let modalSuppressNextPcClick = false;

  /** 뷰(#VIEWS) 터치 시 공통 툴바를 위로 접었다가, 상단 아이콘으로 다시 펼침(모바일·PC 공통) */
  let toolbarSheetHidden = false;

  let aclInviteRows: AclInviteSummary[] = [];
  let aclInvitesErr = '';
  let aclImportBusyKey = '';
  /** `getPendingWorkspaceDeletionIds`는 비반응형 — 삭제 직후 초대 목록 필터를 다시 돌리기 위한 루프 키 */
  let invitePanelEpoch = 0;

  /**
   * 모달 프로젝트 목록: null = ACL 필터 미적용(로컬 전부 표시) · 배열 = `canAccessProject` 통과한 것만
   * 클라우드 설정 시(+ 로그인) 목록 행은 서버 **`plannode_workspace.projects_json`** 정본을 우선하고 로컬 전용 id만 뒤에 붙인다(NOW-70~72).
   * 동기화 중에는 이전 배열을 유지(stale-while-revalidate) — `[]`로 비우면 목록이 잠깐 사라져 보인다.
   */
  let projectsForModal: Project[] | null = null;
  let modalProjectListToken = 0;
  /** 모달 목록을 마지막으로 채운 계정 — 바뀌면 한 번 `null`로 두어 이전 사용자 목록이 남지 않게 함 */
  let projectsForModalAuthUid: string | null = null;

  async function syncProjectsForModalList() {
    const token = ++modalProjectListToken;
    if (!get(showProjectModal)) return;

    if (!isAclEnforced()) {
      if (token !== modalProjectListToken) return;
      projectsForModal = null;
      projectsForModalAuthUid = null;
      return;
    }
    const uid = getAuthUserId();
    const em = getAuthEmail();
    if (!uid || !em) {
      if (token !== modalProjectListToken) return;
      projectsForModal = null;
      projectsForModalAuthUid = null;
      return;
    }

    if (token !== modalProjectListToken) return;
    if (projectsForModalAuthUid !== uid) {
      projectsForModal = null;
      projectsForModalAuthUid = uid;
    }

    const plist = get(projects);
    let mergedList: Project[];
    if (cloudSyncAvailable) {
      const cloudRes = await fetchOwnWorkspaceProjectMetasForModal();
      if (token !== modalProjectListToken) return;
      mergedList = cloudRes.ok ? mergeModalListCloudCanon(cloudRes.projects, plist) : [...plist];
    } else {
      mergedList = [...plist];
    }

    const next: Project[] = [];
    for (const p of mergedList) {
      if (token !== modalProjectListToken) return;
      if (await canAccessProject(p)) next.push(p);
    }
    if (token !== modalProjectListToken) return;
    projectsForModal = next;
  }

  $: if ($showProjectModal) {
    void $projects;
    void $authUser?.id;
    void syncProjectsForModalList();
  }

  let autoLoadAttempted = false;
  let lastAutoLoadTime = 0;
  let ownerRepairAttempted = false;

  /** Realtime presence: 마지막으로 구독한 프로젝트 id(중복 구독 방지) */
  let presenceProjectId = '';

  let pilotToastTimer: ReturnType<typeof setTimeout> | undefined;

  let showAccountModal = false;
  let accountPw1 = '';
  let accountPw2 = '';
  let accountPwBusy = false;
  let accountPwMsg = '';

  $: if ($showProjectModal) {
    nodeMapLayoutDefaultForCreate = readNodeMapLayoutCreateDefault();
  }

  $: accountEmailDisplay = String($authUser?.email ?? '').trim() || '—';

  $: accountAvatarLetter = (() => {
    const e = accountEmailDisplay;
    if (!e || e === '—') return '';
    const ch = e[0];
    return /[a-zA-Z가-힣0-9]/.test(ch) ? ch.toUpperCase() : '?';
  })();

  function closeAccountModal() {
    showAccountModal = false;
    accountPw1 = '';
    accountPw2 = '';
    accountPwMsg = '';
    accountPwBusy = false;
  }

  async function submitAccountPasswordChange() {
    accountPwMsg = '';
    if (accountPw1.length < 6) {
      accountPwMsg = '새 비밀번호는 6자 이상이어야 해.';
      return;
    }
    if (accountPw1 !== accountPw2) {
      accountPwMsg = '두 비밀번호 입력이 같지 않아.';
      return;
    }
    accountPwBusy = true;
    const { error } = await supabase.auth.updateUser({ password: accountPw1 });
    accountPwBusy = false;
    if (error) {
      accountPwMsg = error.message;
      return;
    }
    accountPw1 = '';
    accountPw2 = '';
    showPilotToast('비밀번호를 바꿨어.');
    closeAccountModal();
  }

  async function handleLogoutFromAccountMenu() {
    closeAccountModal();
    await handleLogout();
  }

  function showPilotToast(msg: string) {
    dismissPilotRelinkGuide();
    const t = document.getElementById('TST');
    if (!t) return;
    t.textContent = msg;
    t.style.display = 'block';
    if (pilotToastTimer) clearTimeout(pilotToastTimer);
    pilotToastTimer = window.setTimeout(() => {
      t.style.display = 'none';
      pilotToastTimer = undefined;
    }, 2800);
  }

  /** plan-output P-3·B: 포커스·가시성으로 양방향 동기가 돌 수 있음을 세션당 1회 안내(GP-12 최소). */
  const SYNC_FOCUS_HINT_SS_KEY = 'plannode_sync_focus_hint_v1';

  function maybeShowCloudSyncFocusHint(): void {
    if (!cloudSyncAvailable) return;
    try {
      if (sessionStorage.getItem(SYNC_FOCUS_HINT_SS_KEY)) return;
      sessionStorage.setItem(SYNC_FOCUS_HINT_SS_KEY, '1');
    } catch {
      return;
    }
    showPilotToast('다른 창·탭으로 갔다가 돌아오면 클라우드 동기를 다시 불러와요.');
    if (import.meta.env.DEV) {
      if (import.meta.env.DEV) console.debug('[Plannode] Cloud sync runs on tab/window return or timer (P-3·B).');
    }
  }

  function triggerJsonImport() {
    projectImportError = '';
    jsonImportInput?.click();
  }

  /** pilot이 `#BMD` `#BPR` `#BJN` `#BFT` `#BFA` `#BAR` `#BUN` `#BRE`(sink)에 연결 — UI는 드롭다운·툴바에서 동일 요소에 click 위임 */
  let showOutputMenu = false;
  let outputMenuWrapEl: HTMLDivElement | undefined;

  let showViewportMenu = false;
  let viewportMenuWrapEl: HTMLDivElement | undefined;

  function closeOutputMenu() {
    showOutputMenu = false;
  }

  function triggerPilotOutput(id: 'BMD' | 'BPR' | 'BJN') {
    closeOutputMenu();
    const el = document.getElementById(id);
    if (!(el instanceof HTMLElement)) {
      showPilotToast('출력 버튼이 아직 연결 안 됐어. 잠시 후 다시 누르거나 새로고침해줘.');
      return;
    }
    el.click();
  }

  function closeViewportMenu() {
    showViewportMenu = false;
  }

  function triggerPilotViewport(id: 'BFT' | 'BFA' | 'BAR') {
    closeViewportMenu();
    closeViewMenu();
    closeOutputMenu();
    document.getElementById(id)?.click();
  }

  /** 되돌리기 — 파일럿은 `#BUN` sink에만 연결(다른 출력 버튼과 동일 패턴) */
  function triggerPilotUndo() {
    const el = document.getElementById('BUN');
    if (!(el instanceof HTMLElement)) {
      showPilotToast('되돌리기가 아직 연결 안 됐어. 새로고침 후 다시 시도해줘.');
      return;
    }
    el.click();
  }

  function triggerPilotRedo() {
    const el = document.getElementById('BRE');
    if (!(el instanceof HTMLElement)) {
      showPilotToast('다시 실행이 아직 연결 안 됐어. 새로고침 후 다시 시도해줘.');
      return;
    }
    el.click();
  }

  let showViewMenu = false;
  let viewMenuWrapEl: HTMLDivElement | undefined;

  const VIEW_MENU_LABELS: Record<'tree' | 'prd' | 'spec' | 'ia' | 'ai', string> = {
    tree: '노드',
    prd: 'PRD',
    spec: '기능명세',
    ia: '정보 구조(IA)',
    ai: 'AI 분석(LLM)'
  };

  /** PRD §5 · F2-4 vs F2-5 — 짧은 라벨은 위, 긴 설명은 title(툴팁) */
  const VIEW_MENU_TITLES: Record<'tree' | 'prd' | 'spec' | 'ia' | 'ai', string> = {
    tree: '노드 트리 캔버스에서 편집 (F2-1)',
    prd: 'PRD 문서 보기 (F2-2)',
    spec: '기능명세 그리드 보기 (F2-3)',
    ia: '정보 구조(Information Architecture) — 트리에서 도출하는 문서·보내기 (F2-4, LLM과 구분)',
    ai: 'LLM으로 기획문서·분석 보조 (F2-5) — IA 탭과 별도'
  };

  $: viewMenuLabel = VIEW_MENU_LABELS[$activeView];

  /** PRD M4 —보내기 메뉴 툴팁용 (파일럿 저장 파일명과 동일 슬러그) */
  $: outputFileSlug = $currentProject?.name ? slugExportName($currentProject.name) : '';

  function closeViewMenu() {
    showViewMenu = false;
  }

  function pickView(v: 'tree' | 'prd' | 'spec' | 'ia' | 'ai') {
    activeView.set(v);
    closeViewMenu();
  }

  /** 상단 출력 → 화면 목록 인텐트: IA 탭으로 전환 후 `IAExportMenu`가 1회 실행 */
  function goIaFromOutput(intent: IAExportIntent) {
    closeOutputMenu();
    pendingIaExportIntent.set(intent);
    pickView('ia');
  }

  function maybeCommitProjectTitleEdits(t: Node) {
    if (!(t instanceof Element)) return;
    const tbZone = document.getElementById('TB-PROJ-TITLE');
    if (toolbarProjectTitleEditing && tbZone && !tbZone.contains(t)) {
      commitToolbarProjectTitle();
    }
    if (modalEditingProjectId) {
      const zone = document.querySelector(`[data-pm-title-pid="${modalEditingProjectId}"]`);
      if (zone && !zone.contains(t)) {
        commitModalProjectTitle();
      }
    }
  }

  function clearToolbarTitleLongPressUi() {
    if (toolbarTitleLpTimer) {
      clearTimeout(toolbarTitleLpTimer);
      toolbarTitleLpTimer = null;
    }
    toolbarTitleLpStart = null;
  }

  function onToolbarTitleZonePointerDown(e: PointerEvent) {
    if (!$currentProject || toolbarProjectTitleEditing) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    clearToolbarTitleLongPressUi();
    toolbarTitleLpStart = { x: e.clientX, y: e.clientY };

    const onMove = (ev: PointerEvent) => {
      if (!toolbarTitleLpStart || !toolbarTitleLpTimer) return;
      const dx = ev.clientX - toolbarTitleLpStart.x;
      const dy = ev.clientY - toolbarTitleLpStart.y;
      if (dx * dx + dy * dy > 100) {
        clearToolbarTitleLongPressUi();
        detach();
      }
    };
    const detach = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };
    const onEnd = () => {
      detach();
      clearToolbarTitleLongPressUi();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);

    toolbarTitleLpTimer = setTimeout(() => {
      toolbarTitleLpTimer = null;
      toolbarTitleLpStart = null;
      detach();
      toolbarTitleDraft = get(currentProject)?.name ?? '';
      toolbarProjectTitleEditing = true;
      suppressNextToolbarTitleClick = true;
      void tick().then(() => {
        toolbarTitleInputEl?.focus();
        toolbarTitleInputEl?.select?.();
      });
    }, TITLE_LONG_PRESS_MS);
  }

  function commitToolbarProjectTitle() {
    if (!toolbarProjectTitleEditing) return;
    const p = get(currentProject);
    if (!p) {
      toolbarProjectTitleEditing = false;
      toolbarTitleDraft = '';
      return;
    }
    const draft = toolbarTitleDraft.trim();
    toolbarProjectTitleEditing = false;
    toolbarTitleDraft = '';
    if (!draft || draft === p.name) return;
    updateProjectFields(p.id, { name: draft });
    showPilotToast('프로젝트 이름을 저장했어.');
  }

  function cancelToolbarProjectTitleEdit() {
    toolbarProjectTitleEditing = false;
    toolbarTitleDraft = '';
  }

  function clearModalTitleLongPressUi() {
    if (modalTitleLpTimer) {
      clearTimeout(modalTitleLpTimer);
      modalTitleLpTimer = null;
    }
    modalTitleLpStart = null;
  }

  function onModalCardTitlePointerDown(e: PointerEvent, proj: Project) {
    if (modalEditingProjectId) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    clearModalTitleLongPressUi();
    modalTitleLpStart = { x: e.clientX, y: e.clientY };

    const onMove = (ev: PointerEvent) => {
      if (!modalTitleLpStart || !modalTitleLpTimer) return;
      const dx = ev.clientX - modalTitleLpStart.x;
      const dy = ev.clientY - modalTitleLpStart.y;
      if (dx * dx + dy * dy > 100) {
        clearModalTitleLongPressUi();
        detach();
      }
    };
    const detach = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };
    const onEnd = () => {
      detach();
      clearModalTitleLongPressUi();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);

    modalTitleLpTimer = setTimeout(() => {
      modalTitleLpTimer = null;
      modalTitleLpStart = null;
      detach();
      modalEditingProjectId = proj.id;
      modalEditingDraft = proj.name;
      modalSuppressNextPcClick = true;
      void tick().then(() => {
        modalCardTitleInputEl?.focus();
        modalCardTitleInputEl?.select?.();
      });
    }, TITLE_LONG_PRESS_MS);
  }

  function commitModalProjectTitle() {
    if (!modalEditingProjectId) return;
    const pid = modalEditingProjectId;
    const draft = modalEditingDraft.trim();
    modalEditingProjectId = null;
    modalEditingDraft = '';
    const p = get(projects).find((x) => x.id === pid);
    if (!p) return;
    if (!draft || draft === p.name) return;
    updateProjectFields(pid, { name: draft });
    showPilotToast('프로젝트 이름을 저장했어.');
  }

  function cancelModalProjectTitleEdit() {
    modalEditingProjectId = null;
    modalEditingDraft = '';
  }

  function onToolbarMenusOutside(ev: Event) {
    const t = ev.target;
    if (!(t instanceof Node)) return;
    maybeCommitProjectTitleEdits(t);
    if (showOutputMenu && outputMenuWrapEl && !outputMenuWrapEl.contains(t)) closeOutputMenu();
    if (showViewMenu && viewMenuWrapEl && !viewMenuWrapEl.contains(t)) closeViewMenu();
    if (showViewportMenu && viewportMenuWrapEl && !viewportMenuWrapEl.contains(t)) closeViewportMenu();
  }

  function collapseToolbarSheet() {
    if (toolbarSheetHidden) return;
    closeOutputMenu();
    closeViewMenu();
    closeViewportMenu();
    toolbarSheetHidden = true;
  }

  function expandToolbarSheet() {
    toolbarSheetHidden = false;
  }

  /** #TB·#VIEWS 형제 구조라 캔버스/문서 터치는 여기서만 잡힘(툴바 영역 제외) */
  function onViewsSurfacePointerDownCapture(ev: PointerEvent) {
    if (toolbarSheetHidden) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    collapseToolbarSheet();
  }

  function syncViewsTbPad(showPad: boolean) {
    const r = document.getElementById('R');
    const tb = document.getElementById('TB');
    if (!r || !tb) return;
    if (showPad) {
      const h = Math.ceil(tb.getBoundingClientRect().height) + 8;
      r.style.setProperty('--views-tb-pad', `${h}px`);
    } else {
      r.style.setProperty('--views-tb-pad', '0px');
    }
  }

  $: if (typeof document !== 'undefined') {
    const showPad = !toolbarSheetHidden;
    void tick().then(() => syncViewsTbPad(showPad));
  }

  /** GATE B 확정: 단일 가져오기 파일 상한 (바이트). docx·대형 md 공통. */
  const PLANNODE_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
  /** GATE B: docx→헤딩 휴리스틱 생성 노드 상한(루트 포함) */
  const PLANNODE_IMPORT_MAX_NODES = 300;

  function isPlannodeImportAllowedByName(name: string): boolean {
    const n = name.trim().toLowerCase();
    return (
      n.endsWith('.json') ||
      n.endsWith('.md') ||
      n.endsWith('.markdown') ||
      n.endsWith('.txt')
    );
  }

  /** IMPORT-BJI-EMPTY-OVERWRITE: 현재 프로젝트가 비었는지 판정 (파일럿 메모리 우선) */
  function isCurrentProjectEmpty(projectId: string): boolean {
    // (1) 파일럿이 현재 프로젝트를 열었는가?
    const curPid = get(currentProject)?.id;
    if (curPid !== projectId) {
      // 다른 프로젝트면 localStorage만 확인
      return loadProjectNodesFromLocalStorage(projectId).length <= 1;
    }
    
    // (2) 현재 프로젝트: 파일럿 메모리 우선
    // - 파일럿이 가장 정확한 상태 (미저장 삭제 포함)
    // - localStorage는 지연 플러시로 구 데이터 가능성
    const storeNodes = get(nodes);
    
    // (3) 안전장치: 두 소스 모두 확인 (더 엄격한 조건)
    // - 파일럿과 스토어 둘 다 루트만 → "정말 비었음"
    const botAreBare = storeNodes.length <= 1;
    
    return botAreBare;
  }

  async function handleJsonImportChange(ev: Event) {
    projectImportError = '';
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const name = file.name || '';
    const lower = name.toLowerCase();

    if (file.size > PLANNODE_IMPORT_MAX_FILE_BYTES) {
      const mb = (PLANNODE_IMPORT_MAX_FILE_BYTES / (1024 * 1024)).toFixed(0);
      const msg = `파일이 너무 커 (${mb}MB 이하만). 나눠서 저장하거나 용량을 줄여줘.`;
      projectImportError = msg;
      showPilotToast(msg);
      return;
    }

    let parsed: ParsePlannodeTreeV1Result;
    let importUsedOutlineFallback = false;
    if (lower.endsWith('.docx')) {
      const doc = await extractDocxPlainTextFromFile(file);
      if (!doc.ok) {
        projectImportError = doc.message;
        showPilotToast(doc.message);
        return;
      }
      const base = name.replace(/\.docx$/i, '').trim() || 'Word 문서';
      parsed = outlinePlainTextToPlannodeTreeV1(doc.text, {
        projectName: base,
        maxNodes: PLANNODE_IMPORT_MAX_NODES
      });
    } else if (isPlannodeImportAllowedByName(name)) {
      const text = await file.text();
      if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
        const base = name.replace(/\.(md|markdown)$/i, '').trim() || '마크다운 문서';
        const md = parseMarkdownFileForProjectImport(text, {
          baseName: base,
          maxNodes: PLANNODE_IMPORT_MAX_NODES
        });
        parsed = md.result;
        importUsedOutlineFallback = md.usedOutlineFallback;
      } else {
        parsed = parsePlannodeTreeV1ImportText(text);
      }
    } else {
      const msg =
        '가져오기는 .docx, .json, .md, .markdown(또는 JSON 본문 .txt)만 지원해. docx·md( JSON 없을 때)는 본문에서 # 제목·번호 목차를 찾아 노드 초안을 만들어.';
      projectImportError = msg;
      showPilotToast(msg);
      return;
    }

    // .json / .md(펜스·제목 초안) 실패 메시지는 파서 단일 소스(토스트 동일).
    if (!parsed.ok) {
      projectImportError = parsed.message;
      showPilotToast(parsed.message);
      return;
    }
    const pid = parsed.project.id;
    const exists = get(projects).some((p) => p.id === pid);
    
    // **GATE B 최종:** 현재 캔버스 상태를 파일럿 메모리 기준으로 판정
    // - 같은 ID & 루트만 → confirm 생략 (새 프로젝트처럼 가져오기)
    // - 다른 ID 또는 노드 있음 → confirm 표시 (덮어쓰기 경고)
    const isEmpty = isCurrentProjectEmpty(pid);
    const mustConfirmOverwrite = exists && !isEmpty;
    if (
      mustConfirmOverwrite &&
      !confirm(
        `같은 ID의 프로젝트가 있어. 메타·노드를 덮어쓸까?\n\n${parsed.project.name} (${pid})`
      )
    ) {
      showPilotToast('가져오기를 취소했어.');
      return;
    }
    if (mustConfirmOverwrite) {
      captureNodeSnapshot(pid, loadProjectNodesFromLocalStorage(pid), 'import');
    }

    showBadgeImportMappingOverlay = true;
    await tick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const overlayT0 = typeof performance !== 'undefined' ? performance.now() : 0;
    let merged: Project | null = null;
    try {
      merged = upsertImportedPlannodeTreeV1(parsed.project, parsed.nodes, { openAfter: false });
    } finally {
      const elapsed =
        typeof performance !== 'undefined' ? performance.now() - overlayT0 : BADGE_IMPORT_OVERLAY_MIN_MS;
      if (elapsed < BADGE_IMPORT_OVERLAY_MIN_MS) {
        await new Promise((r) => setTimeout(r, BADGE_IMPORT_OVERLAY_MIN_MS - elapsed));
      }
      showBadgeImportMappingOverlay = false;
    }

    if (!merged) {
      const msg = '저장에 실패했어.';
      projectImportError = msg;
      showPilotToast(msg);
      return;
    }

    // **가져오기 완료 직후 모달 즉시 닫기** (백그라운드 작업과 무관)
    projectImportError = '';
    await tick();
    requestAnimationFrame(() => showProjectModal.set(false));

    const uid = getAuthUserId();
    if (cloudSyncAvailable && uid) {
      if (!merged.owner_user_id) {
        updateProjectMeta(merged.id, { owner_user_id: uid });
      }
      const acl = await ensureOwnerAclRowForMyProject(merged.id);
      if (!acl.ok) showPilotToast(acl.message ?? '접근 목록(소유자) 저장 실패');
    }
    const latest = get(projects).find((p) => p.id === merged.id);
    if (latest) {
      const r = await trySelectProject(latest);
      if (!r.ok) showPilotToast(r.message ?? '가져온 프로젝트에 접근할 수 없어.');
      else {
        showPilotToast(
          importUsedOutlineFallback
            ? `가져오기 완료(제목·목차 초안): ${latest.name}`
            : `가져오기 완료: ${latest.name}`
        );
      }
    }
  }

  /** 생성 직후: 요구사항이 있고 클라우드·세션이 있으면 `/api/ai/agenda-to-tree` → 파싱·배지 살규화·upsert (기존 단독 버튼과 동일 파이프라인) */
  async function tryApplyAgendaAiTreeAfterCreate(newProj: Project, agendaTrimmed: string) {
    const token = get(authSession)?.access_token?.trim();
    if (!cloudSyncAvailable || !token) return;

    try {
      const uid = getAuthUserId();
      const userAnthropicKey = readStoredUserAnthropicKey();
      const agendaHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      };
      if (userAnthropicKey) {
        agendaHeaders[PLANNODE_USER_ANTHROPIC_KEY_HEADER] = userAnthropicKey;
      }

      const res = await fetch('/api/ai/agenda-to-tree', {
        method: 'POST',
        headers: agendaHeaders,
        body: JSON.stringify({
          agenda: agendaTrimmed,
          projectId: newProj.id,
          projectName: newProj.name,
          depth: 3
        })
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 503) {
        showPilotToast('Supabase가 없어서 AI 호출을 할 수 없어.');
        return;
      }
      if (res.status === 401) {
        showPilotToast('세션이 만료됐어. 다시 로그인 후 시도해줘.');
        return;
      }
      if (!res.ok) {
        showPilotToast(j?.message ? String(j.message) : `AI 요청 실패 (${res.status})`);
        return;
      }
      if (j?.code === 'NO_KEY' || j?.ok === false) {
        showPilotToast(
          j?.hint
            ? String(j.hint)
            : 'Anthropic 키가 없어. 서버 환경 변수나 프로젝트 모달의「모델API 등록」을 확인해줘.'
        );
        return;
      }
      const raw = String(j?.rawResponse ?? '');
      if (!raw.trim() || j?.code === 'EMPTY') {
        showPilotToast('AI가 빈 응답을 줬어. 아젠다를 조금 줄이거나 다시 시도해줘.');
        return;
      }

      let parsed: ReturnType<typeof extractAndParseTree>;
      try {
        parsed = extractAndParseTree(raw, newProj.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        showPilotToast(`트리 파싱 실패: ${msg}`);
        return;
      }

      const mergedProject: Project = {
        ...newProj,
        description: agendaTrimmed,
        name: parsed.project.name?.trim() || newProj.name
      };

      if (get(nodes).length > 1) {
        if (!confirm('이미 이 프로젝트에 노드가 있어. AI가 만든 트리로 덮어쓸까?')) {
          showPilotToast('취소했어. 빈 프로젝트는 목록에서 지울 수 있어.');
          return;
        }
        captureNodeSnapshot(newProj.id, get(nodes), 'import');
      }

      const merged = upsertImportedPlannodeTreeV1(mergedProject, parsed.nodes, { openAfter: true });
      if (!merged) {
        showPilotToast('생성된 트리를 저장하지 못했어.');
        return;
      }
      if (cloudSyncAvailable && uid && !merged.owner_user_id) {
        updateProjectMeta(merged.id, { owner_user_id: uid });
      }
      const latest = get(projects).find((p) => p.id === merged.id);
      if (latest) {
        const r2 = await trySelectProject(latest);
        if (!r2.ok) showPilotToast(r2.message ?? '프로젝트를 열 수 없어.');
      }

      pilotSetNodeMapLayout(nodeMapLayoutDefaultForCreate);
      writeNodeMapLayoutCreateDefault(nodeMapLayoutDefaultForCreate);

      const { scheduleCloudFlush } = await import('$lib/supabase/workspacePush');
      scheduleCloudFlush('new-project-agenda', 100);

      showPilotToast(`AI 노드 초안 반영 완료(${parsed.nodeCount}개 노드)`);
    } catch (e) {
      console.error('agenda tree apply', e);
      showPilotToast(e instanceof Error ? e.message : '오류가 났어.');
    }
  }

  async function handleProjectCreate() {
    if (projectCreateBusy) return;
    if (!projectName || !projectAuthor || !projectStart || !projectEnd) {
      alert('필수 항목을 입력해주세요');
      return;
    }

    projectCreateBusy = true;
    try {
      const uid = getAuthUserId();
      const agendaTrimmed = projectDesc?.trim() ?? '';
      const newProj = createProject({
        name: projectName,
        author: projectAuthor,
        start_date: projectStart,
        end_date: projectEnd,
        description: projectDesc,
        owner_user_id: cloudSyncAvailable && uid ? uid : undefined
      });

      if (!newProj) {
        alert('프로젝트 생성에 실패했습니다');
        return;
      }

      if (cloudSyncAvailable && uid) {
        const acl = await ensureOwnerAclRowForMyProject(newProj.id);
        if (!acl.ok) {
          alert(acl.message ?? '클라우드에 소유자(접근 목록)를 저장하지 못했어. SQL·RLS를 확인한 뒤 다시 시도해줘.');
        } else {
          const { scheduleCloudFlush } = await import('$lib/supabase/workspacePush');
          scheduleCloudFlush('new-project-acl', 100);
        }
      }

      /** 다른 프로젝트가 열려 있으면 지연 persist 전에 전환하면 이전 캔버스가 저장되지 않음 — 엎어쓰기처럼 보임 */
      const alreadyOpen = get(currentProject);
      if (alreadyOpen && alreadyOpen.id !== newProj.id) {
        pilotFlushPersistNow();
      }

      const r = await trySelectProject(newProj);
      if (!r.ok) {
        alert(r.message ?? '프로젝트를 열 수 없습니다');
        return;
      }

      pilotSetNodeMapLayout(nodeMapLayoutDefaultForCreate);
      writeNodeMapLayoutCreateDefault(nodeMapLayoutDefaultForCreate);

      if (agendaTrimmed) {
        await tryApplyAgendaAiTreeAfterCreate(newProj, agendaTrimmed);
      }

      projectName = '';
      projectAuthor = '';
      projectStart = '';
      projectEnd = '';
      projectDesc = '';
      await tick();
      requestAnimationFrame(() => showProjectModal.set(false));
    } catch (e) {
      console.error('Project creation error:', e);
      alert('프로젝트 생성 중 오류가 발생했습니다: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      projectCreateBusy = false;
    }
  }

  function closeModal() {
    showModelApiModal = false;
    modelApiKeyDraft = '';
    projectImportError = '';
    showProjectModal.set(false);
  }

  /** 프로젝트 모달: 본문이 넘칠 때 하단 화살표로 아래 목록·초대 영역이 있음을 안내(모바일은 스크롤바 숨김 유지) */
  let projectModalEl: HTMLDivElement | undefined;
  let projectModalScrollHint = false;

  function syncProjectModalScrollHint() {
    const el = projectModalEl;
    if (!el || !get(showProjectModal)) {
      projectModalScrollHint = false;
      return;
    }
    const gap = 16;
    const hasOverflow = el.scrollHeight > el.clientHeight + 2;
    const notAtBottom = el.scrollTop + el.clientHeight < el.scrollHeight - gap;
    projectModalScrollHint = hasOverflow && notAtBottom;
  }

  function scrollProjectModalDown() {
    const el = projectModalEl;
    if (!el) return;
    el.scrollBy({ top: Math.min(120, el.scrollHeight - el.clientHeight - el.scrollTop), behavior: 'smooth' });
    window.setTimeout(() => syncProjectModalScrollHint(), 350);
  }

  $: if ($showProjectModal) {
    void $projects.length;
    void aclInviteRows.length;
    tick().then(() => requestAnimationFrame(() => syncProjectModalScrollHint()));
  }

  async function loadAclInvitesForModal() {
    if (!cloudSyncAvailable) {
      aclInviteRows = [];
      aclInvitesErr = '';
      return;
    }
    const r = await fetchMyAclInviteSummaries();
    aclInviteRows = r.rows;
    aclInvitesErr = r.error ?? '';
  }

  $: if ($showProjectModal && cloudSyncAvailable) {
    void loadAclInvitesForModal();
  }

  $: aclProjectIdSet = new Set(aclInviteRows.map((r) => r.project_id));
  /** 로컬 목록에 없고, 방금 이 기기에서 삭제해 클라우드 반영 대기 중인 id는 제외(ACL 조회 지연·소유자 행 잔상 방지) */
  $: invitedRemoteOnly = (() => {
    void invitePanelEpoch;
    void aclInviteRows;
    void $projects;
    const pendingDel = getPendingWorkspaceDeletionIds();
    return aclInviteRows.filter((r) => {
      if ($projects.some((p) => p.id === r.project_id)) return false;
      if (pendingDel.has(r.project_id)) return false;
      return true;
    });
  })();

  /** 모달에서 카드별 삭제 버튼 표시용(ACL·플랫폼 마스터 등 owner_user_id만으로는 모르는 경우) */
  let projectDeletableById: Record<string, boolean> = {};
  let deleteFlagsLoadGen = 0;
  let deletingProjectId = '';

  async function loadProjectDeleteFlags() {
    const uid = getAuthUserId();
    if (!$showProjectModal || !uid) {
      projectDeletableById = {};
      return;
    }
    // 재오픈·계정 전환 직전 스냅샷으로 비소유 카드에 삭제가 잠깐(또는 계속) 뜨는 것 방지
    projectDeletableById = {};
    const gen = ++deleteFlagsLoadGen;
    const plist = get(projects);
    const entries = await Promise.all(
      plist.map(async (p) => [p.id, await isCurrentUserProjectOwner(p)] as const)
    );
    if (gen !== deleteFlagsLoadGen || !$showProjectModal) return;
    projectDeletableById = Object.fromEntries(entries);
  }

  /** 모달이 열려 있을 때만 갱신; auth·목록 변화에도 재조회 */
  $: if ($showProjectModal) {
    $authUser?.id;
    $projects;
    void loadProjectDeleteFlags();
  }

  $: if (!$showProjectModal) {
    projectDeletableById = {};
    deleteFlagsLoadGen++;
    showModelApiModal = false;
    modelApiKeyDraft = '';
  }

  function canShowProjectDelete(proj: Project): boolean {
    const uid = getAuthUserId();
    if (!uid) return false;
    if (proj.owner_user_id === uid) return true;
    return projectDeletableById[proj.id] === true;
  }

  async function handleDeleteProjectCard(proj: Project) {
    if (!canShowProjectDelete(proj)) return;
    if (
      !confirm(
        `「${proj.name}」프로젝트를 이 기기에서 삭제할까?\n\n로컬 데이터와(클라우드 연 시) 접근 허용 목록이 함께 지워져. 이 작업은 되돌릴 수 없어.`
      )
    ) {
      return;
    }
    deletingProjectId = proj.id;
    try {
      const aclR = await deleteAllAclRowsForProjectIfOwner(proj);
      if (!aclR.ok) {
        alert(aclR.message ?? '접근 정보를 지우지 못했어. 잠시 후 다시 시도해줘.');
        return;
      }
      if (get(aclModalProject)?.id === proj.id) {
        closeAclModal();
      }
      if (cloudSyncAvailable) {
        registerPendingWorkspaceDeletion(proj.id);
      }
      deleteProject(proj.id);
      if (cloudSyncAvailable) {
        scheduleCloudFlush('delete-project', 100);
      }
      showPilotToast('프로젝트를 삭제했어.');
      invitePanelEpoch++;
      void loadAclInvitesForModal();
    } finally {
      deletingProjectId = '';
    }
  }

  async function handleImportInvited(inv: AclInviteSummary) {
    if (!inv.workspace_source_user_id) {
      showPilotToast(
        '클라우드 연결 정보가 없어. 소유자에게 「접근」목록을 한 번 연 뒤 저장하거나, DB 백필 SQL을 실행해줘.'
      );
      return;
    }
    const key = `${inv.workspace_source_user_id}:${inv.project_id}`;
    aclImportBusyKey = key;
    try {
      const r = await importSharedProjectFromWorkspace(inv.workspace_source_user_id, inv.project_id);
      if (r.ok) {
        showPilotToast(r.message);
        await loadAclInvitesForModal();
        const latest = get(projects).find((p) => p.id === inv.project_id);
        if (latest) {
          await finalizeProjectOpen(latest);
        } else {
          await tick();
          requestAnimationFrame(() => showProjectModal.set(false));
        }
        return;
      }
      if (r.sliceMissing) {
        const pr = await pruneStaleInviteAfterSliceMissing(inv);
        if (pr.outcome === 'pruned') {
          showPilotToast('클라우드에 없는 초대라서 목록에서 뺐어.');
          invitePanelEpoch++;
          await loadAclInvitesForModal();
          return;
        }
        showPilotToast(pr.message ? `${r.message} (${pr.message})` : r.message);
        return;
      }
      showPilotToast(r.message);
    } finally {
      aclImportBusyKey = '';
    }
  }

  function postLogoutOpenToLogoutTree() {
    const p = get(currentProject);
    if (!postLogoutOpenPair || !p || postLogoutOpenPair.projectId !== p.id || !postLogoutOpenPair.atLatest) return;
    pilotFlushPersistNow();
    const list = JSON.parse(JSON.stringify(postLogoutOpenPair.logoutNodes)) as Node[];
    replaceProjectNodesFromHistory(postLogoutOpenPair.projectId, list);
    postLogoutOpenPair = { ...postLogoutOpenPair, atLatest: false };
    void tick().then(() => pilotRefreshPrdView());
    showPilotToast('로그아웃 직전 트리로 바꿨어. (실행 취소)');
  }

  function postLogoutOpenToLatestTree() {
    const p = get(currentProject);
    if (!postLogoutOpenPair || !p || postLogoutOpenPair.projectId !== p.id || postLogoutOpenPair.atLatest) return;
    pilotFlushPersistNow();
    const list = JSON.parse(JSON.stringify(postLogoutOpenPair.latestNodes)) as Node[];
    replaceProjectNodesFromHistory(postLogoutOpenPair.projectId, list);
    postLogoutOpenPair = { ...postLogoutOpenPair, atLatest: true };
    void tick().then(() => pilotRefreshPrdView());
    showPilotToast('최신 반영 트리로 돌렸어. (다시 실행)');
  }

  async function finalizeProjectOpen(proj: Project) {
    const r = await trySelectProject(proj);
    if (!r.ok) {
      showPilotToast(r.message ?? '접근할 수 없어.');
      return;
    }
    await tick();
    requestAnimationFrame(() => showProjectModal.set(false));
  }

  async function handleProjectSelect(proj: Project) {
    if (postLogoutOpenPair && postLogoutOpenPair.projectId !== proj.id) {
      postLogoutOpenPair = null;
    }

    const snap = readLogoutSessionSnapshotV1();
    if (!snap || !projectInLogoutSnapshot(snap, proj.id)) {
      if (postLogoutOpenPair?.projectId === proj.id) postLogoutOpenPair = null;
      await finalizeProjectOpen(proj);
      return;
    }

    const { nodes: logoutNodes } = extractProjectSliceFromBundle(snap.bundle, proj.id);
    const localNodes = loadProjectNodesFromLocalStorage(proj.id);
    const logoutHash = projectWorkspaceNodesJsonSnapshot(logoutNodes);
    const localHash = projectWorkspaceNodesJsonSnapshot(localNodes);
    const sameLocal = logoutHash === localHash;

    let sameRemoteVsLogout = true;
    if (cloudSyncAvailable) {
      const uid = getAuthUserId();
      const sharedSrc = proj.cloud_workspace_source_user_id;
      if (sharedSrc && uid && sharedSrc !== uid) {
        const slice = await fetchProjectSliceFromCloud(sharedSrc, proj.id);
        const rn = slice?.nodes ?? null;
        if (rn != null) {
          sameRemoteVsLogout = logoutHash === projectWorkspaceNodesJsonSnapshot(rn);
        }
      } else {
        const bundle = await fetchOwnWorkspaceBundleFresh();
        if (bundle) {
          const raw = bundle.nodesByProject[proj.id];
          const rn = Array.isArray(raw) ? raw : [];
          sameRemoteVsLogout = logoutHash === projectWorkspaceNodesJsonSnapshot(rn);
        }
      }
    }

    if (sameLocal && sameRemoteVsLogout) {
      if (postLogoutOpenPair?.projectId === proj.id) postLogoutOpenPair = null;
      await finalizeProjectOpen(proj);
      return;
    }

    const localNodesBefore = loadProjectNodesFromLocalStorage(proj.id);
    captureNodeSnapshot(proj.id, localNodesBefore, 'pre_pull');

    if (cloudSyncAvailable) {
      const uid = getAuthUserId();
      const sharedSrc = proj.cloud_workspace_source_user_id;
      if (sharedSrc && uid && sharedSrc !== uid) {
        await mergeSharedProjectSliceFromCloudIfApplicable(proj);
      } else {
        const bundle = await fetchOwnWorkspaceBundleFresh();
        if (bundle) mergeWorkspaceBundleFromCloudRemote(bundle);
      }
    }

    const latestNodes = loadProjectNodesFromLocalStorage(proj.id);
    const pid = proj.id;
    const logoutCopy = JSON.parse(JSON.stringify(logoutNodes)) as Node[];
    const latestCopy = JSON.parse(JSON.stringify(latestNodes)) as Node[];
    for (const n of logoutCopy) n.project_id = n.project_id ?? pid;
    for (const n of latestCopy) n.project_id = n.project_id ?? pid;

    clearLogoutSessionSnapshot();

    postLogoutOpenPair = {
      projectId: pid,
      logoutNodes: logoutCopy,
      latestNodes: latestCopy,
      atLatest: true
    };

    const latestProj = get(projects).find((p) => p.id === pid) ?? proj;
    await finalizeProjectOpen(latestProj);

    showPilotToast(
      cloudSyncAvailable
        ? '프로젝트를 최신(클라우드·로컬 병합)으로 열었어. 실행 취소·다시 실행으로 로그아웃 직전 트리와 바꿀 수 있어.'
        : '이 기기 저장본으로 열었어. 실행 취소·다시 실행으로 로그아웃 직전 트리와 바꿀 수 있어.'
    );
  }

  function openAclForCurrentProject() {
    const p = get(currentProject);
    if (p) openAclModal(p);
  }

  function onProjectNameToolbarClick() {
    if (!cloudSyncAvailable || !toolbarCompact) return;
    openAclForCurrentProject();
  }

  function onProjectNameToolbarClickGuarded(ev: MouseEvent) {
    if (suppressNextToolbarTitleClick) {
      ev.preventDefault();
      ev.stopPropagation();
      suppressNextToolbarTitleClick = false;
      return;
    }
    onProjectNameToolbarClick();
  }

  function openAclForProject(proj: Project) {
    openAclModal(proj);
  }

  let prevViewForSync: typeof $activeView | null = null;
  $: if (pilotReady && cloudSyncAvailable) {
    if (prevViewForSync !== null && $activeView !== prevViewForSync) {
      scheduleCloudFlush('view-tab');
    }
    prevViewForSync = $activeView;
  }

  /** 로그인 후 초대된 프로젝트 자동 로드 */
  async function tryAutoLoadInvitedProjects() {
    if (!cloudSyncAvailable || !$authUser) return;

    const now = Date.now();
    // 너무 자주 로드하지 않도록 (1초 쿨다운)
    if (now - lastAutoLoadTime < 1000) return;
    lastAutoLoadTime = now;

    const localProjectIds = $projects.map((p) => p.id);

    const result = await autoLoadInvitedProjects(localProjectIds);

    if (import.meta.env.DEV) {
      console.info('[tryAutoLoadInvitedProjects]', {
        localCount: localProjectIds.length,
        email: $authUser?.email,
        loaded: result.loaded,
        prunedStaleInvites: result.prunedStaleInvites,
        skipped: result.skipped,
        skippedAlreadyLocal: result.skippedAlreadyLocal,
        skippedNoWorkspaceSource: result.skippedNoWorkspaceSource,
        errors: result.errors.length
      });
    }

    if (result.prunedStaleInvites > 0) {
      invitePanelEpoch++;
      void loadAclInvitesForModal();
    }

    if (result.loaded > 0) {
      showPilotToast(`초대받은 프로젝트 ${result.loaded}개를 불러왔어 ✓`);
    }
    if (result.prunedStaleInvites > 0 && result.errors.length === 0 && result.loaded === 0) {
      showPilotToast(`더 이상 없는 초대 ${result.prunedStaleInvites}건을 목록에서 정리했어.`);
    } else if (result.prunedStaleInvites > 0 && (result.loaded > 0 || result.errors.length > 0)) {
      showPilotToast(`끊긴 초대 ${result.prunedStaleInvites}건을 목록에서 뺐어.`);
    }
    if (result.errors.length > 0) {
      const errMsg = result.errors.map((e) => `${e.projectId}: ${e.message}`).join('; ');
      const capped = errMsg.length > 220 ? `${errMsg.slice(0, 220)}…` : errMsg;
      if (import.meta.env.DEV) {
        console.warn('[autoLoadInvitedProjects] errors:', errMsg);
      }
      showPilotToast(`프로젝트 불러오기 실패: ${capped}`);
    }
  }

  $: if (!$authUser) {
    autoLoadAttempted = false;
    ownerRepairAttempted = false;
  }

  // 1. 로그인 직후 한 번 실행
  $: if ($authUser && !autoLoadAttempted && cloudSyncAvailable && pilotReady) {
    autoLoadAttempted = true;
    void tryAutoLoadInvitedProjects();
  }

  // 1-2. 소유자: 로컬 owner_user_id가 본인인 프로젝트마다 ACL workspace 소스 RPC 복구(멤버 NULL 방지)
  $: if ($authUser && !ownerRepairAttempted && cloudSyncAvailable && pilotReady && $projects.length > 0) {
    ownerRepairAttempted = true;
    const uid = $authUser.id;
    void repairOwnedProjectsAclWorkspaceSources($projects, uid).then(async (r) => {
      if (import.meta.env.DEV) console.info('[repairOwnedProjectsAclWorkspaceSources]', r);
      const hasOwned = $projects.some((p) => p.owner_user_id === uid);
      if (r.rpcMissing && import.meta.env.DEV) {
        console.warn(
          '[repairOwnedProjectsAclWorkspaceSources] RPC 미설치 → docs/supabase/plannode_project_acl_repair_project_sources_rpc.sql 실행'
        );
      } else if (!r.rpcMissing && hasOwned) {
        const { scheduleCloudFlush } = await import('$lib/supabase/workspacePush');
        scheduleCloudFlush('acl-repair', 200);
      }
      void tryAutoLoadInvitedProjects();
    });
  }

  // 2. 프로젝트 모달 열 때마다 갱신 + 자동 로드 시도 (계정이 새 초대를 받은 경우 대응)
  $: if ($showProjectModal && cloudSyncAvailable) {
    void loadAclInvitesForModal();
    void tryAutoLoadInvitedProjects();
  }

  $: if (typeof window !== 'undefined') {
    const pid = $currentProject?.id;
    const uid = $authUser?.id;
    const email = $authUser?.email ?? null;
    if (cloudSyncAvailable && pid && uid) {
      if (pid !== presenceProjectId) {
        unsubscribeProjectPresence();
        presenceProjectId = pid;
        const atSubscribe = pid;
        void (async () => {
          const { rows } = await fetchProjectAcl(atSubscribe);
          if (presenceProjectId !== atSubscribe) return;
          const emails = rows.map((r) => r.email).filter(Boolean);
          const proj = get(currentProject);
          if (!proj || proj.id !== atSubscribe) return;
          const ownerOk = await isCurrentUserProjectOwner(proj);
          if (presenceProjectId !== atSubscribe) return;
          const wsSrc = proj?.cloud_workspace_source_user_id ?? null;
          /** 멤버 ACL 조회에 소유자 이메일이 없을 때도 Presence에 소유자 uid 표시 */
          const presenceAlwaysShow = wsSrc && wsSrc !== uid ? [wsSrc] : [];
          /** 소유자: 필터 없음(모든 온라인 피어 표시, RLS로 이미 격리) · 공유자: ACL 이메일만(ACL 조회 실패 시에도 빈 배열 → Realtime 피어는 유지) */
          const presenceAllowedEmails = ownerOk ? [] : emails;
          await subscribeProjectPresence(atSubscribe, uid, email, presenceAllowedEmails, presenceAlwaysShow);
        })();
      }
    } else if (presenceProjectId !== '') {
      presenceProjectId = '';
      unsubscribeProjectPresence();
    }
  }

  function presenceAvatarLetter(email: string): string {
    const e = String(email ?? '').trim();
    if (!e) return '?';
    const ch = e[0];
    return /[a-zA-Z가-힣0-9]/.test(ch) ? ch.toUpperCase() : '?';
  }

  /** 파일럿 노드 카드 오버레이 — `plannodePilot.render`가 읽음
   *  pilotReady 가드: 파일럿 리스너가 등록된 이후에만 이벤트 발행 */
  $: if (pilotReady && typeof window !== 'undefined') {
    (window as Window & { __plannodePresencePeers?: ProjectPresencePeer[] }).__plannodePresencePeers =
      $projectPresencePeers;
    window.dispatchEvent(new CustomEvent('plannode-presence-update'));
  }

  async function handleLogout() {
    let aiPeek = '';
    try {
      const el = typeof document !== 'undefined' ? document.getElementById('ai-result') : null;
      if (el?.textContent?.trim()) aiPeek = el.textContent.trim();
    } catch {
      /* ignore */
    }
    captureLogoutSessionSnapshot({ aiResultText: aiPeek || undefined });
    clearSessionProjectSelectionForLogout();
    const ok = await flushCloudWorkspaceNow('logout');
    if (!ok) showPilotToast('클라우드에 마지막 저장이 안 됐어. 다시 로그인한 뒤 잠시 기다리면 자동으로 올라가.');
    await signOutEverywhere();
  }

  onMount(() => {
    /** mountPilotBridge 안에서 동기 hydrate → render → maybeEmitNodeSelect 가 먼저 나갈 수 있음 — 리스너를 먼저 둔다 */
    const onNodeSelectPresence = (ev: Event) => {
      const d = (ev as CustomEvent<{ nodeId?: string | null }>).detail;
      updateMySelectedNode(d?.nodeId ?? null);
    };
    window.addEventListener('plannode-node-select', onNodeSelectPresence);

    const { destroy } = mountPilotBridge();
    pilotReady = true;

    pilotSetActiveView($activeView);
    nodeMapLayoutDefaultForCreate = readNodeMapLayoutCreateDefault();

    const mqToolbar = window.matchMedia('(max-width: 900px)');
    toolbarCompact = mqToolbar.matches;
    const onMqToolbar = () => {
      toolbarCompact = mqToolbar.matches;
    };
    mqToolbar.addEventListener('change', onMqToolbar);

    const tbElMount = document.getElementById('TB');
    const onTbResize = () => {
      const tb = document.getElementById('TB');
      if (!tb) return;
      const pad = !tb.classList.contains('tb--sheet-hidden');
      syncViewsTbPad(pad);
    };
    const tbResizeObs = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onTbResize) : undefined;
    if (tbElMount && tbResizeObs) tbResizeObs.observe(tbElMount);
    window.addEventListener('resize', onTbResize);

    if (cloudSyncAvailable) startCloudBackgroundSync();

    const onExportSync = (ev: Event) => {
      const reason = (ev as CustomEvent<{ reason?: string }>).detail?.reason ?? 'export-output';
      const delayMs = reason === 'node-edit' ? 220 : 380;
      scheduleCloudFlush(reason, delayMs);
    };
    window.addEventListener('plannode-auto-cloud-sync', onExportSync);

    const onModalListSync = () => {
      void syncProjectsForModalList();
    };
    window.addEventListener('plannode-modal-project-list-sync', onModalListSync);

    const onPresencePeersJoined = (ev: Event) => {
      const d = (ev as CustomEvent<{ projectId?: string }>).detail;
      if (!d?.projectId) return;
      const cp = get(currentProject);
      if (!cp || cp.id !== d.projectId) return;
      if (captureNodeSnapshot(cp.id, get(nodes), 'presence_peer')) {
        refreshSnapshotList();
        showPilotToast('다른 편집자가 접속했어. 지금 트리 상태를 버전 히스토리에 남겼어.');
      }
    };
    window.addEventListener('plannode-presence-peers-joined', onPresencePeersJoined);

    const onPilotToast = (ev: Event) => {
      const msg = (ev as CustomEvent<{ message?: string }>).detail?.message;
      if (msg) showPilotToast(msg);
    };
    window.addEventListener('plannode-pilot-toast', onPilotToast);

    let sawHiddenSinceMount = false;
    let sawWindowBlurSinceMount = false;

    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        sawHiddenSinceMount = true;
        if (pilotHasPendingGridPersist()) pilotFlushPersistNow();
        void flushCloudWorkspaceNow('visibility-hidden');
      } else if (document.visibilityState === 'visible' && sawHiddenSinceMount) {
        maybeShowCloudSyncFocusHint();
      }
    };
    document.addEventListener('visibilitychange', onVis);

    const onWinBlur = () => {
      sawWindowBlurSinceMount = true;
    };
    const onWinFocus = () => {
      if (sawWindowBlurSinceMount) maybeShowCloudSyncFocusHint();
    };
    window.addEventListener('blur', onWinBlur);
    window.addEventListener('focus', onWinFocus);

    const onPageHide = () => {
      if (pilotHasPendingGridPersist()) pilotFlushPersistNow();
      void flushCloudWorkspaceNow('pagehide');
    };
    window.addEventListener('pagehide', onPageHide);

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pilotHasPendingGridPersist()) pilotFlushPersistNow();
      const s = get(cloudSyncBadge);
      if (s === 'pending' || s === 'syncing') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      mqToolbar.removeEventListener('change', onMqToolbar);
      tbResizeObs?.disconnect();
      window.removeEventListener('resize', onTbResize);
      stopCloudBackgroundSync();
      window.removeEventListener('plannode-auto-cloud-sync', onExportSync);
      window.removeEventListener('plannode-modal-project-list-sync', onModalListSync);
      window.removeEventListener('plannode-presence-peers-joined', onPresencePeersJoined);
      window.removeEventListener('plannode-node-select', onNodeSelectPresence);
      window.removeEventListener('plannode-pilot-toast', onPilotToast);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onWinBlur);
      window.removeEventListener('focus', onWinFocus);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      pilotReady = false;
      destroy();
    };
  });

  onDestroy(() => {
    disposePrdDraftTimers();
    unsubscribeProjectPresence();
  });

  $: if (pilotReady) pilotSetActiveView($activeView);

  /** NOW-44 / PILOT §9: PRD 탭에서 nodes·프로젝트 변경 시 본문 재생성(읽기 파생) */
  $: if (pilotReady && $activeView === 'prd' && $currentProject) {
    void $nodes;
    void $currentProject;
    pilotRefreshPrdView();
  }
</script>

<svelte:window
  on:pointerdown={onToolbarMenusOutside}
  on:keydown={(e) => {
    if (showAccountModal && e.key === 'Escape') closeAccountModal();
    if (showOutputMenu && e.key === 'Escape') {
      e.preventDefault();
      closeOutputMenu();
    }
    if (showViewMenu && e.key === 'Escape') {
      e.preventDefault();
      closeViewMenu();
    }
    if (showViewportMenu && e.key === 'Escape') {
      e.preventDefault();
      closeViewportMenu();
    }
    if (showPlannodeUpdateModal && e.key === 'Escape') {
      e.preventDefault();
      closePlannodeUpdateModal();
    }
  }}
  on:mousedown={onToolbarMenusOutside}
  on:resize={syncProjectModalScrollHint}
/>

{#if showBadgeImportMappingOverlay}
  <BadgeImportMappingOverlay />
{/if}

<div id="root">
  <!-- SvelteKit 주입 props — 템플릿에서 참조해야 unused export 경고 없음 -->
  <span hidden>{JSON.stringify(data)}{JSON.stringify(params)}</span>
  <div id="R">
    <div
      id="TB"
      class:tb-with-user={!!$authUser}
      class:tb--sheet-hidden={toolbarSheetHidden}
    >
      <div class="tb-main">
        <div class="tb-row-logo">
          <span class="logo">Plannode</span>
          <span class="logo-s">by pseries</span>
          <div class="dv"></div>
        </div>
        <div class="tb-row-project">
          <!-- 제목 롱프레스(1.5초)로 수정 모드 — 영역 밖 터치 시 저장 -->
          <div
            id="TB-PROJ-TITLE"
            class="tb-proj-title-zone"
            on:pointerdown={onToolbarTitleZonePointerDown}
          >
            <span class="tb-proj-label">프로젝트:</span>
            {#if toolbarProjectTitleEditing && $currentProject}
              <input
                bind:this={toolbarTitleInputEl}
                id="PNT"
                class="pntag pntag-input"
                bind:value={toolbarTitleDraft}
                aria-label="프로젝트 이름 편집"
                maxlength={200}
                on:blur={commitToolbarProjectTitle}
                on:keydown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelToolbarProjectTitleEdit();
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    toolbarTitleInputEl?.blur();
                  }
                }}
              />
            {:else}
              <button
                type="button"
                id="PNT"
                class="pntag"
                class:pntag--share-entry={cloudSyncAvailable && !!$currentProject && toolbarCompact}
                disabled={!$currentProject}
                tabindex={cloudSyncAvailable && $currentProject && !toolbarCompact ? -1 : undefined}
                title={cloudSyncAvailable && $currentProject && toolbarCompact
                  ? '프로젝트 공유 · 접근 허용 이메일 관리'
                  : '길게 누르면 이름 수정'}
                on:click={onProjectNameToolbarClickGuarded}
              >
                {$currentProject?.name || '—'}
              </button>
            {/if}
          </div>
          {#if $currentProject && cloudSyncAvailable}
            <button type="button" id="BAC" title="프로젝트 공유 · 접근 허용 이메일 관리" on:click={openAclForCurrentProject}>
              공유
            </button>
          {/if}
          <div class="dv tb-dv-mid"></div>
        </div>
      </div>

      <div class="tbr">
        <div class="tbr-tools">
          <div class="tb-view-wrap" bind:this={viewMenuWrapEl}>
            <button
              type="button"
              class="tb-view-btn"
              aria-haspopup="menu"
              aria-expanded={showViewMenu}
              title="화면 전환 — 정보 구조(IA)와 AI 분석(LLM)은 역할이 다릅니다"
              on:click={() => {
                const next = !showViewMenu;
                showViewMenu = next;
                if (next) {
                  showOutputMenu = false;
                  showViewportMenu = false;
                }
              }}
            >
              <span class="tb-view-label">{viewMenuLabel}</span>
              <span class="tb-view-caret" aria-hidden="true">▾</span>
            </button>
            {#if showViewMenu}
              <div class="tb-view-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  class="tb-view-menu-item"
                  class:tb-view-menu-item--on={$activeView === 'tree'}
                  title={VIEW_MENU_TITLES.tree}
                  on:click={() => pickView('tree')}>노드</button>
                <button
                  type="button"
                  role="menuitem"
                  class="tb-view-menu-item"
                  class:tb-view-menu-item--on={$activeView === 'prd'}
                  title={VIEW_MENU_TITLES.prd}
                  on:click={() => pickView('prd')}>PRD</button>
                <button
                  type="button"
                  role="menuitem"
                  class="tb-view-menu-item"
                  class:tb-view-menu-item--on={$activeView === 'spec'}
                  title={VIEW_MENU_TITLES.spec}
                  on:click={() => pickView('spec')}>기능명세</button>
              <button
                type="button"
                role="menuitem"
                class="tb-view-menu-item"
                class:tb-view-menu-item--on={$activeView === 'ia'}
                title={VIEW_MENU_TITLES.ia}
                on:click={() => pickView('ia')}>정보 구조(IA)</button>
                <button
                  type="button"
                  role="menuitem"
                  class="tb-view-menu-item"
                  class:tb-view-menu-item--on={$activeView === 'ai'}
                  title={VIEW_MENU_TITLES.ai}
                  on:click={() => pickView('ai')}>AI 분석(LLM)</button>
              </div>
            {/if}
          </div>
          <div class="tb-viewport-wrap" bind:this={viewportMenuWrapEl}>
            <button
              type="button"
              class="tb-viewport-btn"
              aria-haspopup="menu"
              aria-expanded={showViewportMenu}
              title="캔버스 맞춤 — 모두보기, 모두접기, 자동정렬"
              on:click={() => {
                const next = !showViewportMenu;
                showViewportMenu = next;
                if (next) {
                  showViewMenu = false;
                  showOutputMenu = false;
                }
              }}
            >
              <span class="tb-viewport-label">캔버스</span>
              <span class="tb-viewport-caret" aria-hidden="true">▾</span>
            </button>
            {#if showViewportMenu}
              <div class="tb-viewport-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  class="tb-viewport-menu-item"
                  title="캔버스를 창 크기에 맞게 맞춤"
                  on:click={() => triggerPilotViewport('BFT')}>모두보기</button>
                <button
                  type="button"
                  role="menuitem"
                  class="tb-viewport-menu-item"
                  title="루트 노드만 표시 후 캔버스를 루트 카드에 맞춤"
                  on:click={() => triggerPilotViewport('BFA')}>모두접기</button>
                <button
                  type="button"
                  role="menuitem"
                  class="tb-viewport-menu-item"
                  title="드래그로 저장된 수동 위치(mx/my) 전부 제거 → 트리 자동 배치"
                  on:click={() => triggerPilotViewport('BAR')}>자동정렬</button>
              </div>
            {/if}
          </div>
        <button type="button" class="tb-undo-btn" title="실행 취소 (Ctrl+Z / ⌘Z)" on:click={() => triggerPilotUndo()}
          >↩</button>
        <button type="button" class="tb-redo-btn" title="다시 실행 (Ctrl+Shift+Z / ⌘⇧Z · Ctrl+Y)" on:click={() => triggerPilotRedo()}
          >↪</button>
        <div class="tb-output-wrap" bind:this={outputMenuWrapEl}>
          <button
            type="button"
            class="tb-output-btn"
            aria-haspopup="menu"
            aria-expanded={showOutputMenu}
            title="기능 맵·PRD·JSON 보내기 + IA/와이어 초안으로 이동"
            on:click={() => {
              const next = !showOutputMenu;
              showOutputMenu = next;
              if (next) {
                showViewMenu = false;
                showViewportMenu = false;
              }
            }}
          >
            <span class="tb-output-label">출력</span>
            <span class="tb-output-caret" aria-hidden="true">▾</span>
          </button>
          {#if showOutputMenu}
            <div class="tb-output-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                class="tb-output-menu-item"
                title={outputFileSlug
                  ? `기능 맵 마크다운 — 저장: ${outputFileSlug}-feature-map.md (PRD F4-1)`
                  : '기능 맵 마크다운 파일로 저장'}
                on:click={() => triggerPilotOutput('BMD')}>MD</button>
              <button
                type="button"
                role="menuitem"
                class="tb-output-menu-item tb-output-menu-item--prd"
                title={outputFileSlug
                  ? `PRD v2.0 구조 마크다운 — 저장: ${outputFileSlug}-prd.md (PRD F4-2)`
                  : 'PRD 표준 가이드 v2.0 구조 마크다운으로 저장'}
                on:click={() => triggerPilotOutput('BPR')}>PRD</button>
              <button
                type="button"
                role="menuitem"
                class="tb-output-menu-item"
                title={outputFileSlug
                  ? `plannode.tree v1 JSON — 저장: ${outputFileSlug}-plannode-tree.json`
                  : '노드 트리 JSON (백업·재가져오기용)'}
                on:click={() => triggerPilotOutput('BJN')}>JSON</button>
              <button
                type="button"
                role="menuitem"
                class="tb-output-menu-item"
                title={outputFileSlug
                  ? `IA 탭으로 이동 후 초안 실행 — 저장 시 권장: ${outputFileSlug}-ia.md (PRD F4-3)`
                  : '정보 구조(IA) 탭으로 이동 후 메뉴·계층 초안 실행 (F2-4)'}
                on:click={() => goIaFromOutput('IA_STRUCTURE')}>정보 구조(IA)</button>
              <button
                type="button"
                role="menuitem"
                class="tb-output-menu-item"
                title={outputFileSlug
                  ? `IA 탭에서 화면 목록 초안 — 저장 시 권장: ${outputFileSlug}-wireframes.md (PRD F4-4)`
                  : 'IA 탭에서 화면 목록·와이어 키트 초안 (F2-4·F4-4 방향)'}
                on:click={() => goIaFromOutput('SCREEN_LIST')}>화면·와이어 목록</button>
            </div>
          {/if}
        </div>
        <div class="pilot-wire-sinks" aria-hidden="true">
          <button type="button" id="BFT" class="pilot-wire-sink" tabindex="-1">모두보기</button>
          <button type="button" id="BFA" class="pilot-wire-sink" tabindex="-1">모두접기</button>
          <button type="button" id="BAR" class="pilot-wire-sink" tabindex="-1">자동정렬</button>
          <button type="button" id="BUN" class="pilot-wire-sink" tabindex="-1">↩ 되돌리기</button>
          <button type="button" id="BRE" class="pilot-wire-sink" tabindex="-1">↪ 다시 실행</button>
          <button type="button" id="BMD" class="pilot-wire-sink" tabindex="-1">MD</button>
          <button type="button" id="BPR" class="pilot-wire-sink" tabindex="-1">PRD</button>
          <button type="button" id="BJN" class="pilot-wire-sink" tabindex="-1">JSON</button>
        </div>
        <div class="dv"></div>
        <button type="button" id="BPN" on:click={() => showProjectModal.set(true)}>+</button>
        </div>
      </div>
      {#if $authUser}
        <button
          type="button"
          class="tb-user-avatar"
          title="계정"
          aria-haspopup="dialog"
          aria-expanded={showAccountModal}
          on:click={() => {
            showAccountModal = true;
            accountPwMsg = '';
          }}
        >
          {#if accountAvatarLetter}
            <span class="tb-user-avatar-letter">{accountAvatarLetter}</span>
          {:else}
            <svg class="tb-user-avatar-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
              />
            </svg>
          {/if}
        </button>
      {/if}
    </div>

    {#if toolbarSheetHidden}
      <button
        type="button"
        class="tb-menu-reveal"
        aria-label="메뉴 보기"
        title="메뉴 보기"
        on:click={expandToolbarSheet}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="36"
          height="36"
          viewBox="0 0 36 36"
          fill="none"
          class="tb-menu-reveal-svg"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M12.7975 2.43327C14.3555 0.875274 16.4686 0 18.6719 0H27.6923C32.2805 0 36 3.71948 36 8.30769V27.6923C36 32.2805 32.2805 36 27.6923 36H8.30769C3.71948 36 0 32.2805 0 27.6923V18.6719C0 16.4686 0.875272 14.3555 2.43327 12.7975L12.7975 2.43327Z"
            fill="#6B61F6"
          />
          <path
            d="M19 7.32574C19 7.32574 19 5.55931 19 2.52966C19 -0.499998 16.5 -0.499998 12.5 2.5C8.50002 5.49999 4.85548 9.87946 2 13C-0.499986 16.5 -0.500014 19 4.85549 19C7.5573 19 8.6551 19 9.05069 19C9.03363 19 9.01651 19 8.99933 19C8.99933 19 9.52075 19 9.05069 19C12.9724 18.9993 13.6233 18.9205 15.1321 18.1339C16.465 17.4389 17.5487 16.33 18.2279 14.966C19 13.4154 19 11.3855 19 7.32574Z"
            fill="#AAA4FF"
          />
          <path
            d="M8.99933 19C8.99933 19 9.52075 19 9.05069 19C9.03363 19 9.01651 19 8.99933 19Z"
            fill="#AAA4FF"
          />
        </svg>
      </button>
    {/if}

    <div
      id="VIEWS"
      class:views-content-below-tb={!toolbarSheetHidden}
      on:pointerdown|capture={onViewsSurfacePointerDownCapture}
    >
      <div class="view" class:active={$activeView === 'tree'} id="V-TREE">
        <div id="CW">
          <div id="CV">
            <svg id="EG"></svg>
            <svg id="SG"></svg>
          </div>
          <div id="ES">
            <div style="font-size:36px;margin-bottom:12px">📋</div>
            <div style="font-size:14px;color:#bbb;margin-bottom:16px">프로젝트를 선택하거나 새로 만들어줘</div>
            <button type="button" id="BNE" on:click={() => showProjectModal.set(true)}>+ 새 프로젝트</button>
          </div>
          <div class="cw-bottom-stack">
            <div class="cw-bottom-bar">
              <div class="zc">
                <button type="button" class="zb" id="ZO">−</button><span class="zp" id="ZP">85%</span><button type="button" class="zb" id="ZI">+</button><span
                  class="zc-hint"
                  >축소확대: Ctrl+스크롤</span
                ><span class="zc-hint">그룹이동: Shift+노드</span><span class="zc-hint" title="노드 1.5초: 카드가 따라 움직이며 다른 노드 + 근처에 놓기 · + 1.5초: 직속 하위 카드만 같이 이동(앵커 유지)"
                  >상위바꿈: 노드 1.5초 드래그 / + 1.5초 하위만</span
                >
              </div>
              {#if $currentProject}
                <button
                  type="button"
                  class="cw-snapshot-hist-btn"
                  title="워크스페이스 되돌리기 — 병합·가져오기 등 직전에 저장된 노드 목록으로 복원합니다. 상단 「되돌리기」(Ctrl+Z)는 같은 세션 안 캔버스 편집만 되돌립니다."
                  on:click={() => {
                    refreshSnapshotList();
                    showSnapshotHistoryModal = true;
                  }}
                >
                  히스토리
                </button>
              {/if}
              <button
                type="button"
                class="cw-release-note-btn"
                title="릴리스 노트 — 버전별 변경·기능 보완 요약"
                aria-label="Release note — 릴리스 노트 열기"
                on:click={openPlannodeUpdateModal}
              >
                Release
              </button>
              {#if $currentProject && postLogoutOpenPair && postLogoutOpenPair.projectId === $currentProject.id}
                <div
                  class="cw-postlogout-toggle"
                  role="group"
                  aria-label="로그아웃 직전 저장본과 최신 열기 전환"
                >
                  <button
                    type="button"
                    class="cw-snapshot-hist-btn"
                    title="로그아웃 직전에 저장된 트리로 바꿉니다."
                    disabled={!postLogoutOpenPair.atLatest}
                    on:click={postLogoutOpenToLogoutTree}
                  >
                    실행 취소
                  </button>
                  <button
                    type="button"
                    class="cw-snapshot-hist-btn"
                    title="최신(클라우드·로컬 병합)으로 열었던 트리로 다시 돌아갑니다."
                    disabled={postLogoutOpenPair.atLatest}
                    on:click={postLogoutOpenToLatestTree}
                  >
                    다시 실행
                  </button>
                </div>
              {/if}
              {#if cloudSyncAvailable && $currentProject}
                <div
                  class="cw-presence"
                  role="group"
                  aria-label="이 프로젝트에 동시 접속 중인 허용 계정(표시 최대 5명)"
                >
                  {#each $projectPresencePeers as peer (peer.user_id)}
                    <button
                      type="button"
                      class="cw-presence-avatar"
                      class:cw-presence-avatar--on={$projectPresenceSelectedEmail === peer.email}
                      title="클릭하면 이메일 표시"
                      aria-pressed={$projectPresenceSelectedEmail === peer.email}
                      on:click={() => toggleProjectPresencePeerEmail(peer.email)}
                    >
                      <span class="cw-presence-letter">{presenceAvatarLetter(peer.email)}</span>
                    </button>
                  {/each}
                  {#if $projectPresencePeersOverflow > 0}
                    <span class="cw-presence-overflow" title="동시 접속 표시 상한(5명)을 넘은 계정"
                      >+{$projectPresencePeersOverflow}</span
                    >
                  {/if}
                  {#if $projectPresenceSelectedEmail}
                    <span class="cw-presence-email" title={$projectPresenceSelectedEmail}>{$projectPresenceSelectedEmail}</span>
                  {/if}
                </div>
              {/if}
            </div>
            <div class="cw-mm-cluster">
              {#if cloudSyncAvailable}
                <span
                  class="sync-badge sync-badge--cw"
                  class:sb-s={$cloudSyncBadge === 'synced'}
                  class:sb-p={$cloudSyncBadge === 'pending'}
                  class:sb-g={$cloudSyncBadge === 'syncing'}
                  class:sb-f={$cloudSyncBadge === 'failed'}
                  title={$cloudSyncBadge === 'synced'
                    ? '로컬 저장됨 · 클라우드와 맞춤됨 · 약 30초마다 자동 양방향 동기화(저장·다른 기기·공유 프로젝트 반영)'
                    : $cloudSyncBadge === 'pending'
                      ? '로컬 변경 있음 · 곧 자동 업로드'
                      : $cloudSyncBadge === 'syncing'
                        ? '클라우드 업로드·동기화 중'
                        : '클라우드 동기화 실패 — 네트워크 확인 후 잠시 뒤 자동 재시도'}
                >
                  {#if $cloudSyncBadge === 'synced'}
                    저장됨
                  {:else if $cloudSyncBadge === 'pending'}
                    동기화 대기
                  {:else if $cloudSyncBadge === 'syncing'}
                    동기화 중…
                  {:else}
                    실패
                  {/if}
                </span>
              {/if}
              <div class="mm">
                <canvas id="MMC"></canvas>
                <div class="mmvp" id="MMV"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="view" class:active={$activeView === 'prd'} id="V-PRD">
        <div class="prd-header">
          <div class="prd-header-row">
            <div class="prd-title" id="prd-title">PRD 문서</div>
            <button
              type="button"
              class="prd-l1-copy-btn"
              title="OutputIntent.PRD + L1 컨텍스트 + 핵심 PRD 요약 절(노드 추출) — AI 보완용 클립보드"
              on:click={() => pilotCopyPrdL1CoreSummaryPrompt()}>L1·핵심요약 복사</button>
          </div>
          <div class="prd-meta" id="prd-meta"></div>
          <p class="prd-version-line" id="prd-version-line"></p>
        </div>
        {#each PRD_BLOCKS as b (b.key)}
          <div class="prd-section">
            <h2>{b.title}</h2>
            <p class="prd-section-hint">{b.hint}</p>
            {#if $currentProject}
              {#if prdAuto}
                <div class="prd-edit-toolbar">
                  <button
                    type="button"
                    class="prd-sec-reset"
                    on:click={() => revertPrdSectionDraft(b.key)}>노드 초안으로</button>
                  <span class="prd-save-hint">편집 내용 자동 저장 · 다운로드 PRD에 반영</span>
                </div>
                <textarea
                  class="prd-section-editor"
                  rows="14"
                  spellcheck="false"
                  aria-label={`${b.title} 마크다운 편집`}
                  value={prdText[b.key]}
                  on:input={(e) => {
                    prdText = { ...prdText, [b.key]: e.currentTarget.value };
                    schedulePrdDraftSave(b.key);
                  }}
                />
              {:else}
                <div class="prd-body">
                  <p class="prd-empty">PRD 본문을 나눌 수 없어요. 새로고침 후에도 같으면 알려 주세요.</p>
                </div>
              {/if}
            {:else}
              <div class="prd-body">
                <p class="prd-empty">프로젝트를 먼저 열어줘.</p>
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <div class="view" class:active={$activeView === 'spec'} id="V-SPEC">
        <div class="spec-inner">
          <header class="spec-header" aria-label="기능명세 상단">
            <div class="spec-header-main">
              <div class="spec-title">기능명세서</div>
              <p class="spec-hint">엑셀형 스프레드시트 · v3 FUNCTIONAL_SPEC — 기능ID·기능명·설명은 트리 SSoT; 사용자유형·입출력·예외·우선순위는 기획·요구 서술용 메타(`functionalSpec`). 배지는 DEV·UX·PRJ 파이프라인만 표시.</p>
              <p class="spec-toolbar-note">
                트리·캔버스와 동일 노드가 반영돼요. 탭을 바꿀 때 기능명세 셀 편집분은 곧바로 저장 경로로 넘어가요. AI용 트리
                텍스트(<code>buildTreeText</code>)는 번호·이름·배지 중심이고, 그리드에만 있는 값은 IA/기능정의서 프롬프트에
                별도 블록으로 붙어요.
              </p>
            </div>
            <div class="spec-header-actions" role="toolbar" aria-label="기능명세 내보내기">
              <button type="button" class="spec-dl-btn" on:click={() => pilotExportSpecSheetCsv()}>
                엑셀용 CSV 다운로드
              </button>
            </div>
          </header>
          <div class="spec-sheet-scroll" role="region" aria-label="기능명세 표">
            <table class="spec-sheet-table">
              <colgroup>
                <col class="spec-col spec-col--id" />
                <col class="spec-col spec-col--depth" />
                <col class="spec-col spec-col--name" />
                <col class="spec-col spec-col--desc" />
                <col class="spec-col spec-col--short" />
                <col class="spec-col spec-col--short" />
                <col class="spec-col spec-col--short" />
                <col class="spec-col spec-col--prio" />
                <col class="spec-col spec-col--badge" />
              </colgroup>
              <thead>
                <tr>
                  <th class="spec-sheet-th">기능ID</th>
                  <th class="spec-sheet-th">뎁스</th>
                  <th class="spec-sheet-th">기능명</th>
                  <th class="spec-sheet-th">설명</th>
                  <th class="spec-sheet-th">사용자유형</th>
                  <th class="spec-sheet-th">입출력</th>
                  <th class="spec-sheet-th">예외</th>
                  <th class="spec-sheet-th">우선순위</th>
                  <th class="spec-sheet-th spec-sheet-th--badge">3트랙 배지</th>
                </tr>
              </thead>
              <tbody id="spec-tbody">
                <tr class="spec-sheet-row spec-sheet-row--empty">
                  <td class="spec-sheet-td spec-sheet-td--empty" colspan="9">프로젝트를 열면 자동 생성돼.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="view" class:active={$activeView === 'ia'} id="V-IA">
        <div class="ia-view-inner">
          <IAGridSheet />
          <IAExportMenu />
        </div>
      </div>

      <div class="view" class:active={$activeView === 'ai'} id="V-AI">
        <div class="ai-inner">
          <div class="ai-title">AI 분석(LLM)</div>
          <div class="ai-sub">현재 기능 트리를 바탕으로 <strong>LLM</strong> 프롬프트·답을 만듭니다. 내비·화면 구조 문서는 <strong>정보 구조(IA)</strong> 탭이에요.</div>
          <div class="ai-impl-hint" aria-live="polite">
            {#if $authLoading}
              <p class="ai-impl-hint__line">로그인 여부 확인 중…</p>
            {:else if !cloudSyncAvailable}
              <p class="ai-impl-hint__line">
                <strong>지금 모드</strong> · 클라우드 연결이 꺼져 있어, 아래는 <em>이 컴퓨터에서만</em> 만든 «복사용 글(프롬프트)»이에요. 다른 AI(챗GPT 등)에 붙여넣어 쓰면 돼요.
              </p>
            {:else if $authUser}
              <p class="ai-impl-hint__line">
                <strong>지금 모드</strong> · 로그인됨. 서버에 AI 키가 있으면 <em>자동으로 AI(클로드) 답</em>이 아래에 뜨고, 없으면 «복사용 프롬프트»만 떠요.
              </p>
            {:else}
              <p class="ai-impl-hint__line">
                <strong>지금 모드</strong> · 로그인 전. 누르면 <em>복사용 글(프롬프트)</em>만 나와요. 위에서 로그인하면 서버를 거쳐 AI 답을 받을 수 있어요.
              </p>
            {/if}
          </div>
          <div class="ai-btn-grid">
            <button type="button" class="ai-btn" id="ai-prd">
              <div class="ai-btn-icon">📄</div>
              <div class="ai-btn-title">PRD 완성본 생성</div>
              <div class="ai-btn-desc">기능 트리 → 완전한 PRD 문서</div>
            </button>
            <button type="button" class="ai-btn" id="ai-wireframe" title="F2-5 LLM — IA 탭의 구조 산출과 별개">
              <div class="ai-btn-icon">🖼</div>
              <div class="ai-btn-title">와이어·화면 (LLM)</div>
              <div class="ai-btn-desc">UX·화면 흐름용 프롬프트 — 골격은 트리·IA 탭이 우선이에요</div>
            </button>
            <button type="button" class="ai-btn" id="ai-miss">
              <div class="ai-btn-icon">🔍</div>
              <div class="ai-btn-title">누락 기능 탐지</div>
              <div class="ai-btn-desc">현재 트리에서 빠진 기능 분석</div>
            </button>
            <button type="button" class="ai-btn" id="ai-tdd">
              <div class="ai-btn-icon">⚡</div>
              <div class="ai-btn-title">TDD 우선순위</div>
              <div class="ai-btn-desc">P0/P1/P2 테스트 케이스 정리</div>
            </button>
            <button type="button" class="ai-btn" id="ai-harness">
              <div class="ai-btn-icon">🔧</div>
              <div class="ai-btn-title">하네스 플랜 생성</div>
              <div class="ai-btn-desc">Cursor AI 하네스 워크플로우 출력</div>
            </button>
          </div>
          <div class="ai-result-toolbar" id="ai-result-toolbar" aria-hidden="true">
            <span class="ai-result-label">생성된 프롬프트</span>
            <button type="button" class="ai-copy-btn" id="ai-copy">클립보드에 복사</button>
          </div>
          <div class="ai-result" id="ai-result"></div>
        </div>
      </div>
    </div>

    <div id="CTX"></div>
    <div class="tst" id="TST" style="display:none"></div>

    <div id="PM" style="display:none" aria-hidden="true"></div>

    {#if $showAclModal && $aclModalProject}
      <ProjectAclModal project={$aclModalProject} onToast={showPilotToast} />
    {/if}

    {#if showAccountModal}
      <div class="acct-wrap" role="dialog" aria-modal="true" aria-labelledby="acct-title">
        <div class="acct-backdrop" role="presentation" on:click={closeAccountModal}></div>
        <div class="acct-sheet">
          <h3 id="acct-title" class="acct-title">계정</h3>
          <div class="acct-row">
            <span class="acct-label">로그인 이메일</span>
            <div class="acct-email" title={accountEmailDisplay}>{accountEmailDisplay}</div>
          </div>
          <div class="acct-divider"></div>
          <div class="acct-row">
            <span class="acct-label">비밀번호 변경</span>
            <input
              class="acct-input"
              type="password"
              autocomplete="new-password"
              placeholder="새 비밀번호 (6자 이상)"
              bind:value={accountPw1}
              disabled={accountPwBusy}
            />
            <input
              class="acct-input"
              type="password"
              autocomplete="new-password"
              placeholder="새 비밀번호 확인"
              bind:value={accountPw2}
              disabled={accountPwBusy}
            />
            {#if accountPwMsg}
              <p class="acct-err">{accountPwMsg}</p>
            {/if}
            <button
              type="button"
              class="acct-btn acct-btn-primary"
              disabled={accountPwBusy}
              on:click={() => void submitAccountPasswordChange()}
            >
              {accountPwBusy ? '처리 중…' : '비밀번호 변경'}
            </button>
            <p class="acct-hint">소셜 로그인만 쓰는 계정은 비밀번호가 없을 수 있어.</p>
          </div>
          <div class="acct-divider"></div>
          <button type="button" class="acct-btn acct-btn-danger" on:click={() => void handleLogoutFromAccountMenu()}>
            로그아웃
          </button>
          <button type="button" class="acct-btn acct-btn-ghost" on:click={closeAccountModal}>닫기</button>
        </div>
      </div>
    {/if}

    {#if showBadgePoolModal}
      <StandardBadgePoolModal
        on:close={() => (showBadgePoolModal = false)}
        on:saved={() => showPilotToast('표준 배지 풀을 저장했어. 노드 편집·가져오기에 바로 반영돼.')}
      />
    {/if}

    {#if showPlannodeUpdateModal}
      <div class="mbg" role="presentation" on:click|self={closePlannodeUpdateModal}>
        <div class="mo mo-wide upd-log-modal" role="dialog" aria-modal="true" aria-labelledby="rel-note-title">
          <div class="pm-proj-head">
            <h3 id="rel-note-title" style="margin:0">Release note</h3>
            <button type="button" class="mcl" on:click={closePlannodeUpdateModal}>✕</button>
          </div>
          <p class="upd-log-hint">최신순 릴리스 노트예요. 카드를 누르면 기능 보완 설명이 펼쳐져요.</p>
          <ul class="upd-log-list">
            {#each updateLogRows as row (row.id)}
              <li class="upd-log-card">
                <button
                  type="button"
                  class="upd-log-card-head"
                  aria-expanded={updateLogOpenId === row.id}
                  aria-controls="upd-log-body-{row.id}"
                  id="upd-log-head-{row.id}"
                  on:click={() => toggleUpdateLogAccordion(row.id)}
                >
                  <span class="upd-log-card-meta">{row.at}</span>
                  <span class="upd-log-card-title">{row.title}</span>
                  <span class="upd-log-chev" aria-hidden="true">{updateLogOpenId === row.id ? '▾' : '▸'}</span>
                </button>
                {#if updateLogOpenId === row.id}
                  <div
                    class="upd-log-card-body"
                    id="upd-log-body-{row.id}"
                    role="region"
                    aria-labelledby="upd-log-head-{row.id}"
                  >
                    {row.body}
                  </div>
                {/if}
              </li>
            {:else}
              <li class="upd-log-empty">등록된 업데이트가 아직 없어요.</li>
            {/each}
          </ul>
        </div>
      </div>
    {/if}

    {#if showSnapshotHistoryModal && $currentProject}
      <div class="mbg" role="presentation" on:click|self={() => (showSnapshotHistoryModal = false)}>
        <div class="mo mo-wide snap-hist-modal" role="dialog" aria-modal="true" aria-labelledby="snap-hist-title">
          <div class="pm-proj-head">
            <h3 id="snap-hist-title" style="margin:0">워크스페이스 히스토리 (로컬)</h3>
            <button type="button" class="mcl" on:click={() => (showSnapshotHistoryModal = false)}>✕</button>
          </div>
          <p class="snap-hist-hint">
            클라우드 병합·파일 가져오기 직전에 자동으로 저장된 노드 목록입니다. 한 항목을 선택해 <strong>트리 전체를 그 시점으로 복원</strong>할 수
            있어요. 상단 「되돌리기」(Ctrl+Z)는 <strong>현재 세션 안에서의 캔버스 편집만</strong> 되돌립니다.
          </p>
          <div class="snap-hist-actions">
            <button type="button" class="bcr" on:click={onManualNodeSnapshot}>지금 상태 스냅샷 남기기</button>
          </div>
          <ul class="snap-hist-list">
            {#each snapshotRows as s (s.id)}
              <li class="snap-hist-item">
                <div class="snap-hist-row-top">
                  {new Date(s.at).toLocaleString()} · {formatSnapshotReason(s.reason)}
                </div>
                <div class="snap-hist-row-sub">{snapshotDiffLine(s)}</div>
                <button type="button" class="bcr snap-hist-restore-btn" on:click={() => void restoreSnapshotToWorkspace(s)}>
                  이 스냅으로 트리 복원
                </button>
              </li>
            {:else}
              <li class="snap-hist-empty">아직 스냅샷이 없어. 다른 편집자 접속·클라우드 병합·파일 덮어쓰기 등이 일어나거나 위 버튼으로 남길 수 있어.</li>
            {/each}
          </ul>
        </div>
      </div>
    {/if}

    {#if $showProjectModal}
      <div class="mbg" role="presentation" on:click|self={closeModal}>
        <div class="mo mo-wide pm-scroll pm-proj-shell">
          <div class="pm-proj-head">
            <h3 style="margin:0">프로젝트 관리</h3>
            <button type="button" class="mcl" on:click={closeModal}>✕</button>
          </div>
          <div
            class="pm-proj-body"
            bind:this={projectModalEl}
            on:scroll={syncProjectModalScrollHint}
          >
          <div class="proj-form-col">
            <input
              class="fi"
              bind:value={projectName}
              placeholder="프로젝트 이름 *"
              aria-label="프로젝트 이름"
            />
            <input
              class="fi"
              bind:value={projectAuthor}
              placeholder="작성자 *"
              aria-label="작성자"
            />
            <div class="fg fg-dates">
              <input
                class="fi proj-date-input"
                type="date"
                bind:value={projectStart}
                placeholder="시작일"
                aria-label="시작일"
              />
              <input
                class="fi proj-date-input"
                type="date"
                bind:value={projectEnd}
                placeholder="종료일"
                aria-label="종료일"
              />
            </div>
            <label class="proj-req-label" for="proj-req-detail">프로젝트 요구사항 상세입력</label>
            <textarea
              id="proj-req-detail"
              class="fi proj-req-textarea"
              bind:value={projectDesc}
              rows="5"
              style="resize:vertical;min-height:10rem"
              placeholder="목적·기능·제약 등(선택). 클라우드에 로그인된 경우 같은 「생성」으로 AI 트리 초안을 시도해요."
              aria-label="프로젝트 요구사항 상세입력"
              autocomplete="off"
              autocorrect="off"
              spellcheck="true"
            ></textarea>
            <div class="proj-layout-row" role="group" aria-label="새 프로젝트 노드맵 배치">
              <button
                type="button"
                class="nm-create-opt"
                class:nm-create-opt--on={nodeMapLayoutDefaultForCreate === 'right'}
                on:click={() => {
                  nodeMapLayoutDefaultForCreate = 'right';
                  writeNodeMapLayoutCreateDefault('right');
                }}
              >
                우측분포 보기
              </button>
              <button
                type="button"
                class="nm-create-opt"
                class:nm-create-opt--on={nodeMapLayoutDefaultForCreate === 'topdown'}
                on:click={() => {
                  nodeMapLayoutDefaultForCreate = 'topdown';
                  writeNodeMapLayoutCreateDefault('topdown');
                }}
              >
                하위분포 보기
              </button>
            </div>
            <div class="proj-badge-model-row" role="group" aria-label="배지·API 설정">
              <button
                type="button"
                class="bcr bcr-badge-settings"
                id="BBS"
                on:click={() => (showBadgePoolModal = true)}
              >
                표준 배지 설정
              </button>
              <button
                type="button"
                class="bcr bcr-model-api"
                id="BMA"
                on:click={openModelApiModal}
              >
                모델API 등록
              </button>
            </div>
            <button
              type="button"
              class="bcr bcr-create-project"
              disabled={projectCreateBusy}
              on:click={handleProjectCreate}
            >
              {projectCreateBusy ? '처리 중…' : '+ 프로젝트 생성'}
            </button>
            <div class="proj-json-import">
              <input
                bind:this={jsonImportInput}
                type="file"
                accept="application/json,.json,text/markdown,.md,.markdown,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
                class="json-import-input"
                aria-hidden="true"
                tabindex="-1"
                on:change={handleJsonImportChange}
              />
              <button
                type="button"
                id="BJI"
                class="proj-json-import-btn"
                title={PLANNODE_TREE_IMPORT_BJI_TITLE}
                aria-label={PLANNODE_TREE_IMPORT_BJI_ARIA_LABEL}
                on:click={triggerJsonImport}
              >
                가져오기
              </button>
              {#if projectImportError}
                <p class="proj-import-err" role="alert">{projectImportError}</p>
              {/if}
            </div>
          </div>
          <div class="pl">
            <div class="plt" id="PLT">이 기기의 프로젝트</div>
            {#if aclInvitesErr}
              <p class="acl-err">{aclInvitesErr}</p>
            {/if}
            <div id="PLC" data-svelte-managed="1">
              {#each (projectsForModal === null ? $projects : projectsForModal) as proj (proj.id)}
                <div class="prow">
                  <div
                    class="pcard"
                    class:pcard-acp={$currentProject?.id === proj.id}
                    class:pcard-shared={aclProjectIdSet.has(proj.id)}
                  >
                    {#if canShowProjectDelete(proj)}
                      <button
                        type="button"
                        class="pdl"
                        title={`「${proj.name}」 삭제`}
                        aria-label={`「${proj.name}」 삭제`}
                        disabled={deletingProjectId === proj.id}
                        on:click|stopPropagation={() => void handleDeleteProjectCard(proj)}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="27"
                          height="28"
                          viewBox="0 0 27 28"
                          fill="none"
                          class="pdl-svg"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <ellipse cx="13.4485" cy="14" rx="13.4485" ry="14" fill="#FF6969" />
                          <path
                            d="M17.2909 14L9.60606 14"
                            stroke="white"
                            stroke-width="3"
                            stroke-linecap="round"
                          />
                        </svg>
                      </button>
                    {/if}
                    <div
                      class="pc"
                      role="button"
                      tabindex="0"
                      aria-label={`프로젝트 「${proj.name}」 열기`}
                      on:click={(e) => {
                        if (modalSuppressNextPcClick) {
                          e.preventDefault();
                          e.stopPropagation();
                          modalSuppressNextPcClick = false;
                          return;
                        }
                        void handleProjectSelect(proj);
                      }}
                      on:keydown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        if (modalSuppressNextPcClick) {
                          modalSuppressNextPcClick = false;
                          return;
                        }
                        void handleProjectSelect(proj);
                      }}
                    >
                      <div class="pi" style:background={$currentProject?.id === proj.id ? '#631EED' : '#ede9fe'}>📁</div>
                      <div class="pif">
                        <div class="pm-title-wrap" data-pm-title-pid={proj.id}>
                          {#if modalEditingProjectId === proj.id}
                            <input
                              bind:this={modalCardTitleInputEl}
                              class="pn2 pn-edit-input"
                              bind:value={modalEditingDraft}
                              aria-label={`「${proj.name}」 이름 편집`}
                              maxlength={200}
                              on:blur={commitModalProjectTitle}
                              on:pointerdown|stopPropagation
                              on:click|stopPropagation
                              on:keydown={(e) => {
                                if (e.key === 'Escape') {
                                  e.preventDefault();
                                  cancelModalProjectTitleEdit();
                                } else if (e.key === 'Enter') {
                                  e.preventDefault();
                                  modalCardTitleInputEl?.blur();
                                }
                              }}
                            />
                          {:else}
                            <div
                              class="pn2 pm-card-title-hit"
                              title="길게 누르면 이름 수정"
                              on:pointerdown={(ev) => onModalCardTitlePointerDown(ev, proj)}
                            >
                              {proj.name}
                            </div>
                          {/if}
                        </div>
                        <div class="pm2">{proj.author}{aclProjectIdSet.has(proj.id) ? ' · 접근 허용됨' : ''}</div>
                      </div>
                      {#if $currentProject?.id === proj.id}
                        <span class="ct">현재</span>
                      {/if}
                    </div>
                    {#if cloudSyncAvailable}
                      <button
                        type="button"
                        class="pacl"
                        title={`「${proj.name}」 접근 허용 · 이메일 설정`}
                        aria-label={`「${proj.name}」 접근 허용 이메일 설정`}
                        on:click|stopPropagation={() => openAclForProject(proj)}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="36"
                          height="36"
                          viewBox="0 0 36 36"
                          fill="none"
                          class="pacl-svg"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path
                            fill-rule="evenodd"
                            clip-rule="evenodd"
                            d="M18 0C27.9411 0 36 8.05887 36 18C36 27.9411 27.9411 36 18 36C8.05887 36 0 27.9411 0 18C0 8.05887 8.05887 0 18 0ZM12.9463 13C10.2018 13 8 15.2514 8 18C8 20.7486 10.2018 23 12.9463 23H16C16.5523 23 17 22.5523 17 22C17 21.4477 16.5523 21 16 21H12.9463C11.3319 21 10 19.6697 10 18C10 16.3303 11.3319 15 12.9463 15H16C16.5523 15 17 14.5523 17 14C17 13.4477 16.5523 13 16 13H12.9463ZM20 13C19.4477 13 19 13.4477 19 14C19 14.5523 19.4477 15 20 15H23.0537C24.6681 15.0001 26 16.3304 26 18C26 19.6696 24.6681 20.9999 23.0537 21H20C19.4477 21 19 21.4477 19 22C19 22.5523 19.4477 23 20 23H23.0537C25.7981 22.9999 28 20.7486 28 18C28 15.2514 25.7981 13.0001 23.0537 13H20ZM16 17C15.4477 17 15 17.4477 15 18C15 18.5523 15.4477 19 16 19H20C20.5523 19 21 18.5523 21 18C21 17.4477 20.5523 17 20 17H16Z"
                            fill="#00A1FF"
                          />
                        </svg>
                      </button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
          {#if cloudSyncAvailable && invitedRemoteOnly.length > 0}
            <div class="pl inv-panel">
              <div class="plt">초대·접근 허용 (클라우드, 아직 이 기기에 없음)</div>
              <p class="inv-hint">동료가 이메일로 너를 등록했어. 불러오면 이 기기 목록에 합쳐져. (소유자가 클라우드에 반영한 데이터가 있어야 해)</p>
              {#each invitedRemoteOnly as inv}
                <div class="inv-row">
                  <div class="inv-row-top">
                    <div class="inv-meta">
                      <span class="inv-pid">{inv.project_id}</span>
                      {#if inv.is_owner}
                        <span class="inv-tag">소유자</span>
                      {:else}
                        <span class="inv-tag g">멤버</span>
                      {/if}
                    </div>
                    <button
                      type="button"
                      class="bcr sm inv-load"
                      disabled={aclImportBusyKey === `${inv.workspace_source_user_id ?? ''}:${inv.project_id}` ||
                        !inv.workspace_source_user_id}
                      on:click={() => void handleImportInvited(inv)}
                    >
                      {aclImportBusyKey === `${inv.workspace_source_user_id ?? ''}:${inv.project_id}`
                        ? '불러오는 중…'
                        : '클라우드에서 불러오기'}
                    </button>
                  </div>
                  {#if !inv.workspace_source_user_id}
                    <p class="inv-warn">
                      클라우드 연결 정보(workspace)가 비어 있어. 소유자는 Supabase에서
                      <code class="inv-code">docs/supabase/plannode_acl_repair_workspace_source.sql</code>
                      실행 후, 이 창을 닫았다가 다시 열어줘.
                    </p>
                  {/if}
                </div>
              {/each}
            </div>
          {:else if cloudSyncAvailable && !aclInvitesErr && aclInviteRows.length === 0}
            <p class="inv-hint inv-hint-muted">
              다른 계정에서 이 이메일로 초대받았는데 여기 안 보이면: 로그인 이메일이 접근 목록과 같은지 확인하고, Supabase에
              <code class="inv-code">plannode_project_acl.sql</code>이 적용됐는지 확인해줘.
            </p>
          {/if}
          </div>
          {#if projectModalScrollHint}
            <div class="pm-scroll-hint-wrap">
              <button
                type="button"
                class="pm-scroll-hint-btn"
                aria-label="아래로 더 보기"
                on:click={scrollProjectModalDown}
              >
                <svg
                  class="pm-scroll-hint-ico"
                  xmlns="http://www.w3.org/2000/svg"
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M7 10l5 5 5-5"
                    stroke="currentColor"
                    stroke-width="2.2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    {#if showModelApiModal}
      <div class="mbg" role="presentation" on:click|self={() => (showModelApiModal = false)}>
        <div
          class="mo mo-wide model-api-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="model-api-title"
        >
          <div class="pm-proj-head">
            <h3 id="model-api-title" style="margin:0">모델 API 등록</h3>
            <button type="button" class="mcl" on:click={() => (showModelApiModal = false)}>✕</button>
          </div>
          <div class="model-api-body">
            <p class="model-api-warn">
              이 브라우저에만 저장돼. XSS나 남의 기기에서는 노출될 수 있어—공용 PC에서는 저장하지 마.
            </p>
            {#if hasStoredAnthropicKey}
              <p class="model-api-status">저장된 키가 있어. 아래에 새로 넣으면 덮어써.</p>
            {/if}
            <label class="model-api-label" for="model-api-key-input">Anthropic API 키</label>
            <input
              id="model-api-key-input"
              class="fi model-api-input"
              type="password"
              bind:value={modelApiKeyDraft}
              autocomplete="off"
              autocorrect="off"
              spellcheck="false"
              placeholder="sk-ant-api03-…"
              aria-label="Anthropic API 키"
            />
            <div class="model-api-actions">
              <button type="button" class="bcr" on:click={saveModelApiKey}>저장</button>
              <button type="button" class="bcr bcr-model-api-clear" on:click={clearModelApiKey}>지우기</button>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(html),
  :global(body) {
    width: 100%;
    height: 100%;
    background: #f5f5f0;
  }

  #root {
    width: 100vw;
    height: 100vh;
    font-family:
      'Pretendard',
      'Noto Sans KR',
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
  }

  #R {
    width: 100%;
    height: 100%;
    background: #f5f5f0;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  }

  #TB {
    --tb-user-avatar-size: 48px;
    --tb-user-avatar-gap: 12px;
    --tb-user-avatar-edge: 14px;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    width: 100%;
    min-height: 52px;
    /* 반투명 화이트 — #R 위에 겹침, 그림자·하단 구분선 없음 */
    background: rgba(255, 255, 255, 0.74);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    align-content: flex-start;
    padding: 8px 14px;
    gap: 8px 10px;
    row-gap: 10px;
    z-index: 50;
    overflow: visible;
    transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
    will-change: transform;
    /* 빈 영역은 캔버스로 클릭 통과; 자식(버튼·메뉴 등)은 유지 */
    pointer-events: none;
  }

  #TB.tb--sheet-hidden {
    transform: translateY(calc(-100% - 4px));
  }

  #TB * {
    pointer-events: auto;
  }

  #TB .pilot-wire-sinks,
  #TB .pilot-wire-sinks * {
    pointer-events: none;
  }

  #TB.tb-with-user {
    padding-right: calc(
      var(--tb-user-avatar-edge) + var(--tb-user-avatar-size) + var(--tb-user-avatar-gap)
    );
  }

  @media (max-width: 900px) {
    #TB {
      --tb-user-avatar-size: 56px;
    }
  }

  .tb-menu-reveal {
    position: fixed;
    z-index: 55;
    top: calc(10px + env(safe-area-inset-top, 0px));
    left: auto;
    right: calc(14px + env(safe-area-inset-right, 0px));
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    padding: 0;
    margin: 0;
    border: none;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.92);
    box-shadow: 0 4px 18px rgba(45, 35, 120, 0.18);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .tb-menu-reveal:focus-visible {
    outline: 2px solid #631EED;
    outline-offset: 3px;
  }

  .tb-menu-reveal:active {
    transform: scale(0.96);
  }

  .tb-menu-reveal-svg {
    display: block;
    width: 36px;
    height: 36px;
  }

  .tb-main {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    flex: 1 1 auto;
    min-width: 0;
  }

  /* PC: 로고 단독 1행, 그 아래 프로젝트 행 — 뷰·도구는 tbr-tools 한 줄 */
  @media (min-width: 901px) {
    .tb-main {
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 10px;
    }

    .tb-row-logo {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      flex: 1 1 100%;
      width: 100%;
      min-width: 0;
    }

    .tb-row-project {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      /* 남은 폭을 먹지 않음 — 뷰 드롭다운이 프로젝트 바로 옆·좌측 정렬 */
      flex: 0 1 auto;
      min-width: 0;
    }

    .tb-row-project .pntag {
      max-width: none;
    }
  }

  @media (max-width: 900px) {
    .tb-main {
      flex-direction: column;
      align-items: stretch;
      gap: 6px 8px;
    }

    .tb-row-logo {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      width: 100%;
    }

    .tb-row-project {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      width: 100%;
    }

    .tb-row-project .pntag {
      max-width: none;
      flex: 1 1 auto;
      min-width: 0;
    }
  }

  .tb-proj-label {
    font-size: 11px;
    color: #aaa;
    white-space: nowrap;
  }

  /* 좁은 화면에서 구분선 숨김(줄바꿈 시 중복 느낌 완화) */
  @media (max-width: 900px) {
    .tb-dv-mid {
      display: none;
    }
  }

  .logo {
    font-size: 13px;
    font-weight: 700;
    color: #631EED;
    white-space: nowrap;
  }

  .logo-s {
    font-size: 10px;
    color: #bbb;
    margin-left: 2px;
  }

  .dv {
    width: 1px;
    height: 22px;
    background: #e0dbd4;
    flex-shrink: 0;
  }

  .tb-proj-title-zone {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-width: 0;
    touch-action: manipulation;
  }

  .pntag {
    font-size: 12px;
    font-weight: 600;
    color: #1a1a1a;
    max-width: 130px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  input.pntag.pntag-input {
    appearance: none;
    margin: 0;
    padding: 2px 6px;
    border: 1px solid #c4b8f8;
    border-radius: 8px;
    background: #fff;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    color: #1a1a1a;
    max-width: min(220px, 46vw);
    min-width: 96px;
    box-sizing: border-box;
  }

  input.pntag.pntag-input:focus {
    outline: 2px solid #631EED;
    outline-offset: 1px;
  }

  button#PNT.pntag {
    appearance: none;
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    font: inherit;
    text-align: left;
    color: inherit;
  }

  button#PNT.pntag:disabled {
    opacity: 1;
    cursor: default;
  }

  button#PNT.pntag.pntag--share-entry {
    cursor: pointer;
    color: #4a3a9e;
  }

  @media (max-width: 900px) {
    #BAC {
      display: none !important;
    }
  }

  /* 기본(줄바꿈): 도구 블록 — 아바타는 #TB 기준 절대 배치(툴바 전체 세로 중앙) */
  .tbr {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    gap: 5px 6px;
    row-gap: 6px;
    align-items: center;
    justify-content: flex-start;
    flex: 1 1 100%;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    margin-left: 0;
    box-sizing: border-box;
    overflow: visible;
  }

  /* overflow 금지: absolute 드롭다운(뷰·출력)이 잘리지 않도록 — 좁은 폭은 wrap */
  .tbr-tools {
    display: flex;
    flex-wrap: wrap;
    flex: 1 1 auto;
    align-items: center;
    justify-content: flex-start;
    gap: 5px 6px;
    row-gap: 6px;
    min-width: 0;
    overflow: visible;
  }

  .tbr-tools > * {
    flex-shrink: 0;
  }

  /* 넓은 화면: 한 줄 + 우측 액션 블록 */
  @media (min-width: 1180px) {
    #TB {
      flex-wrap: nowrap;
    }

    .tbr {
      flex: 0 1 auto;
      width: auto;
      margin-left: auto;
      justify-content: flex-start;
    }
  }

  .sync-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 6px;
    white-space: nowrap;
    user-select: none;
    border: 1px solid transparent;
  }

  .sync-badge.sb-s {
    background: #ecfdf5;
    color: #15803d;
    border-color: #86efac;
  }

  .sync-badge.sb-p {
    background: #fffbeb;
    color: #b45309;
    border-color: #fcd34d;
  }

  .sync-badge.sb-g {
    background: #eff6ff;
    color: #1d4ed8;
    border-color: #93c5fd;
  }

  .sync-badge.sb-f {
    background: #fef2f2;
    color: #b91c1c;
    border-color: #fecaca;
  }

  .json-import-input {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
    overflow: hidden;
  }

  #BAC,
  #BPN,
  .tb-undo-btn,
  .tb-redo-btn {
    padding: 6px 12px;
    font-size: 12px;
    border-radius: 7px;
    cursor: pointer;
    font-weight: 600;
    border: 1.5px solid #c8c4be;
    background: #fff;
    color: #333;
  }

  .tb-output-wrap {
    position: relative;
    z-index: 60;
    display: inline-block;
    vertical-align: middle;
    max-width: 100%;
  }

  .tb-output-btn {
    box-sizing: border-box;
    display: flex;
    min-width: 132px;
    padding: 7px 14px;
    font-size: 12px;
    line-height: 1.25;
    border-radius: 7px;
    cursor: pointer;
    font-weight: 600;
    font-family: inherit;
    border: 1.5px solid #c8c4be;
    background: #fff;
    color: #333;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      box-shadow 0.15s ease;
  }

  .tb-output-btn:hover {
    border-color: #b8b4ae;
    background: #fafaf8;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.07);
  }

  .tb-output-btn:focus-visible {
    outline: 2px solid #631EED;
    outline-offset: 2px;
  }

  .tb-output-btn[aria-expanded='true'] {
    border-color: #a89ef0;
    background: #f5f3ff;
    box-shadow: inset 0 1px 2px rgba(99, 30, 237, 0.08);
  }

  .tb-output-label {
    flex: 1 1 auto;
    text-align: left;
    letter-spacing: -0.01em;
  }

  .tb-output-caret {
    flex-shrink: 0;
    font-size: 10px;
    line-height: 1;
    opacity: 0.65;
    color: #555;
    margin-top: 1px;
  }

  .tb-output-menu {
    position: absolute;
    top: 100%;
    left: 0;
    box-sizing: border-box;
    width: 100%;
    margin-top: 5px;
    padding: 4px;
    background: #fff;
    border: 1px solid #e0dbd4;
    border-radius: 8px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
    gap: 2px;
    z-index: 70;
  }

  .tb-output-menu-item {
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    font-size: 12px;
    font-weight: 600;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #333;
    cursor: pointer;
  }

  .tb-output-menu-item:hover {
    background: #f5f3ff;
    color: #5519D4;
  }

  .tb-output-menu-item--prd {
    background: #f0ecff;
    color: #631EED;
  }

  .tb-output-menu-item--prd:hover {
    background: #631EED;
    color: #fff;
  }

  /* 뷰 드롭다운 — tbr-tools 맨 앞에서 도구 버튼들과 한 줄 */
  .tb-view-wrap {
    display: block;
    width: max-content;
    max-width: 100%;
    align-self: center;
    position: relative;
    z-index: 65;
  }

  .tb-view-btn {
    box-sizing: border-box;
    width: auto;
    min-width: 124px;
    padding: 7px 14px;
    font-size: 12px;
    line-height: 1.25;
    border-radius: 7px;
    cursor: pointer;
    font-weight: 600;
    font-family: inherit;
    border: 1.5px solid #c8c4be;
    background: #fff;
    color: #333;
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      box-shadow 0.15s ease;
  }

  .tb-view-btn:hover {
    border-color: #b8b4ae;
    background: #fafaf8;
  }

  .tb-view-btn:focus-visible {
    outline: 2px solid #631EED;
    outline-offset: 2px;
  }

  .tb-view-btn[aria-expanded='true'] {
    border-color: #a89ef0;
    background: #f5f3ff;
  }

  .tb-view-label {
    flex: 0 1 auto;
    text-align: left;
    color: #631EED;
  }

  .tb-view-caret {
    flex-shrink: 0;
    font-size: 10px;
    opacity: 0.65;
  }

  .tb-view-menu {
    position: absolute;
    top: 100%;
    left: 0;
    right: auto;
    min-width: 100%;
    width: max-content;
    margin-top: 5px;
    padding: 4px;
    background: #fff;
    border: 1px solid #e0dbd4;
    border-radius: 8px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
    gap: 2px;
    z-index: 70;
  }

  .tb-view-menu-item {
    width: 100%;
    text-align: left;
    padding: 9px 11px;
    font-size: 13px;
    font-weight: 600;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #333;
    cursor: pointer;
  }

  .tb-view-menu-item:hover {
    background: #f5f3ff;
    color: #5519D4;
  }

  .tb-view-menu-item--on {
    background: #f0ecff;
    color: #631EED;
  }

  /* 보기 드롭다운 — 모두보기(맞춤)·자동정렬 (pilot #BFT #BAR) */
  .tb-viewport-wrap {
    display: inline-block;
    vertical-align: middle;
    max-width: 100%;
    flex-shrink: 0;
    align-self: center;
    position: relative;
    z-index: 63;
  }

  .tb-viewport-btn {
    box-sizing: border-box;
    display: flex;
    min-width: 80px;
    padding: 7px 14px;
    font-size: 12px;
    line-height: 1.25;
    border-radius: 7px;
    cursor: pointer;
    font-weight: 600;
    font-family: inherit;
    border: 1.5px solid #c8c4be;
    background: #fff;
    color: #333;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      box-shadow 0.15s ease;
  }

  .tb-viewport-btn:hover {
    border-color: #b8b4ae;
    background: #fafaf8;
  }

  .tb-viewport-btn:focus-visible {
    outline: 2px solid #631EED;
    outline-offset: 2px;
  }

  .tb-viewport-btn[aria-expanded='true'] {
    border-color: #a89ef0;
    background: #f5f3ff;
  }

  .tb-viewport-label {
    flex: 0 1 auto;
    text-align: left;
    color: #333;
  }

  .tb-viewport-caret {
    flex-shrink: 0;
    font-size: 10px;
    opacity: 0.65;
  }

  .tb-viewport-menu {
    position: absolute;
    top: 100%;
    left: 0;
    width: 100%;
    box-sizing: border-box;
    margin-top: 5px;
    padding: 4px;
    background: #fff;
    border: 1px solid #e0dbd4;
    border-radius: 8px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
    gap: 2px;
    z-index: 70;
  }

  .tb-viewport-menu-item {
    width: 100%;
    text-align: left;
    padding: 9px 11px;
    font-size: 13px;
    font-weight: 600;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #333;
    cursor: pointer;
  }

  .tb-viewport-menu-item:hover {
    background: #f5f3ff;
    color: #5519D4;
  }

  .pilot-wire-sinks {
    position: absolute;
    left: 0;
    top: 0;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .pilot-wire-sink {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: 0;
    border: 0;
    opacity: 0;
  }

  #BAC {
    border: 1.5px solid #631EED;
    color: #631EED;
    background: #f0ecff;
  }

  .proj-json-import {
    position: relative;
    /* 프로젝트 생성↔가져오기: `.proj-form-col` gap(15px)의 50% 추가 분리 */
    margin-top: calc(15px * 0.5);
  }

  .proj-import-err {
    margin: 8px 0 0;
    padding: 8px 10px;
    font-size: 12px;
    line-height: 1.45;
    color: #b91c1c;
    background: #fef2f2;
    border-radius: 8px;
    border: 1px solid #fecaca;
  }

  #BJI.proj-json-import-btn {
    box-sizing: border-box;
    width: 100%;
    padding: 10px 12px;
    font-size: 13px;
    font-weight: 700;
    border-radius: 9px;
    cursor: pointer;
    font-family: inherit;
    border: none;
    color: #631EED;
    background: #f5f3ff;
    outline: none;
    transition: background 0.15s ease, color 0.15s ease;
  }

  #BJI.proj-json-import-btn:hover {
    background: #ede9fe;
    color: #5519D4;
  }

  #BJI.proj-json-import-btn:focus,
  #BJI.proj-json-import-btn:focus-visible {
    outline: none;
  }

  #BPN {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: none;
    background: #631EED;
    color: #fff;
    font-size: 20px;
    font-weight: 700;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tb-user-avatar {
    position: absolute;
    top: 50%;
    right: var(--tb-user-avatar-edge);
    z-index: 51;
    width: var(--tb-user-avatar-size);
    height: var(--tb-user-avatar-size);
    min-width: var(--tb-user-avatar-size);
    min-height: var(--tb-user-avatar-size);
    border-radius: 50%;
    border: 2px solid #e8e4de;
    background: linear-gradient(145deg, #9b7af5 0%, #5519d4 100%);
    color: #fff;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    box-shadow: 0 1px 3px rgba(91, 63, 217, 0.35);
    transform: translateY(-50%);
    transition: transform 0.12s ease, box-shadow 0.12s ease;
  }

  .tb-user-avatar:hover {
    transform: translateY(-50%) scale(1.05);
    box-shadow: 0 2px 8px rgba(91, 63, 217, 0.45);
  }

  .tb-user-avatar-letter {
    font-size: calc(var(--tb-user-avatar-size) * 0.375);
    font-weight: 800;
    line-height: 1;
    user-select: none;
  }

  .tb-user-avatar-icon {
    width: calc(var(--tb-user-avatar-size) * 0.58);
    height: calc(var(--tb-user-avatar-size) * 0.58);
    opacity: 0.95;
  }

  .acct-wrap {
    position: fixed;
    inset: 0;
    z-index: 8000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    pointer-events: none;
  }

  .acct-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(26, 22, 40, 0.45);
    pointer-events: auto;
  }

  .acct-sheet {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 300px;
    background: #fff;
    border-radius: 14px;
    padding: 18px 18px 14px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
    border: 1px solid #ece8e2;
    pointer-events: auto;
    max-height: min(90vh, 420px);
    overflow-y: auto;
  }

  .acct-title {
    margin: 0 0 14px;
    font-size: 15px;
    font-weight: 700;
    color: #1a1a1a;
  }

  .acct-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .acct-label {
    font-size: 11px;
    font-weight: 600;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .acct-email {
    font-size: 13px;
    font-weight: 600;
    color: #4c1d95;
    word-break: break-all;
    line-height: 1.35;
  }

  .acct-divider {
    height: 1px;
    background: #ece8e2;
    margin: 14px 0;
  }

  .acct-input {
    width: 100%;
    padding: 8px 10px;
    font-size: 13px;
    border: 1.5px solid #ddd8cf;
    border-radius: 8px;
    box-sizing: border-box;
  }

  .acct-input:focus {
    outline: none;
    border-color: #631EED;
    box-shadow: 0 0 0 2px rgba(99, 30, 237, 0.2);
  }

  .acct-err {
    margin: 0;
    font-size: 12px;
    color: #b91c1c;
    line-height: 1.35;
  }

  .acct-hint {
    margin: 0;
    font-size: 11px;
    color: #999;
    line-height: 1.4;
  }

  .acct-btn {
    width: 100%;
    padding: 9px 12px;
    font-size: 13px;
    font-weight: 600;
    border-radius: 8px;
    cursor: pointer;
    border: 1.5px solid transparent;
    margin-top: 4px;
  }

  .acct-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .acct-btn-primary {
    background: #631EED;
    color: #fff;
    border-color: #5519D4;
    margin-top: 8px;
  }

  .acct-btn-primary:hover:not(:disabled) {
    background: #5519D4;
  }

  .acct-btn-danger {
    background: #fff;
    color: #b91c1c;
    border-color: #fecaca;
  }

  .acct-btn-danger:hover {
    background: #fef2f2;
  }

  .acct-btn-ghost {
    background: transparent;
    color: #666;
    border-color: #e0dbd4;
    margin-top: 8px;
  }

  .acct-btn-ghost:hover {
    background: #f8f7f4;
  }

  #VIEWS {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  #VIEWS.views-content-below-tb {
    padding-top: var(--views-tb-pad, 0px);
    transition: padding-top 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .view {
    position: absolute;
    inset: 0;
    display: none;
    overflow: hidden;
  }

  .view.active {
    display: flex;
    flex-direction: column;
  }

  #CW {
    flex: 1;
    position: relative;
    overflow: hidden;
    user-select: none;
    background: #eeecff;
    /* 터치 드래그·팬 시 브라우저 스크롤/제스처에 포인터를 빼앗기지 않음 */
    touch-action: none;
  }

  #CV {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
  }

  svg#EG {
    position: absolute;
    top: 0;
    left: 0;
    overflow: visible;
    pointer-events: none;
  }

  #CV svg#SG {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    min-height: 100%;
    overflow: visible;
    pointer-events: none;
    z-index: 6;
  }

  /* 댑스 라벨: 열마다 1칸(가로) — 세로로 글자가 쌓이지 않게 flex+nowrap */
  :global(.cp-row) {
    position: absolute;
    top: 8px;
    left: 0;
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    padding-left: 28px;
    box-sizing: border-box;
    z-index: 2;
    pointer-events: none;
  }
  :global(.cp) {
    position: static;
    flex: 0 0 244px;
    width: 244px;
    min-width: 0;
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: flex-start;
    padding: 2px 10px;
    border-radius: 20px;
    font-size: 10px;
    font-weight: 700;
    line-height: 1.2;
    white-space: nowrap;
    word-break: keep-all;
    writing-mode: horizontal-tb;
    box-sizing: border-box;
    pointer-events: none;
    z-index: 2;
  }
  :global(.cp0) {
    background: #631EED;
    color: #fff;
  }
  :global(.cp1) {
    background: #f0ecff;
    color: #631EED;
    border: 1px solid #d4caff;
  }
  :global(.cp2) {
    background: #f3f0ff;
    color: #7c6fd4;
    border: 1px solid #ddd6fe;
  }
  :global(.cp3) {
    background: #f7f5ff;
    color: #9d8fe0;
    border: 1px solid #ede9fe;
  }
  :global(.cp4) {
    background: #faf8ff;
    color: #b4a8e8;
    border: 1px solid #f0ecff;
  }

  /* 하위분포: 좌측 뎁스 스트립 — 짧은 라벨·큰 글자·최소 폭, 세로 글자 깨짐 방지 */
  :global(.cp-depth-strip) {
    pointer-events: none;
  }
  :global(.cp-depth-strip .cp-depth-cell) {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    text-align: center;
    line-height: 1.1;
    padding: 2px 0;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: -0.03em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    box-sizing: border-box;
    border-radius: 4px;
    border-width: 0 !important;
    box-shadow: none !important;
  }
  :global(.cp-depth-strip .cp-depth-cell.cp0) {
    background: rgba(99, 30, 237, 0.92);
    color: #fff;
  }
  :global(.cp-depth-strip .cp-depth-cell.cp1) {
    background: rgba(240, 236, 255, 0.92);
    color: #631EED;
  }
  :global(.cp-depth-strip .cp-depth-cell.cp2) {
    background: rgba(243, 240, 255, 0.85);
    color: #7c6fd4;
  }
  :global(.cp-depth-strip .cp-depth-cell.cp3) {
    background: rgba(247, 245, 255, 0.82);
    color: #9d8fe0;
  }
  :global(.cp-depth-strip .cp-depth-cell.cp4) {
    background: rgba(250, 248, 255, 0.78);
    color: #b4a8e8;
  }

  :global(.nw) {
    position: absolute;
    z-index: 5;
  }
  :global(.nd) {
    position: relative;
    z-index: 0;
    background: #fff;
    border: none;
    border-radius: 12px;
    width: 226px;
    box-sizing: border-box;
    padding: 15px 13px 17px;
    cursor: pointer;
    box-shadow: none;
    outline: 1px solid transparent;
    outline-offset: 0;
    transition: outline-color 0.15s ease;
  }
  :global(.nd:hover) {
    z-index: 30;
    outline-color: rgba(99, 30, 237, 0.38);
  }
  :global(.nw .node-collapse-btn),
  :global(.nw .pb2) {
    z-index: 32;
  }
  /* UA button 기본 overflow:hidden이 원형 SVG 스트로크·AA를 우·하단에서 잘라냄 */
  :global(.nw .node-collapse-btn) {
    overflow: visible;
  }
  :global(.nd.sel) {
    outline: 2px solid rgba(99, 30, 237, 0.65);
  }
  :global(.nd.msel) {
    outline: 2px solid rgba(225, 29, 72, 0.55);
  }
  /* §4.0.1 재연결 모드 — 옮길 노드·트리 강조 */
  :global(.nd.relink-pick) {
    outline: 2px solid rgba(14, 165, 233, 0.65);
  }
  :global(.nd.relink-source-dim) {
    opacity: 0.36;
    transition: none;
    filter: saturate(0.85);
  }
  :global(.relink-ghost-fly .relink-ghost-nd) {
    flex-shrink: 0;
    cursor: grabbing;
    opacity: 0.97;
    box-shadow:
      0 16px 40px rgba(15, 23, 42, 0.22),
      0 0 0 2px rgba(14, 165, 233, 0.95);
    transition: none;
    pointer-events: none;
  }
  :global(.relink-ghost-fly .relink-ghost-fallback) {
    padding: 8px 12px;
    border-radius: 10px;
    background: rgba(15, 23, 42, 0.92);
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    border: 2px solid #0ea5e9;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
    white-space: nowrap;
  }
  :global(.nd.rnd) {
    width: 202px;
  }
  :global(.ndt) {
    display: flex;
    align-items: flex-start;
    padding: 2px 4px 10px;
    gap: 8px;
  }
  :global(.nb) {
    width: 3px;
    border-radius: 2px;
    flex-shrink: 0;
    margin-top: 2px;
    align-self: stretch;
    min-height: 12px;
  }
  :global(.nn-wrap) {
    position: relative;
    flex: 1;
    min-width: 0;
  }
  :global(.nn-line) {
    display: flex;
    align-items: baseline;
    min-width: 0;
    gap: 3px;
  }
  :global(.nn-line .nn) {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    word-break: normal;
    font-size: 12px;
    color: #1a1a1a;
    font-weight: 500;
    line-height: 1.35;
  }
  :global(.nn-tooltip) {
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    margin-top: 2px;
    z-index: 201;
    max-width: min(100vw, 320px);
    background: #fff;
    border: 1px solid #e0dbd4;
    border-radius: 8px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12);
    padding: 0 0 8px;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity 0.12s ease,
      visibility 0.12s ease;
  }
  :global(.nn-wrap--tip:hover .nn-tooltip) {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }
  :global(.nn-tooltip-t) {
    font-size: 9px;
    font-weight: 700;
    color: #631EED;
    padding: 6px 9px 4px;
    letter-spacing: 0.02em;
  }
  :global(.nn-tooltip-b) {
    font-size: 11px;
    color: #1a1a1a;
    line-height: 1.45;
    padding: 0 9px 4px;
    max-height: 200px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }
  :global(.ndepth) {
    flex-shrink: 0;
    font-size: 9px;
    color: #ccc;
    font-family: monospace;
    margin-left: 0;
  }
  :global(.nds-wrap) {
    position: relative;
  }
  :global(.nds) {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    font-size: 10px;
    color: #999;
    margin: 8px 4px 0;
    line-height: 1.4;
    word-break: break-word;
  }
  :global(.nds-tooltip) {
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    margin-top: -1px;
    z-index: 200;
    max-width: min(100vw, 300px);
    background: #fff;
    border: 1px solid #e0dbd4;
    border-radius: 8px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12);
    padding: 0 0 8px;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity 0.12s ease,
      visibility 0.12s ease;
  }
  :global(.nds-wrap:hover .nds-tooltip) {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }
  :global(.nds-tooltip-t) {
    font-size: 9px;
    font-weight: 700;
    color: #631EED;
    padding: 6px 9px 4px;
    letter-spacing: 0.02em;
  }
  :global(.nds-tooltip-b) {
    font-size: 10px;
    color: #555;
    line-height: 1.5;
    padding: 0 9px 4px;
    max-height: 180px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }
  /* 배지: 2행까지만(넘는 행은 clip). 포인터는 부모 .nd에 그대로 — 드래그·제목·선택 로직 보존 */
  :global(.nm) {
    padding: 8px 4px 12px;
    min-height: 0;
    box-sizing: border-box;
  }
  :global(.nm-clamp) {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    align-items: flex-start;
    gap: 3px 4px;
    max-height: 38px;
    overflow: hidden;
    line-height: 1.2;
  }
  :global(.bg) {
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 7px;
    font-weight: 600;
  }
  :global(.btdd) {
    background: #fff1f0;
    color: #dc2626;
    border: 1px solid #fca5a5;
  }
  :global(.bai) {
    background: #f0fdf4;
    color: #16a34a;
    border: 1px solid #86efac;
  }
  :global(.bcrud) {
    background: #eff6ff;
    color: #1d4ed8;
    border: 1px solid #93c5fd;
  }
  :global(.bapi) {
    background: #faf5ff;
    color: #7c3aed;
    border: 1px solid #c4b5fd;
  }
  :global(.busp) {
    background: #fffbeb;
    color: #b45309;
    border: 1px solid #fcd34d;
  }
  :global(.bdev) {
    background: #fff1f0;
    color: #991b1b;
    border: 1px solid #fecaca;
  }
  :global(.bux) {
    background: #e0e7ff;
    color: #3730a3;
    border: 1px solid #a5b4fc;
  }
  :global(.bprj) {
    background: #dcfce7;
    color: #166534;
    border: 1px solid #86efac;
  }
  :global(.bggen) {
    background: #f1f5f9;
    color: #475569;
    border: 1px solid #cbd5e1;
  }
  :global(.nnum) {
    font-size: 9px;
    color: #999;
    font-family: monospace;
    flex-shrink: 0;
  }
  :global(.na) {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: 8px 4px 2px;
    gap: 6px;
  }
  :global(.pb2) {
    position: absolute;
    right: -19px;
    top: 50%;
    transform: translateY(-50%);
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: none;
    background: #631EED;
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 6;
    box-shadow: 0 2px 5px rgba(99, 30, 237, 0.35);
  }
  :global(.pb2.pb2-drop) {
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.45);
  }
  :global(.pb2.pb2-relink-hover) {
    box-shadow: 0 0 0 4px rgba(250, 204, 21, 0.95);
    filter: brightness(1.08);
  }

  /* PC: 가이드(좌) · 미니맵+배지(우) / 모바일: column-reverse로 가이드 맨 아래, 그 위 맵·배지, 전부 우측 정렬 */
  .cw-bottom-stack {
    position: absolute;
    bottom: 10px;
    left: 10px;
    right: 10px;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-end;
    gap: 8px;
    z-index: 20;
    max-width: calc(100% - 20px);
    pointer-events: none;
  }
  .cw-bottom-stack > * {
    pointer-events: auto;
  }

  .cw-mm-cluster {
    position: relative;
    flex: 0 0 auto;
    display: flex;
    flex-direction: row;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
    max-width: 100%;
    pointer-events: none;
  }
  .cw-mm-cluster > * {
    pointer-events: auto;
  }
  .sync-badge--cw {
    align-self: flex-end;
    margin-bottom: 1px;
    flex-shrink: 0;
    font-size: 11px;
    padding: 5px 9px;
  }
  /* 미니맵: 엔진·canvas·updMM 유지, UI 만 비표시 */
  .mm {
    display: none;
    position: relative;
    flex-shrink: 0;
    width: 120px;
    height: 72px;
    background: #fff;
    border: 1px solid #e0dbd4;
    border-radius: 8px;
    overflow: hidden;
  }
  .mmvp {
    position: absolute;
    border: 2px solid #631EED;
    border-radius: 2px;
    pointer-events: none;
    background: rgba(99, 30, 237, 0.06);
  }
  .cw-bottom-bar {
    position: relative;
    flex: 0 1 auto;
    left: 0;
    right: 0;
    bottom: auto;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
    pointer-events: none;
  }
  .cw-bottom-bar > * {
    pointer-events: auto;
  }

  .zc {
    position: relative;
    flex-shrink: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    align-items: center;
    background: #fff;
    border: 1px solid #e0dbd4;
    border-radius: 8px;
    padding: 3px 7px;
  }

  .zc-hint {
    font-size: 10px;
    line-height: 1.35;
    color: #888;
    padding: 0 4px;
    border-left: 1px solid #e8e4de;
    margin-left: 2px;
    white-space: nowrap;
  }

  .cw-presence {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
    min-width: 0;
  }
  .cw-presence-avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2px solid #e0dbd4;
    background: #f5f2ff;
    color: #5b4dc4;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .cw-presence-avatar:hover {
    border-color: #b8aff0;
    box-shadow: 0 0 0 2px rgba(99, 30, 237, 0.12);
  }
  .cw-presence-avatar--on {
    border-color: #631EED;
    box-shadow: 0 0 0 2px rgba(99, 30, 237, 0.2);
  }
  .cw-presence-letter {
    line-height: 1;
  }
  .cw-presence-email {
    font-size: 10px;
    color: #444;
    max-width: min(200px, 28vw);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 2px 6px;
    border-radius: 6px;
    background: #fff;
    border: 1px solid #e8e4de;
  }
  .cw-presence-overflow {
    font-size: 10px;
    font-weight: 700;
    color: #92400e;
    padding: 2px 5px;
    border-radius: 6px;
    background: #fffbeb;
    border: 1px solid #fcd34d;
    flex-shrink: 0;
  }
  .cw-snapshot-hist-btn {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 6px;
    border: 1px solid #d5cfe8;
    background: #faf9ff;
    color: #4f3da8;
    cursor: pointer;
    line-height: 1.2;
  }
  .cw-snapshot-hist-btn:hover {
    border-color: #9b8fd8;
    background: #f0ecff;
  }
  .cw-snapshot-hist-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .cw-release-note-btn {
    flex-shrink: 0;
    margin: 0;
    padding: 4px 8px;
    font-size: 10px;
    font-weight: 600;
    line-height: 1.2;
    font-family: inherit;
    color: #8a8680;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    letter-spacing: 0.02em;
  }
  .cw-release-note-btn:hover {
    color: #5c5854;
    background: rgba(0, 0, 0, 0.04);
  }
  .cw-release-note-btn:focus-visible {
    outline: 2px solid #631eed;
    outline-offset: 2px;
  }
  .upd-log-modal .upd-log-hint {
    font-size: 12px;
    line-height: 1.45;
    color: #555;
    margin: 0 0 12px;
  }
  .upd-log-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: min(56vh, 440px);
    overflow: auto;
    -webkit-overflow-scrolling: touch;
  }
  .upd-log-card {
    border-bottom: 1px solid #ece8e2;
  }
  .upd-log-card:last-child {
    border-bottom: none;
  }
  .upd-log-card-head {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    padding: 12px 4px;
    margin: 0;
    border: none;
    background: transparent;
    font: inherit;
    cursor: pointer;
    color: #333;
    min-height: 44px;
    box-sizing: border-box;
  }
  .upd-log-card-head:hover {
    background: rgba(99, 30, 237, 0.04);
  }
  .upd-log-card-head:focus-visible {
    outline: 2px solid #631eed;
    outline-offset: -2px;
  }
  .upd-log-card-meta {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 600;
    color: #888;
    min-width: 5.5rem;
  }
  .upd-log-card-title {
    flex: 1 1 auto;
    font-size: 13px;
    font-weight: 600;
    min-width: 0;
  }
  .upd-log-chev {
    flex-shrink: 0;
    font-size: 12px;
    color: #631eed;
    width: 1.25rem;
    text-align: center;
  }
  .upd-log-card-body {
    padding: 0 4px 14px 5.5rem;
    font-size: 12px;
    line-height: 1.55;
    color: #444;
    white-space: pre-wrap;
  }
  .upd-log-empty {
    font-size: 12px;
    color: #888;
    padding: 12px 4px;
  }
  @media (max-width: 900px) {
    .upd-log-card-body {
      padding-left: 4px;
    }
    .upd-log-card-head {
      flex-wrap: wrap;
    }
    .upd-log-card-meta {
      width: 100%;
      min-width: 0;
    }
  }
  .cw-postlogout-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  .snap-hist-modal .snap-hist-hint {
    font-size: 12px;
    line-height: 1.45;
    color: #555;
    margin: 0 0 10px;
  }
  .snap-hist-actions {
    margin-bottom: 12px;
  }
  .snap-hist-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: min(52vh, 420px);
    overflow: auto;
  }
  .snap-hist-item {
    padding: 10px 0;
    border-bottom: 1px solid #ece8e2;
  }
  .snap-hist-row-top {
    font-size: 12px;
    font-weight: 600;
    color: #333;
  }
  .snap-hist-row-sub {
    font-size: 11px;
    color: #666;
    margin-top: 4px;
  }
  .snap-hist-restore-btn {
    margin-top: 8px;
    font-size: 12px;
    padding: 6px 10px;
  }
  .snap-hist-empty {
    font-size: 12px;
    color: #888;
    padding: 8px 0;
  }
  .zb {
    width: 20px;
    height: 20px;
    border: none;
    background: transparent;
    color: #555;
    font-size: 14px;
    cursor: pointer;
    border-radius: 4px;
    font-weight: 700;
  }
  .zb:hover {
    background: #f0ece8;
  }
  .zp {
    font-size: 10px;
    color: #999;
    min-width: 28px;
    text-align: center;
  }

  @media (max-width: 900px) {
    .cw-bottom-stack {
      flex-direction: column-reverse;
      align-items: flex-end;
      justify-content: flex-end;
      left: 8px;
      right: 8px;
      bottom: 8px;
      gap: 6px;
    }
    .cw-bottom-bar {
      justify-content: flex-end;
      width: 100%;
      max-width: 100%;
    }
    .cw-mm-cluster {
      gap: 6px;
      justify-content: flex-end;
      align-self: flex-end;
    }
    .sync-badge--cw {
      font-size: 12px;
      padding: 6px 11px;
    }
    .mm {
      width: min(148px, 46vw);
      height: 90px;
    }
    .zc {
      padding: 5px 9px;
      gap: 5px;
    }
    .zb {
      width: 28px;
      height: 28px;
      font-size: 16px;
    }
    .zp {
      font-size: 12px;
      min-width: 34px;
    }
    /* PC 전용 단축키 안내 — 모바일에서 숨김 */
    .zc-hint {
      display: none;
    }
  }

  #ES {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  #V-PRD {
    background: #fff;
    padding: 28px 32px;
    overflow-y: auto;
    gap: 0;
  }
  .prd-header {
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 2px solid #631EED;
  }
  .prd-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 6px;
  }
  .prd-l1-copy-btn {
    font-size: 11px;
    font-weight: 600;
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid #c4b8fc;
    background: #f5f2ff;
    color: #5519D4;
    cursor: pointer;
    white-space: nowrap;
  }
  .prd-l1-copy-btn:hover {
    background: #ebe4ff;
  }
  .prd-title {
    font-size: 20px;
    font-weight: 700;
    color: #1a1a1a;
    margin-bottom: 0;
  }
  .prd-meta {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    font-size: 12px;
    color: #888;
  }
  :global(.prd-meta strong) {
    color: #555;
    font-weight: 600;
  }

  .prd-version-line {
    margin: 10px 0 0;
    font-size: 11px;
    color: #666;
    line-height: 1.55;
  }
  .prd-version-line :global(code) {
    font-size: 10px;
    background: #f0ecff;
    padding: 2px 6px;
    border-radius: 4px;
    color: #5519D4;
  }
  .prd-section-hint {
    font-size: 11px;
    color: #999;
    margin: -4px 0 8px;
    padding-left: 2px;
  }
  .prd-body {
    min-height: 36px;
  }
  .prd-edit-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 14px;
    margin: 0 0 8px;
  }
  .prd-sec-reset {
    font-size: 12px;
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid #ddd;
    background: #fff;
    color: #444;
    cursor: pointer;
  }
  .prd-sec-reset:hover {
    border-color: #bbb;
    background: #fafafa;
  }
  .prd-save-hint {
    font-size: 11px;
    color: #999;
  }
  .prd-section-editor {
    display: block;
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    min-height: 160px;
    max-height: 38vh;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    line-height: 1.55;
    color: #333;
    background: #faf9f7;
    border: 1px solid #ece8e2;
    border-radius: 8px;
    padding: 14px 16px;
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }
  :global(.prd-pre-wrap) {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    line-height: 1.55;
    color: #333;
    background: #faf9f7;
    border: 1px solid #ece8e2;
    border-radius: 8px;
    padding: 14px 16px;
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-x: auto;
    max-height: 38vh;
    overflow-y: auto;
  }
  :global(.prd-empty) {
    color: #bbb;
    font-size: 13px;
    padding: 20px;
    text-align: center;
    margin: 0;
  }

  /* display/flex는 `.view.active`에만 둠 — 여기서 display:flex 넣으면 특이도가 `.view{display:none}`보다 높아 비활성에도 보임(트리 가림) */
  #V-SPEC {
    background: #f0f2f5;
    overflow: hidden;
  }
  #V-SPEC.view.active {
    min-height: 0;
  }
  /* 기능명세(#V-SPEC)와 동일 톤 — 스프레드시트 작업 화면 */
  #V-IA {
    background: #f0f2f5;
    overflow: hidden;
  }
  #V-IA.view.active {
    min-height: 0;
  }
  .ia-view-inner {
    max-width: none;
    min-height: 0;
    flex: 1;
    width: 100%;
    box-sizing: border-box;
    padding: 16px 18px 18px;
    display: flex;
    flex-direction: column;
  }
  .spec-inner {
    padding: 16px 18px 18px;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
  }
  .spec-title {
    font-size: 15px;
    font-weight: 700;
    color: #1a1a1a;
    margin-bottom: 8px;
  }
  .spec-hint {
    font-size: 11px;
    color: #64748b;
    line-height: 1.45;
    margin: 0 0 6px;
    max-width: 920px;
  }
  .spec-header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px 20px;
    margin-bottom: 10px;
  }
  .spec-header-main {
    flex: 1 1 260px;
    min-width: 0;
  }
  .spec-header-actions {
    flex: 0 0 auto;
    align-self: flex-start;
    margin-inline-end: 6px;
    padding-top: 1px;
  }
  .spec-dl-btn {
    font-size: 12px;
    font-weight: 600;
    padding: 7px 12px;
    border-radius: 6px;
    border: 1px solid #1d6b4a;
    background: linear-gradient(180deg, #22a06b 0%, #18805a 100%);
    color: #fff;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }
  .spec-dl-btn:hover {
    filter: brightness(1.05);
  }
  .spec-dl-btn:active {
    transform: translateY(1px);
  }
  .spec-toolbar-note {
    font-size: 11px;
    color: #64748b;
    line-height: 1.4;
    margin: 0;
    max-width: 920px;
  }
  /* 기능명세: 엑셀/스프레드시트형 셀 — 입력은 테두리 없이 셀에 맞춤 */
  .spec-sheet-scroll {
    flex: 1;
    min-height: 200px;
    overflow: auto;
    border: 1px solid #8fa0b2;
    border-radius: 2px;
    background: #fff;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
  }
  .spec-sheet-table {
    table-layout: fixed;
    width: 100%;
    min-width: 1120px;
    border-collapse: collapse;
    border-spacing: 0;
    font-size: 12px;
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans KR', sans-serif;
  }
  .spec-col--id {
    width: 84px;
  }
  .spec-col--depth {
    width: 76px;
  }
  .spec-col--name {
    width: 160px;
  }
  .spec-col--desc {
    width: 220px;
  }
  .spec-col--short {
    width: 100px;
  }
  .spec-col--prio {
    width: 72px;
  }
  .spec-col--badge {
    width: 220px;
  }
  .spec-sheet-th {
    position: sticky;
    top: 0;
    z-index: 3;
    padding: 6px 8px;
    text-align: center;
    font-weight: 600;
    font-size: 11px;
    color: #1e293b;
    background: linear-gradient(180deg, #e8edf4 0%, #d8e0eb 100%);
    border-right: 1px solid #9aaabe;
    border-bottom: 1px solid #7a8a9e;
    box-shadow: 0 1px 0 #f8fafc inset;
    white-space: nowrap;
    user-select: none;
  }
  .spec-sheet-th:first-child {
    border-left: none;
  }
  .spec-sheet-th:last-child {
    border-right: none;
  }
  .spec-sheet-th--badge {
    white-space: normal;
    line-height: 1.25;
    max-width: 220px;
  }
  .spec-sheet-td {
    padding: 0;
    border-right: 1px solid #c5ccd5;
    border-bottom: 1px solid #c5ccd5;
    vertical-align: middle;
    background: #fff;
    color: #0f172a;
  }
  .spec-sheet-td:last-child {
    border-right: none;
  }
  .spec-sheet-row:nth-child(even) .spec-sheet-td {
    background: #f7f9fc;
  }
  .spec-sheet-row:hover .spec-sheet-td {
    background: #eef6ff;
  }
  .spec-sheet-row:nth-child(even):hover .spec-sheet-td {
    background: #e8f2fc;
  }
  .spec-sheet-td--empty {
    padding: 48px 16px;
    text-align: center;
    color: #94a3b8;
    font-size: 13px;
    border: none;
  }
  .spec-sheet-td--depth {
    text-align: center;
    padding: 4px 6px;
    vertical-align: middle;
  }
  .spec-sheet-td--badges {
    padding: 6px 8px;
    vertical-align: top;
    line-height: 1.35;
  }
  /* 기능명세(#V-SPEC) 안에서만 적용 — 트리·캔버스 DOM과 클래스 충돌 원천 차단 */
  #V-SPEC :global(.spec-depth-chip) {
    display: inline-block;
    min-width: 52px;
    padding: 2px 6px;
    border-radius: 2px;
    font-size: 10px;
    font-weight: 700;
    color: #fff;
    text-align: center;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.12);
  }
  #V-SPEC :global(.spec-grid-inp) {
    display: block;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    margin: 0;
    font: inherit;
    font-size: 12px;
    line-height: 1.35;
    padding: 5px 8px;
    border: none;
    border-radius: 0;
    background: transparent;
    color: #0f172a;
    outline: none;
    min-height: 30px;
  }
  #V-SPEC :global(.spec-grid-inp:focus) {
    background: #fffef0;
    box-shadow: inset 0 0 0 2px #217346;
  }
  #V-SPEC :global(.spec-grid-inp::placeholder) {
    color: #94a3b8;
  }
  #V-SPEC :global(.spec-grid-inp--id) {
    font-family: ui-monospace, 'SF Mono', 'Consolas', 'Malgun Gothic', monospace;
    font-size: 11px;
    text-align: center;
  }
  #V-SPEC :global(.spec-badge-empty) {
    color: #cbd5e1;
    font-size: 11px;
    padding: 0 6px;
  }
  #V-SPEC :global(.spec-badge-pipeline) {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: stretch;
    min-width: 0;
  }
  #V-SPEC :global(.spec-badge-track) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 6px;
    padding: 3px 0;
    border-bottom: 1px dashed #e2e8f0;
  }
  #V-SPEC :global(.spec-badge-track:last-child) {
    border-bottom: none;
    padding-bottom: 0;
  }
  #V-SPEC :global(.spec-badge-track-label) {
    flex: 0 0 auto;
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 0.06em;
    line-height: 1;
    padding: 3px 5px;
    border-radius: 3px;
    background: #f1f5f9;
    color: #475569;
    border: 1px solid #cbd5e1;
  }
  #V-SPEC :global(.spec-badge-track--dev .spec-badge-track-label) {
    background: #fff1f2;
    color: #9f1239;
    border-color: #fecdd3;
  }
  #V-SPEC :global(.spec-badge-track--ux .spec-badge-track-label) {
    background: #eff6ff;
    color: #1e40af;
    border-color: #bfdbfe;
  }
  #V-SPEC :global(.spec-badge-track--prj .spec-badge-track-label) {
    background: #f0fdf4;
    color: #166534;
    border-color: #bbf7d0;
  }
  #V-SPEC :global(.spec-badge-track-chips) {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    min-width: 0;
  }
  #V-SPEC :global(.spec-badge-track-chips .bg) {
    display: inline-block;
    font-size: 9px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    line-height: 1.2;
    white-space: nowrap;
  }
  #V-SPEC :global(textarea.spec-grid-inp) {
    resize: vertical;
    min-height: 52px;
    max-height: 200px;
    font-family: inherit;
  }
  /* 캔버스 노드 카드용 depth-pill — 기능명세에서는 spec-depth-chip 사용 */
  :global(.depth-pill) {
    display: inline-block;
    font-size: 9px;
    padding: 1px 7px;
    border-radius: 10px;
    font-weight: 700;
    color: #fff;
  }

  #V-AI {
    background: #f5f5f0;
    overflow-y: auto;
    gap: 0;
  }
  .ai-inner {
    padding: 24px 28px;
    max-width: 680px;
  }
  .ai-title {
    font-size: 15px;
    font-weight: 700;
    color: #1a1a1a;
    margin-bottom: 4px;
  }
  .ai-sub {
    font-size: 12px;
    color: #aaa;
    margin-bottom: 8px;
  }
  .ai-impl-hint {
    background: #eceae4;
    border: 1px solid #e0dcd4;
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 16px;
    font-size: 11.5px;
    line-height: 1.55;
    color: #3f3a33;
  }
  .ai-impl-hint__line {
    margin: 0;
  }
  .ai-impl-hint__line :global(strong) {
    color: #1a1a1a;
  }
  .ai-impl-hint__line :global(em) {
    font-style: normal;
    font-weight: 600;
    color: #5536c4;
  }
  .ai-btn-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 16px;
  }
  .ai-btn {
    background: #fff;
    border: 1px solid #e0dbd4;
    border-radius: 10px;
    padding: 14px 16px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }
  .ai-btn:hover {
    border-color: #b8aff0;
    box-shadow: 0 2px 8px rgba(99, 30, 237, 0.1);
  }
  .ai-btn-icon {
    font-size: 18px;
    margin-bottom: 5px;
  }
  .ai-btn-title {
    font-size: 13px;
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 2px;
  }
  .ai-btn-desc {
    font-size: 11px;
    color: #aaa;
    line-height: 1.4;
  }
  .ai-result-toolbar {
    display: none;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 10px;
    padding: 6px 2px 4px;
  }
  .ai-result-toolbar.visible {
    display: flex;
  }
  .ai-result-label {
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
  }
  .ai-copy-btn {
    flex-shrink: 0;
    padding: 6px 12px;
    font-size: 11px;
    font-weight: 600;
    color: #fff;
    background: #631EED;
    border: none;
    border-radius: 8px;
    cursor: pointer;
  }
  .ai-copy-btn:hover {
    opacity: 0.92;
  }
  .ai-result {
    background: #fff;
    border: 1px solid #e0dbd4;
    border-radius: 10px;
    padding: 14px;
    margin-top: 4px;
    font-size: 12px;
    color: #444;
    line-height: 1.7;
    white-space: pre-wrap;
    display: none;
  }
  :global(.ai-result.show) {
    display: block;
  }

  #CTX {
    display: none;
    position: absolute;
    background: #fff;
    border: 1px solid #e0dbd4;
    border-radius: 10px;
    padding: 3px 0;
    min-width: 158px;
    max-width: min(288px, calc(100vw - 16px));
    z-index: 5000;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
    box-sizing: border-box;
    touch-action: manipulation;
    -webkit-overflow-scrolling: touch;
  }
  :global(.cx) {
    padding: 6px 12px;
    font-size: 12px;
    color: #333;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 7px;
    user-select: none;
  }
  :global(.cx:hover) {
    background: #f5f5f0;
  }
  :global(.cx.dng) {
    color: #dc2626;
  }
  :global(.cx.dng:hover) {
    background: #fff1f0;
  }
  :global(.cxsp) {
    height: 1px;
    background: #f0ece8;
    margin: 2px 0;
  }
  :global(.cxsc) {
    padding: 2px 12px 1px;
    font-size: 10px;
    color: #bbb;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .tst {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: #1a1a1a;
    color: #fff;
    font-size: 12px;
    padding: 8px 16px;
    border-radius: 9px;
    z-index: 9000;
    white-space: nowrap;
    pointer-events: none;
  }
  .tst.tst--relink {
    white-space: normal;
    max-width: min(94vw, 560px);
    text-align: center;
    line-height: 1.4;
    padding: 10px 18px;
  }

  .prd-section {
    margin-bottom: 18px;
  }
  .prd-section h2 {
    font-size: 14px;
    font-weight: 700;
    color: #631EED;
    margin-bottom: 8px;
    padding-left: 10px;
    border-left: 3px solid #631EED;
  }

  :global(.mbg) {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(20, 10, 50, 0.42);
    z-index: 6000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    box-sizing: border-box;
  }

  :global(.mo) {
    background: #fff;
    border-radius: 16px;
    padding: 14px;
    width: 452px;
    max-width: calc(100vw - 32px);
    max-height: calc(0.8 * (100vh - 92px));
    overflow-y: auto;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.2);
    flex-shrink: 0;
  }

  :global(.mo.mo-wide) {
    width: min(520px, calc(100vw - 32px));
  }

  /* 프로젝트 관리 모달: 패딩 + 헤더 고정(쉘은 flex·본문만 스크롤) */
  :global(.mo.mo-wide.pm-scroll.pm-proj-shell) {
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding-top: 21px;
    padding-bottom: 21px;
    padding-left: 14px;
    padding-right: 14px;
  }

  @media (max-width: 900px) {
    :global(.mo.pm-scroll.pm-proj-shell) {
      position: relative;
    }

    .pm-proj-body {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    .pm-proj-body::-webkit-scrollbar {
      display: none;
      width: 0;
      height: 0;
    }
  }

  :global(.mo h3) {
    font-size: 15px;
    color: #1a1a1a;
    font-weight: 700;
  }

  :global(.mcl) {
    width: 24px;
    height: 24px;
    border: none;
    background: #f0ece8;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    color: #666;
    outline: none;
  }

  :global(.mcl:focus),
  :global(.mcl:focus-visible) {
    outline: none;
  }

  :global(.fl) {
    font-size: 11px;
    color: #666;
    display: block;
    margin-bottom: 4px;
    font-weight: 600;
  }

  :global(.fi) {
    width: 100%;
    background: #faf9f7;
    border: none;
    border-radius: 8px;
    color: #1a1a1a;
    font-size: 13px;
    padding: 8px 11px;
    outline: none;
    font-family: inherit;
    transition: background 0.15s;
    box-shadow: none;
  }

  :global(.fi:focus),
  :global(.fi:focus-visible) {
    outline: none;
    border: none;
    box-shadow: none;
    background: #f3f1ed;
  }

  :global(.fi::placeholder) {
    color: #9ca3af;
    opacity: 1;
  }

  :global(.cx) {
    padding: 6px 12px;
    font-size: 12px;
    color: #333;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 7px;
    user-select: none;
  }

  :global(.cx:hover) {
    background: #f5f5f0;
  }

  :global(.cx.dng) {
    color: #dc2626;
  }

  :global(.cx.dng:hover) {
    background: #fff1f0;
  }

  :global(.cxsp) {
    height: 1px;
    background: #f0ece8;
    margin: 2px 0;
  }

  :global(.cxsc) {
    padding: 6px 12px;
    font-size: 11px;
    color: #999;
    font-weight: 600;
    user-select: none;
  }

  .fg {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  /** 모바일: 한 줄 전체 폭 · 터치 타깃 ≥44px · iOS 입력 포커스 시 줌 방지(font≥16px) */
  @media (max-width: 560px) {
    .fg-dates {
      grid-template-columns: 1fr;
      gap: 12px;
    }

    :global(.proj-form-col input.proj-date-input[type='date']) {
      min-height: 44px;
      font-size: 16px;
      box-sizing: border-box;
    }
  }

  .bcr {
    width: 100%;
    padding: 10px;
    border-radius: 9px;
    border: none;
    background: #631EED;
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    outline: none;
  }

  /** 표준 배지 — 보더 없이 면색만 (프로젝트 모달) */
  .bcr-badge-settings {
    margin-bottom: 0;
    border: none;
    background: #f3f1ff;
    color: #2C155A;
  }

  .bcr-badge-settings:hover {
    background: #e8e4ff;
  }

  .bcr-model-api {
    margin-bottom: 0;
    border: none;
    background: #f3f1ff;
    color: #2C155A;
  }

  .bcr-model-api:hover {
    background: #e8e4ff;
  }

  .proj-badge-model-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }

  .proj-badge-model-row .bcr {
    flex: 1;
    min-width: min(100%, 140px);
    width: auto;
  }

  @media (max-width: 560px) {
    .proj-badge-model-row {
      flex-direction: column;
    }
    .proj-badge-model-row .bcr {
      width: 100%;
      min-height: 44px;
    }
  }

  .model-api-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 4px;
  }

  .model-api-warn {
    font-size: 12px;
    line-height: 1.45;
    color: #666;
  }

  .model-api-status {
    font-size: 12px;
    color: #2c155a;
    font-weight: 600;
  }

  .model-api-label {
    font-size: 12px;
    font-weight: 700;
    color: #2c155a;
  }

  .model-api-input {
    width: 100%;
    font-size: 14px;
  }

  @media (max-width: 560px) {
    .model-api-input {
      font-size: 16px;
      min-height: 44px;
    }
  }

  .model-api-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .model-api-actions .bcr {
    flex: 1;
    min-width: min(100%, 120px);
    width: auto;
  }

  .bcr-model-api-clear {
    background: #faf9f7;
    color: #2c155a;
    border: 1px solid #e0dbd4;
  }

  .bcr-model-api-clear:hover {
    background: #f0ece6;
  }

  /** 프로젝트 생성 — 주요 CTA: 세로 +20%(누적)·폰트 +30% */
  .bcr-create-project {
    padding-top: 14px;
    padding-bottom: 14px;
    font-size: 17px;
    line-height: 1.25;
  }

  .proj-layout-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }

  .nm-create-opt {
    flex: 1;
    min-width: min(100%, 132px);
    padding: 10px 12px;
    border: none;
    border-radius: 9px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    background: #e6e4ff;
    color: #2C155A;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .nm-create-opt:hover:not(.nm-create-opt--on) {
    background: #dad6ff;
  }

  .nm-create-opt--on {
    background: #aaa3ff;
    color: #fff;
  }

  .nm-create-opt--on:hover {
    background: #9890f5;
    color: #fff;
  }

  .nm-create-opt:focus-visible {
    outline: 2px solid #631EED;
    outline-offset: 2px;
  }

  @media (max-width: 560px) {
    .proj-layout-row {
      flex-direction: column;
      gap: 10px;
    }
    .nm-create-opt {
      flex: none;
      width: 100%;
      min-height: 44px;
      box-sizing: border-box;
    }
  }

  .bcr:focus,
  .bcr:focus-visible {
    outline: none;
  }

  .bcr.sm {
    width: auto;
    padding: 8px 12px;
    font-size: 12px;
  }

  .bcr:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .pm-proj-head {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: calc(15px * 1.3); /* +30% vs 15px ≈ 19.5px */
    background: #fff;
  }

  .pm-proj-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .proj-form-col {
    display: flex;
    flex-direction: column;
    gap: 15px; /* was 10px → 1.5× */
  }

  .proj-req-label {
    font-size: 12px;
    font-weight: 600;
    color: #444;
    margin: 0 0 -6px;
  }

  .proj-req-textarea {
    line-height: 1.45;
  }

  .acl-err {
    color: #b91c1c;
    font-size: 12px;
    margin: 0 0 8px;
    line-height: 1.45;
  }

  .pl {
    margin-top: 16px;
    padding-top: 14px;
    border-top: none;
  }

  .plt {
    font-size: 11px;
    color: #aaa;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 8px;
  }

  .prow {
    display: flex;
    gap: 6px;
    align-items: stretch;
    margin-bottom: 6px;
  }

  .pcard {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    border-radius: 10px;
    padding: 8px 10px 8px 8px;
    transition: background 0.15s;
    background: #faf9f7;
    border: none;
    box-shadow: none;
  }

  .pcard:hover {
    background: #f8f6ff;
  }

  .pcard.pcard-acp {
    background: #f0ecff;
  }

  .pcard.pcard-shared:not(.pcard-acp) {
    background: #ecfdf5;
  }

  .pcard.pcard-shared:not(.pcard-acp):hover {
    background: #d1fae5;
  }

  .pdl {
    flex-shrink: 0;
    align-self: center;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;
    padding: 0;
    margin: 0;
    border: none;
    border-radius: 999px;
    background: transparent;
    cursor: pointer;
    line-height: 0;
  }

  .pdl-svg {
    display: block;
    flex-shrink: 0;
  }

  .pdl:hover:not(:disabled) .pdl-svg {
    filter: brightness(0.92);
  }

  .pdl:focus,
  .pdl:focus-visible {
    outline: none;
  }

  .pdl:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pdl:disabled .pdl-svg {
    filter: none;
  }

  .pacl {
    flex-shrink: 0;
    align-self: center;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;
    padding: 0;
    margin: 0;
    border: none;
    border-radius: 999px;
    background: transparent;
    cursor: pointer;
    line-height: 0;
  }

  .pacl-svg {
    display: block;
    flex-shrink: 0;
  }

  .pacl:hover .pacl-svg {
    filter: brightness(0.92);
  }

  .pacl:focus,
  .pacl:focus-visible {
    outline: none;
  }

  .pc {
    flex: 1;
    min-width: 0;
    text-align: left;
    border: none;
    border-radius: 0;
    padding: 2px 0 2px 2px;
    margin: 0;
    cursor: pointer;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    background: transparent;
    box-shadow: none;
  }

  .pc:hover {
    background: transparent;
  }

  .pc:focus,
  .pc:focus-visible {
    outline: none;
  }

  .inv-panel {
    background: #f8fafc;
    border-radius: 12px;
    padding: 12px 14px 14px;
    border: none;
    box-shadow: none;
  }

  .inv-hint {
    font-size: 11px;
    color: #64748b;
    line-height: 1.45;
    margin: 0 0 10px;
  }

  .inv-hint-muted {
    margin: 10px 0 0;
    padding-top: 8px;
    border-top: none;
  }

  .inv-code {
    font-size: 10px;
    font-family: ui-monospace, monospace;
    background: #f1f5f9;
    padding: 1px 4px;
    border-radius: 4px;
  }

  .inv-warn {
    font-size: 11px;
    color: #9a3412;
    line-height: 1.45;
    margin: 0;
    width: 100%;
  }

  .inv-row {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    background: #eff6ff;
    border: none;
    border-radius: 10px;
    padding: 10px 12px;
    margin-bottom: 8px;
    box-shadow: none;
  }

  .inv-row-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
  }

  .inv-row:last-child {
    margin-bottom: 0;
  }

  .inv-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex: 1;
  }

  .inv-pid {
    font-size: 11px;
    font-family: ui-monospace, monospace;
    color: #1e3a5f;
    word-break: break-all;
  }

  .inv-tag {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 6px;
    background: #ede9fe;
    color: #2C155A;
    flex-shrink: 0;
  }

  .inv-tag.g {
    background: #dcfce7;
    color: #166534;
  }

  .inv-load {
    flex-shrink: 0;
    min-width: 132px;
  }

  .pi {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    flex-shrink: 0;
  }

  .pif {
    flex: 1;
    min-width: 0;
  }

  .pm-title-wrap {
    min-width: 0;
  }

  .pm-card-title-hit {
    touch-action: manipulation;
    cursor: text;
    user-select: none;
  }

  .pn-edit-input {
    width: 100%;
    box-sizing: border-box;
    margin: 0 0 1px;
    padding: 4px 8px;
    border: 1px solid #c4b8f8;
    border-radius: 8px;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    color: #1a1a1a;
    background: #fff;
  }

  .pn-edit-input:focus {
    outline: 2px solid #631EED;
    outline-offset: 1px;
  }

  .pn2 {
    font-size: 13px;
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pcard.pcard-acp .pn2 {
    color: #631EED;
  }

  .pm2 {
    font-size: 11px;
    color: #aaa;
  }

  .ct {
    font-size: 10px;
    background: #631EED;
    color: #fff;
    padding: 2px 7px;
    border-radius: 10px;
    font-weight: 600;
    align-self: center;
    flex-shrink: 0;
  }

  .pm-scroll-hint-wrap {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 56px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 8px;
    box-sizing: border-box;
    pointer-events: none;
    background: transparent;
    z-index: 4;
  }

  .pm-scroll-hint-btn {
    pointer-events: auto;
    border: none;
    background: transparent;
    border-radius: 999px;
    width: 42px;
    height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: none;
    color: #64748b;
    outline: none;
  }

  .pm-scroll-hint-btn:focus,
  .pm-scroll-hint-btn:focus-visible {
    outline: none;
  }

  .pm-scroll-hint-ico {
    display: block;
  }
</style>
