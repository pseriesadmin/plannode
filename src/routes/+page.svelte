<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { get } from 'svelte/store';
  import {
    projects,
    currentProject,
    activeView,
    showProjectModal,
    createProject,
    upsertImportedPlannodeTreeV1,
    updateProjectMeta,
    deleteProject
  } from '$lib/stores/projects';
  import { parsePlannodeTreeV1Json } from '$lib/plannodeTreeV1';
  import { supabase, type Project } from '$lib/supabase/client';
  import { isSupabaseCloudConfigured } from '$lib/supabase/sync';
  import { flushCloudWorkspaceNow, scheduleCloudFlush } from '$lib/supabase/workspacePush';
  import { startCloudBackgroundSync, stopCloudBackgroundSync } from '$lib/supabase/cloudBackgroundSync';
  import { cloudSyncBadge } from '$lib/stores/workspaceDirty';
  import {
    trySelectProject,
    ensureOwnerAclRowForMyProject,
    repairOwnedProjectsAclWorkspaceSources,
    openAclModal,
    closeAclModal,
    showAclModal,
    aclModalProject,
    fetchMyAclInviteSummaries,
    importSharedProjectFromWorkspace,
    autoLoadInvitedProjects,
    fetchProjectAcl,
    isCurrentUserProjectOwner,
    deleteAllAclRowsForProjectIfOwner,
    type AclInviteSummary
  } from '$lib/supabase/projectAcl';
  import {
    subscribeProjectPresence,
    unsubscribeProjectPresence,
    projectPresencePeers,
    projectPresenceSelectedEmail,
    toggleProjectPresencePeerEmail
  } from '$lib/supabase/projectPresence';
  import { getAuthUserId, signOutEverywhere, authUser } from '$lib/stores/authSession';
  import ProjectAclModal from '$lib/components/ProjectAclModal.svelte';
  import { mountPilotBridge, pilotSetActiveView } from '$lib/pilot/pilotBridge';
  import type { PageData } from './$types';

  /** SvelteKit이 주입 — 미선언 시 콘솔 "unknown prop" 경고 */
  export let data: PageData;
  export let params: Record<string, string> = {};

  let projectName = '';
  let projectAuthor = '';
  let projectStart = '';
  let projectEnd = '';
  let projectDesc = '';

  let pilotReady = false;
  let jsonImportInput: HTMLInputElement;

  const cloudSyncAvailable = isSupabaseCloudConfigured();

  /** max-width:900px 툴바 레이아웃 — 모바일에서 프로젝트명으로 공유 모달 진입 */
  let toolbarCompact = false;

  let aclInviteRows: AclInviteSummary[] = [];
  let aclInvitesErr = '';
  let aclImportBusyKey = '';

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

  function triggerJsonImport() {
    jsonImportInput?.click();
  }

  /** pilot이 `#BMD` `#BPR` `#BJN` `#BFT` `#BAR`에 연결 — UI는 드롭다운에서 동일 요소에 click 위임 */
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

  function triggerPilotViewport(id: 'BFT' | 'BAR') {
    closeViewportMenu();
    closeViewMenu();
    closeOutputMenu();
    document.getElementById(id)?.click();
  }

  let showViewMenu = false;
  let viewMenuWrapEl: HTMLDivElement | undefined;

  const VIEW_MENU_LABELS: Record<'tree' | 'prd' | 'spec' | 'ai', string> = {
    tree: '트리 뷰',
    prd: 'PRD',
    spec: '기능명세',
    ai: 'AI 분석'
  };

  $: viewMenuLabel = VIEW_MENU_LABELS[$activeView];

  function closeViewMenu() {
    showViewMenu = false;
  }

  function pickView(v: 'tree' | 'prd' | 'spec' | 'ai') {
    activeView.set(v);
    closeViewMenu();
  }

  function onToolbarMenusOutside(ev: MouseEvent) {
    const t = ev.target;
    if (!(t instanceof Node)) return;
    if (showOutputMenu && outputMenuWrapEl && !outputMenuWrapEl.contains(t)) closeOutputMenu();
    if (showViewMenu && viewMenuWrapEl && !viewMenuWrapEl.contains(t)) closeViewMenu();
    if (showViewportMenu && viewportMenuWrapEl && !viewportMenuWrapEl.contains(t)) closeViewportMenu();
  }

  async function handleJsonImportChange(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const text = await file.text();
    const parsed = parsePlannodeTreeV1Json(text);
    if (!parsed.ok) {
      showPilotToast(parsed.message);
      return;
    }
    const exists = get(projects).some((p) => p.id === parsed.project.id);
    if (
      exists &&
      !confirm(
        `같은 ID의 프로젝트가 있어. 메타·노드를 덮어쓸까?\n\n${parsed.project.name} (${parsed.project.id})`
      )
    ) {
      showPilotToast('가져오기를 취소했어.');
      return;
    }
    const merged = upsertImportedPlannodeTreeV1(parsed.project, parsed.nodes, { openAfter: false });
    if (!merged) {
      showPilotToast('저장에 실패했어.');
      return;
    }
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
      else showPilotToast(`가져오기 완료: ${latest.name}`);
    }
  }

  async function handleProjectCreate() {
    if (!projectName || !projectAuthor || !projectStart || !projectEnd) {
      alert('필수 항목을 입력해주세요');
      return;
    }

    try {
      const uid = getAuthUserId();
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

      const r = await trySelectProject(newProj);
      if (!r.ok) {
        alert(r.message ?? '프로젝트를 열 수 없습니다');
        return;
      }

      projectName = '';
      projectAuthor = '';
      projectStart = '';
      projectEnd = '';
      projectDesc = '';
      showProjectModal.set(false);
    } catch (e) {
      console.error('Project creation error:', e);
      alert('프로젝트 생성 중 오류가 발생했습니다: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  function closeModal() {
    showProjectModal.set(false);
  }

  /** 프로젝트 모달: 모바일에서 스크롤바 대신 하단 힌트 */
  let projectModalEl: HTMLDivElement | undefined;
  let projectModalScrollHint = false;

  function isProjectModalMobileViewport(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 900px)').matches;
  }

  function syncProjectModalScrollHint() {
    const el = projectModalEl;
    if (!el || !get(showProjectModal)) {
      projectModalScrollHint = false;
      return;
    }
    if (!isProjectModalMobileViewport()) {
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
  $: invitedRemoteOnly = aclInviteRows.filter((r) => !$projects.some((p) => p.id === r.project_id));

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
      deleteProject(proj.id);
      if (cloudSyncAvailable) {
        scheduleCloudFlush('delete-project', 100);
      }
      showPilotToast('프로젝트를 삭제했어.');
      await loadAclInvitesForModal();
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
      showPilotToast(r.message);
      if (r.ok) {
        await loadAclInvitesForModal();
        showProjectModal.set(false);
      }
    } finally {
      aclImportBusyKey = '';
    }
  }

  async function handleProjectSelect(proj: Project) {
    const r = await trySelectProject(proj);
    if (!r.ok) {
      showPilotToast(r.message ?? '접근할 수 없어.');
      return;
    }
    showProjectModal.set(false);
  }

  function openAclForCurrentProject() {
    const p = get(currentProject);
    if (p) openAclModal(p);
  }

  function onProjectNameToolbarClick() {
    if (!cloudSyncAvailable || !toolbarCompact) return;
    openAclForCurrentProject();
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
    if (import.meta.env.DEV) {
      console.info('[tryAutoLoadInvitedProjects] local projects:', localProjectIds, 'auth user:', $authUser?.email);
    }

    const result = await autoLoadInvitedProjects(localProjectIds);

    if (import.meta.env.DEV) {
      console.info('[tryAutoLoadInvitedProjects] result:', result);
    }

    if (result.loaded > 0) {
      showPilotToast(`초대받은 프로젝트 ${result.loaded}개를 불러왔어 ✓`);
    }
    if (result.errors.length > 0) {
      const errMsg = result.errors.map((e) => `${e.projectId}: ${e.message}`).join('; ');
      console.warn('[autoLoadInvitedProjects] errors:', errMsg);
      showPilotToast(`프로젝트 불러오기 실패: ${errMsg}`);
    }
    if (result.skipped > 0) {
      if (import.meta.env.DEV) console.info(`[autoLoadInvitedProjects] ${result.skipped}개는 로컬에 있거나 cloud source가 비어 있어 스킵됨.`);
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
          await subscribeProjectPresence(atSubscribe, uid, email, emails);
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

  async function handleLogout() {
    const ok = await flushCloudWorkspaceNow('logout');
    if (!ok) showPilotToast('클라우드에 마지막 저장이 안 됐어. 다시 로그인한 뒤 잠시 기다리면 자동으로 올라가.');
    await signOutEverywhere();
  }

  onMount(() => {
    const { destroy } = mountPilotBridge();
    pilotReady = true;
    pilotSetActiveView($activeView);

    const mqToolbar = window.matchMedia('(max-width: 900px)');
    toolbarCompact = mqToolbar.matches;
    const onMqToolbar = () => {
      toolbarCompact = mqToolbar.matches;
    };
    mqToolbar.addEventListener('change', onMqToolbar);

    if (cloudSyncAvailable) startCloudBackgroundSync();

    const onExportSync = (ev: Event) => {
      const reason = (ev as CustomEvent<{ reason?: string }>).detail?.reason ?? 'export-output';
      const delayMs = reason === 'node-edit' ? 220 : 380;
      scheduleCloudFlush(reason, delayMs);
    };
    window.addEventListener('plannode-auto-cloud-sync', onExportSync);

    const onVis = () => {
      if (document.visibilityState === 'hidden') void flushCloudWorkspaceNow('visibility-hidden');
    };
    document.addEventListener('visibilitychange', onVis);

    const onPageHide = () => void flushCloudWorkspaceNow('pagehide');
    window.addEventListener('pagehide', onPageHide);

    return () => {
      mqToolbar.removeEventListener('change', onMqToolbar);
      stopCloudBackgroundSync();
      window.removeEventListener('plannode-auto-cloud-sync', onExportSync);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onPageHide);
      pilotReady = false;
      destroy();
    };
  });

  onDestroy(() => {
    unsubscribeProjectPresence();
  });

  $: if (pilotReady) pilotSetActiveView($activeView);
</script>

<svelte:window
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
  }}
  on:mousedown={onToolbarMenusOutside}
  on:resize={syncProjectModalScrollHint}
