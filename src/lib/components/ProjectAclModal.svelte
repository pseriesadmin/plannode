<script lang="ts">
  import { onMount } from 'svelte';
  import type { Project } from '$lib/supabase/client';
  import {
    addAllowedEmail,
    claimProjectOwner,
    closeAclModal,
    fetchProjectAcl,
    removeAclEmail,
    canManageProjectAcl,
    repairProjectAclWorkspaceSources,
    type AclRow
  } from '$lib/supabase/projectAcl';
  import { getAuthUserId } from '$lib/stores/authSession';
  import { isAclReloadHelpMessage } from '$lib/supabase/aclErrors';

  export let project: Project;
  export let onToast: (msg: string) => void;

  let rows: AclRow[] = [];
  let loadErr = '';
  let newEmail = '';
  let busy = false;
  let canManage = false;

  async function refresh() {
    loadErr = '';
    const uid = getAuthUserId();
    if (uid && project.owner_user_id === uid) {
      const rep = await repairProjectAclWorkspaceSources(project.id);
      if (import.meta.env.DEV && rep.ok && (rep.fixed ?? 0) > 0) {
        console.info('[ProjectAclModal] ACL workspace_source 복구:', rep.fixed, '행');
      }
    }
    const r = await fetchProjectAcl(project.id);
    rows = r.rows;
    if (r.error) loadErr = r.error;
    canManage = await canManageProjectAcl(project);
  }

  onMount(() => {
    void refresh();
  });

  async function onClaim() {
    busy = true;
    try {
      const r = await claimProjectOwner(project);
      onToast(r.message);
      if (r.ok) await refresh();
    } finally {
      busy = false;
    }
  }

  async function onAdd() {
    busy = true;
    try {
      const r = await addAllowedEmail(project.id, newEmail);
      onToast(r.message);
      if (r.ok) {
        newEmail = '';
        await refresh();
      }
    } finally {
      busy = false;
    }
  }

  async function onRemove(row: AclRow) {
    if (!confirm(`${row.email} 접근을 제거할까?`)) return;
    busy = true;
    try {
      const r = await removeAclEmail(project.id, row.email, row.is_owner);
      onToast(r.message);
      if (r.ok) await refresh();
    } finally {
      busy = false;
    }
  }
</script>

<div class="mbg" role="presentation" on:click|self={closeAclModal}>
  <div class="mo">
    <div class="hdr">
      <h3>공유계정 설정</h3>
      <button type="button" class="mcl" on:click={closeAclModal}>✕</button>
    </div>
    <p class="pn">{project.name}</p>

    {#if loadErr}
      <p class="err preline">{loadErr}</p>
      {#if isAclReloadHelpMessage(loadErr)}
        <div class="rebtn">
          <button type="button" class="bcr sm" disabled={busy} on:click={() => void refresh()}>다시 불러오기</button>
        </div>
      {/if}
    {/if}

    {#if rows.length === 0 && !project.owner_user_id}
      <div class="banner">
        <p>아직 소유자가 등록되지 않았어. 먼저 본인을 소유자로 등록하면 다른 이메일을 초대할 수 있어.</p>
        <p class="banner-sub">이 프로젝트를 다른 계정이랑 공유하려면 반드시 소유자로 등록한 뒤 ☁↑를 해줘.</p>
        <button type="button" class="bcr" disabled={busy || !canManage} on:click={() => void onClaim()}>내 계정을 소유자로 등록</button>
      </div>
    {:else if rows.length === 0 && project.owner_user_id}
      <p class="warn">클라우드 ACL이 비어 있어. 아래에서 멤버를 추가하거나 소유자 계정으로 다시 동기화해줘.</p>
    {/if}

    {#if rows.length > 0}
      <ul class="list">
        {#each rows as row}
          <li>
            <span class="em">{row.email}</span>
            {#if row.is_owner}
              <span class="tag">소유자</span>
            {:else}
              <span class="tag g">멤버</span>
            {/if}
            {#if canManage}
              <button type="button" class="rm" disabled={busy} on:click={() => void onRemove(row)}>제거</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if canManage && (rows.length > 0 || project.owner_user_id)}
      <div class="add">
        <span class="lb">이메일 등록</span>
        <div class="row">
          <input class="in" type="email" placeholder="동료@example.com" bind:value={newEmail} />
          <button type="button" class="bcr sm" disabled={busy || !newEmail.trim()} on:click={() => void onAdd()}>추가</button>
        </div>
      </div>
    {/if}

    {#if !canManage && rows.length > 0}
      <p class="hint">소유자만 이메일을 추가·제거할 수 있어.</p>
    {/if}
  </div>
</div>

<style>
  .mbg {
    position: fixed;
    inset: 0;
    z-index: 8000;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .mo {
    width: 100%;
    max-width: 440px;
    max-height: 90vh;
    overflow: auto;
    background: #fff;
    border-radius: 14px;
    padding: 18px 20px 22px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18);
  }
  .hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  h3 {
    margin: 0;
    font-size: 1.1rem;
  }
  .mcl {
    border: none;
    background: transparent;
    font-size: 18px;
    cursor: pointer;
    color: #888;
  }
  .pn {
    margin: 0 0 14px;
    font-weight: 700;
    color: #6b4ef6;
    font-size: 14px;
  }
  .err {
    color: #b91c1c;
    font-size: 13px;
    margin-bottom: 10px;
  }
  .err.preline {
    white-space: pre-line;
    line-height: 1.55;
  }
  .rebtn {
    margin-bottom: 14px;
  }
  .warn {
    color: #92400e;
    font-size: 12px;
    margin-bottom: 12px;
  }
  .banner {
    background: #f5f3ff;
    border: 1px solid #ddd6fe;
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 12px;
  }
  .banner p {
    margin: 0 0 10px;
    font-size: 12px;
    color: #444;
    line-height: 1.5;
  }
  .banner-sub {
    font-size: 11px;
    color: #7c3aed;
    font-weight: 500;
  }
  .list {
    list-style: none;
    margin: 0 0 14px;
    padding: 0;
    border: 1px solid #e8e4de;
    border-radius: 10px;
    overflow: hidden;
  }
  .list li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid #eee;
    font-size: 13px;
  }
  .list li:last-child {
    border-bottom: none;
  }
  .em {
    flex: 1;
    word-break: break-all;
  }
  .tag {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 6px;
    background: #ede9fe;
    color: #5b21b6;
  }
  .tag.g {
    background: #ecfdf5;
    color: #166534;
  }
  .rm {
    font-size: 11px;
    border: 1px solid #fca5a5;
    background: #fff1f2;
    color: #b91c1c;
    border-radius: 6px;
    padding: 4px 8px;
    cursor: pointer;
  }
  .add .lb {
    display: block;
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 6px;
  }
  .row {
    display: flex;
    gap: 8px;
  }
  .in {
    flex: 1;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid #ccc;
    font-size: 13px;
  }
  .bcr {
    padding: 10px 14px;
    border: none;
    border-radius: 8px;
    background: #6b4ef6;
    color: #fff;
    font-weight: 700;
    cursor: pointer;
    font-size: 13px;
  }
  .bcr:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .bcr.sm {
    padding: 8px 12px;
    white-space: nowrap;
  }
  .hint {
    font-size: 11px;
    color: #888;
    margin-top: 8px;
  }
</style>