/>

<div id="root">
  <!-- SvelteKit 주입 props — 템플릿에서 참조해야 unused export 경고 없음 -->
  <span hidden>{JSON.stringify(data)}{JSON.stringify(params)}</span>
  <div id="R">
    <div id="TB" class:tb-with-user={!!$authUser}>
      <div class="tb-main">
        <div class="tb-row-logo">
          <span class="logo">Plannode</span>
          <span class="logo-s">by pseries</span>
          <div class="dv"></div>
        </div>
        <div class="tb-row-project">
          <span class="tb-proj-label">프로젝트:</span>
          <button
            type="button"
            id="PNT"
            class="pntag"
            class:pntag--share-entry={cloudSyncAvailable && !!$currentProject && toolbarCompact}
            disabled={!$currentProject}
            tabindex={cloudSyncAvailable && $currentProject && !toolbarCompact ? -1 : undefined}
            title={cloudSyncAvailable && $currentProject && toolbarCompact
              ? '프로젝트 공유 · 접근 허용 이메일 관리'
              : undefined}
            on:click={onProjectNameToolbarClick}
          >
            {$currentProject?.name || '—'}
          </button>
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
              title="화면 전환"
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
                  on:click={() => pickView('tree')}>트리 뷰</button>
                <button
                  type="button"
                  role="menuitem"
                  class="tb-view-menu-item"
                  class:tb-view-menu-item--on={$activeView === 'prd'}
                  on:click={() => pickView('prd')}>PRD</button>
                <button
                  type="button"
                  role="menuitem"
                  class="tb-view-menu-item"
                  class:tb-view-menu-item--on={$activeView === 'spec'}
                  on:click={() => pickView('spec')}>기능명세</button>
                <button
                  type="button"
                  role="menuitem"
                  class="tb-view-menu-item"
                  class:tb-view-menu-item--on={$activeView === 'ai'}
                  on:click={() => pickView('ai')}>AI 분석</button>
              </div>
            {/if}
          </div>
          <div class="tb-viewport-wrap" bind:this={viewportMenuWrapEl}>
            <button
              type="button"
              class="tb-viewport-btn"
              aria-haspopup="menu"
              aria-expanded={showViewportMenu}
              title="캔버스 보기 — 모두보기(창에 맞춤), 자동정렬"
              on:click={() => {
                const next = !showViewportMenu;
                showViewportMenu = next;
                if (next) {
                  showViewMenu = false;
                  showOutputMenu = false;
                }
              }}
            >
              <span class="tb-viewport-label">보기</span>
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
                  title="드래그로 저장된 수동 위치(mx/my) 전부 제거 → 트리 자동 배치"
                  on:click={() => triggerPilotViewport('BAR')}>자동정렬</button>
              </div>
            {/if}
          </div>
        <button type="button" id="BUN" title="실행 취소 (Ctrl+Z / ⌘Z)">↩</button>
        <div class="tb-output-wrap" bind:this={outputMenuWrapEl}>
          <button
            type="button"
            class="tb-output-btn"
            aria-haspopup="menu"
            aria-expanded={showOutputMenu}
            title="마크다운·PRD·JSON 보내기"
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
                title="기능 맵 마크다운 파일로 저장"
                on:click={() => triggerPilotOutput('BMD')}>MD 출력</button>
              <button
                type="button"
                role="menuitem"
                class="tb-output-menu-item tb-output-menu-item--prd"
                title="PRD 표준 가이드 v2.0 구조 마크다운으로 저장"
                on:click={() => triggerPilotOutput('BPR')}>PRD 출력 (v2.0)</button>
              <button
                type="button"
                role="menuitem"
                class="tb-output-menu-item"
                title="노드 트리 JSON (백업·재가져오기용)"
                on:click={() => triggerPilotOutput('BJN')}>JSON</button>
            </div>
          {/if}
        </div>
        <div class="pilot-wire-sinks" aria-hidden="true">
          <button type="button" id="BFT" class="pilot-wire-sink" tabindex="-1">모두보기</button>
          <button type="button" id="BAR" class="pilot-wire-sink" tabindex="-1">자동정렬</button>
          <button type="button" id="BMD" class="pilot-wire-sink" tabindex="-1">MD 출력</button>
          <button type="button" id="BPR" class="pilot-wire-sink" tabindex="-1">PRD 출력</button>
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

    <div id="VIEWS">
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
                ><span class="zc-hint">그룹이동: Shift+노드선택</span>
              </div>
              {#if cloudSyncAvailable && $currentProject}
                <div class="cw-presence" role="group" aria-label="이 프로젝트에 동시 접속 중인 허용 계정">
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
          <div class="prd-title" id="prd-title">PRD 문서</div>
          <div class="prd-meta" id="prd-meta"></div>
          <p class="prd-version-line" id="prd-version-line"></p>
        </div>
        <div class="prd-section">
          <h2>1. 기능명세 (Feature Specification)</h2>
          <p class="prd-section-hint">가이드 §2 섹션 1 — 프로젝트 메타·전체 트리·전 노드 PRD 블록·요약표·배지 (마크다운 원문)</p>
          <div class="prd-body" id="prd-s1"></div>
        </div>
        <div class="prd-section">
          <h2>2. 아키텍처 &amp; 기술 정책</h2>
          <p class="prd-section-hint">가이드 §2 섹션 2</p>
          <div class="prd-body" id="prd-s2"></div>
        </div>
        <div class="prd-section">
          <h2>3. 수용기준 &amp; 비기능 요구사항</h2>
          <p class="prd-section-hint">가이드 §2 섹션 3</p>
          <div class="prd-body" id="prd-s3"></div>
        </div>
        <div class="prd-section">
          <h2>4. 로드맵 &amp; 우선순위</h2>
          <p class="prd-section-hint">가이드 §2 섹션 4</p>
          <div class="prd-body" id="prd-s4"></div>
        </div>
        <div class="prd-section">
          <h2>5. 위험 요소 &amp; 완화 전략</h2>
          <p class="prd-section-hint">가이드 §2 섹션 5</p>
          <div class="prd-body" id="prd-s5"></div>
        </div>
      </div>

      <div class="view" class:active={$activeView === 'spec'} id="V-SPEC">
        <div class="spec-inner">
          <div class="spec-title">기능명세서</div>
          <table class="spec-table">
            <thead>
              <tr>
                <th style="width:60px">번호</th>
                <th style="width:80px">뎁스</th>
                <th>기능명</th>
                <th>설명</th>
                <th style="width:120px">배지</th>
              </tr>
            </thead>
            <tbody id="spec-tbody">
              <tr
                ><td colspan="5" style="text-align:center;padding:40px;color:#bbb;font-size:13px"
                  >프로젝트를 열면 자동 생성돼.</td
                ></tr
              >
            </tbody>
          </table>
        </div>
      </div>

      <div class="view" class:active={$activeView === 'ai'} id="V-AI">
        <div class="ai-inner">
          <div class="ai-title">AI 분석</div>
          <div class="ai-sub">현재 기능 트리를 분석해서 개발 가이드를 생성해</div>
          <div class="ai-btn-grid">
            <button type="button" class="ai-btn" id="ai-prd">
              <div class="ai-btn-icon">📄</div>
              <div class="ai-btn-title">PRD 완성본 생성</div>
              <div class="ai-btn-desc">기능 트리 → 완전한 PRD 문서</div>
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
            <div class="fg">
              <input
                class="fi"
                type="date"
                bind:value={projectStart}
                placeholder="시작일"
                aria-label="시작일"
              />
              <input
                class="fi"
                type="date"
                bind:value={projectEnd}
                placeholder="종료일"
                aria-label="종료일"
              />
            </div>
            <textarea
              class="fi"
              bind:value={projectDesc}
              rows="2"
              style="resize:vertical"
              placeholder="설명"
              aria-label="설명"
            ></textarea>
            <button type="button" class="bcr" on:click={handleProjectCreate}>+ 프로젝트 생성</button>
            <div class="proj-json-import">
              <input
                bind:this={jsonImportInput}
                type="file"
                accept="application/json,.json"
                class="json-import-input"
                aria-hidden="true"
                tabindex="-1"
                on:change={handleJsonImportChange}
              />
              <button
                type="button"
                id="BJI"
                class="proj-json-import-btn"
                title="plannode.tree v1 JSON 파일 가져오기"
                on:click={triggerJsonImport}
              >
                가져오기
              </button>
            </div>
          </div>
          <div class="pl">
            <div class="plt" id="PLT">이 기기의 프로젝트</div>
            {#if aclInvitesErr}
              <p class="acl-err">{aclInvitesErr}</p>
            {/if}
            <div id="PLC" data-svelte-managed="1">
              {#each $projects as proj}
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
                    <button
                      type="button"
                      class="pc"
                      on:click={() => void handleProjectSelect(proj)}
                    >
                      <div class="pi" style:background={$currentProject?.id === proj.id ? '#6b4ef6' : '#ede9fe'}>📁</div>
                      <div class="pif">
                        <div class="pn2">{proj.name}</div>
                        <div class="pm2">{proj.author}{aclProjectIdSet.has(proj.id) ? ' · 접근 허용됨' : ''}</div>
                      </div>
                      {#if $currentProject?.id === proj.id}
                        <span class="ct">현재</span>
                      {/if}
                    </button>
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
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
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
    /* 빈 영역은 캔버스로 클릭 통과; 자식(버튼·메뉴 등)은 유지 */
    pointer-events: none;
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
    color: #6b4ef6;
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

  .pntag {
    font-size: 12px;
    font-weight: 600;
    color: #1a1a1a;
    max-width: 130px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
  #BUN,
  #BPN {
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
    outline: 2px solid #6b4ef6;
    outline-offset: 2px;
  }

  .tb-output-btn[aria-expanded='true'] {
    border-color: #a89ef0;
    background: #f5f3ff;
    box-shadow: inset 0 1px 2px rgba(107, 78, 246, 0.08);
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
    color: #5b3fd9;
  }

  .tb-output-menu-item--prd {
    background: #f0ecff;
    color: #6b4ef6;
  }

  .tb-output-menu-item--prd:hover {
    background: #6b4ef6;
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
    outline: 2px solid #6b4ef6;
    outline-offset: 2px;
  }

  .tb-view-btn[aria-expanded='true'] {
    border-color: #a89ef0;
    background: #f5f3ff;
  }

  .tb-view-label {
    flex: 0 1 auto;
    text-align: left;
    color: #6b4ef6;
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
    color: #5b3fd9;
  }

  .tb-view-menu-item--on {
    background: #f0ecff;
    color: #6b4ef6;
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
    outline: 2px solid #6b4ef6;
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
    color: #5b3fd9;
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
    border: 1.5px solid #6b4ef6;
    color: #6b4ef6;
    background: #f0ecff;
  }

  .proj-json-import {
    position: relative;
    margin-top: 2px;
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
    color: #6b4ef6;
    background: #f5f3ff;
    outline: none;
    transition: background 0.15s ease, color 0.15s ease;
  }

  #BJI.proj-json-import-btn:hover {
    background: #ede9fe;
    color: #5b3fd9;
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
    background: #6b4ef6;
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
    background: linear-gradient(145deg, #8b7af0 0%, #5b3fd9 100%);
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
    border-color: #6b4ef6;
    box-shadow: 0 0 0 2px rgba(107, 78, 246, 0.2);
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
    background: #6b4ef6;
    color: #fff;
    border-color: #5b3fd9;
    margin-top: 8px;
  }

  .acct-btn-primary:hover:not(:disabled) {
    background: #5b3fd9;
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

  :global(.cp) {
    position: absolute;
    top: 10px;
    padding: 2px 10px;
    border-radius: 20px;
    font-size: 10px;
    font-weight: 700;
    pointer-events: none;
    z-index: 2;
  }
  :global(.cp0) {
    background: #6b4ef6;
    color: #fff;
  }
  :global(.cp1) {
    background: #f0ecff;
    color: #6b4ef6;
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

  :global(.nw) {
    position: absolute;
    z-index: 5;
  }
  :global(.nd) {
    background: #fff;
    border: 1px solid #e0dbd4;
    border-radius: 10px;
    width: 188px;
    cursor: pointer;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.07);
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  :global(.nd:hover) {
    border-color: #b8aff0;
    box-shadow: 0 2px 10px rgba(107, 78, 246, 0.12);
  }
  :global(.nd.sel) {
    border-color: #6b4ef6;
    box-shadow: 0 0 0 3px rgba(107, 78, 246, 0.15);
  }
  :global(.nd.msel) {
    box-shadow: 0 0 0 2px rgba(225, 29, 72, 0.35);
  }
  :global(.nd.rnd) {
    width: 168px;
    border-color: #d4caff;
  }
  :global(.ndt) {
    display: flex;
    align-items: flex-start;
    padding: 9px 9px 4px;
    gap: 6px;
  }
  :global(.nb) {
    width: 3px;
    border-radius: 2px;
    flex-shrink: 0;
    margin-top: 2px;
    align-self: stretch;
    min-height: 12px;
  }
  :global(.nn) {
    font-size: 12px;
    color: #1a1a1a;
    font-weight: 500;
    line-height: 1.35;
    word-break: break-word;
  }
  :global(.ndepth) {
    font-size: 9px;
    color: #ccc;
    font-family: monospace;
    margin-left: 3px;
  }
  :global(.nds) {
    font-size: 10px;
    color: #999;
    margin: 1px 9px 0;
    line-height: 1.4;
  }
  :global(.nm) {
    display: flex;
    align-items: center;
    padding: 4px 9px;
    gap: 3px;
    flex-wrap: wrap;
    min-height: 16px;
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
  :global(.nnum) {
    margin-left: auto;
    font-size: 9px;
    color: #ccc;
    font-family: monospace;
  }
  :global(.na) {
    display: flex;
    justify-content: flex-end;
    padding: 2px 7px 8px;
    gap: 4px;
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
    background: #6b4ef6;
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 6;
    box-shadow: 0 2px 5px rgba(107, 78, 246, 0.35);
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
    align-items: flex-end;
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
  .mm {
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
    border: 2px solid #6b4ef6;
    border-radius: 2px;
    pointer-events: none;
    background: rgba(107, 78, 246, 0.06);
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
    box-shadow: 0 0 0 2px rgba(107, 78, 246, 0.12);
  }
  .cw-presence-avatar--on {
    border-color: #6b4ef6;
    box-shadow: 0 0 0 2px rgba(107, 78, 246, 0.2);
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
    .zc-hint {
      font-size: 11px;
      line-height: 1.35;
      color: #666;
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
    border-bottom: 2px solid #6b4ef6;
  }
  .prd-title {
    font-size: 20px;
    font-weight: 700;
    color: #1a1a1a;
    margin-bottom: 6px;
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
    color: #5b3fd9;
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

  #V-SPEC {
    background: #fff;
    overflow-y: auto;
    gap: 0;
  }
  .spec-inner {
    padding: 22px 26px;
  }
  .spec-title {
    font-size: 15px;
    font-weight: 700;
    color: #1a1a1a;
    margin-bottom: 14px;
  }
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
    margin-bottom: 18px;
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
    box-shadow: 0 2px 8px rgba(107, 78, 246, 0.1);
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
    z-index: 5000;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
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
    z-index: 7000;
    white-space: nowrap;
    pointer-events: none;
  }

  .prd-section {
    margin-bottom: 18px;
  }
  .prd-section h2 {
    font-size: 14px;
    font-weight: 700;
    color: #6b4ef6;
    margin-bottom: 8px;
    padding-left: 10px;
    border-left: 3px solid #6b4ef6;
  }

  .spec-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .spec-table th {
    background: #f5f5f0;
    padding: 8px 12px;
    text-align: left;
    font-weight: 700;
    color: #555;
    border-bottom: 2px solid #e8e4de;
    white-space: nowrap;
  }
  .spec-table td {
    padding: 8px 12px;
    border-bottom: 1px solid #f0ece8;
    color: #333;
    vertical-align: top;
    line-height: 1.5;
  }
  .spec-table tr:hover td {
    background: #faf9ff;
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

  .bcr {
    width: 100%;
    padding: 10px;
    border-radius: 9px;
    border: none;
    background: #6b4ef6;
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    outline: none;
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
    color: #5b21b6;
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
    color: #6b4ef6;
  }

  .pm2 {
    font-size: 11px;
    color: #aaa;
  }

  .ct {
    font-size: 10px;
    background: #6b4ef6;
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

  @media (min-width: 901px) {
    .pm-scroll-hint-wrap {
      display: none !important;
    }
  }
</style>
