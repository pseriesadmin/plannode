<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import {
    defaultBadgePool,
    loadBadgePoolConfig,
    saveBadgePoolConfig,
    resetBadgePoolConfigToDefaults,
    isValidBadgeToken,
    type BadgePoolTracks,
  } from '$lib/ai/badgePoolConfig';

  const dispatch = createEventDispatcher<{ close: void; saved: void }>();

  let draft: BadgePoolTracks = defaultBadgePool();
  let addInputs: Record<'dev' | 'ux' | 'prj', string> = { dev: '', ux: '', prj: '' };
  let formError = '';

  function syncFromStorage() {
    draft = loadBadgePoolConfig();
    addInputs = { dev: '', ux: '', prj: '' };
    formError = '';
  }

  onMount(() => {
    syncFromStorage();
  });

  function close() {
    dispatch('close');
  }

  function removeToken(track: keyof BadgePoolTracks, token: string) {
    draft[track] = draft[track].filter((t) => t !== token);
    draft = draft;
  }

  function addToken(track: keyof BadgePoolTracks) {
    const raw = addInputs[track];
    formError = '';
    if (!raw.trim()) return;
    if (!isValidBadgeToken(raw)) {
      formError = '토큰은 영문 대문자로 시작하고, 2~15자의 대문자·숫자만 사용해줘.';
      return;
    }
    const u = raw.trim().toUpperCase();
    if (draft[track].includes(u)) {
      formError = '이미 같은 트랙에 있어.';
      return;
    }
    draft[track] = [...draft[track], u];
    addInputs[track] = '';
    draft = draft;
    addInputs = addInputs;
  }

  function save() {
    saveBadgePoolConfig(draft);
    dispatch('saved');
    close();
  }

  function resetDefaults() {
    if (!confirm('표준 배지를 기본 21개로 되돌릴까?')) return;
    draft = resetBadgePoolConfigToDefaults();
    dispatch('saved');
    close();
  }

  const trackMeta: { key: keyof BadgePoolTracks; title: string; hint: string }[] = [
    { key: 'dev', title: 'DEV — 개발·구현', hint: 'TDD, API, AUTH 등' },
    { key: 'ux', title: 'UX — 화면 구성', hint: 'LIST, FORM, MODAL 등' },
    { key: 'prj', title: 'PRJ — 제품·범위', hint: 'MVP, USP, MOBILE 등' },
  ];
</script>

<div class="bpm-bg" role="presentation" on:click|self={close}>
    <div class="bpm mo" role="dialog" aria-labelledby="bpm-title" aria-modal="true">
      <div class="bpm-head">
        <h3 id="bpm-title">표준 배지 설정</h3>
        <button type="button" class="bpm-x" aria-label="닫기" on:click={close}>✕</button>
      </div>
      <p class="bpm-lead">
        노드 편집·가져오기 정리에 쓰는 <strong>허용 배지 풀</strong>이야. 이 기기 브라우저에만 저장돼.
      </p>
      {#if formError}
        <p class="bpm-err">{formError}</p>
      {/if}
      <div class="bpm-body">
        {#each trackMeta as { key, title, hint }}
          <section class="bpm-track">
            <div class="bpm-track-h">
              <span class="bpm-track-t">{title}</span>
              <span class="bpm-track-s">{hint}</span>
            </div>
            <div class="bpm-chips">
              {#each draft[key] as tok (tok)}
                <button type="button" class="bpm-chip" on:click={() => removeToken(key, tok)} title="클릭하여 제거">
                  {tok}<span class="bpm-chip-x"> ×</span>
                </button>
              {:else}
                <span class="bpm-empty">(비어 있음)</span>
              {/each}
            </div>
            <div class="bpm-add">
              <input
                class="bpm-inp"
                type="text"
                maxlength="15"
                placeholder="추가 (예: SSO)"
                aria-label={`${title} 배지 추가`}
                bind:value={addInputs[key]}
                on:keydown={(e) => e.key === 'Enter' && (e.preventDefault(), addToken(key))}
              />
              <button type="button" class="bpm-btn bpm-btn-sec" on:click={() => addToken(key)}>추가</button>
            </div>
          </section>
        {/each}
      </div>
      <div class="bpm-foot">
        <button type="button" class="bpm-btn bpm-btn-ghost" on:click={resetDefaults}>기본값으로 되돌리기</button>
        <div class="bpm-foot-r">
          <button type="button" class="bpm-btn bpm-btn-ghost" on:click={close}>취소</button>
          <button type="button" class="bpm-btn bpm-btn-primary" on:click={save}>저장</button>
        </div>
      </div>
    </div>
  </div>

<style>
  .bpm-bg {
    position: fixed;
    inset: 0;
    z-index: 12000;
    background: rgba(15, 15, 20, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .bpm {
    width: min(520px, 100%);
    max-height: min(88vh, 640px);
    display: flex;
    flex-direction: column;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.18);
    overflow: hidden;
  }
  .bpm-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 10px;
    border-bottom: 1px solid #ece8e3;
    flex-shrink: 0;
  }
  .bpm-head h3 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    color: #1a1a1a;
  }
  .bpm-x {
    border: none;
    background: transparent;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    color: #888;
    padding: 4px 8px;
    border-radius: 6px;
  }
  .bpm-x:hover {
    background: #f3f4f6;
    color: #111;
  }
  .bpm-lead {
    margin: 0;
    padding: 10px 16px 0;
    font-size: 13px;
    color: #555;
    line-height: 1.5;
  }
  .bpm-err {
    margin: 8px 16px 0;
    font-size: 12px;
    color: #b91c1c;
  }
  .bpm-body {
    padding: 12px 16px 8px;
    overflow-y: auto;
    flex: 1 1 auto;
    min-height: 0;
  }
  .bpm-track {
    margin-bottom: 14px;
  }
  .bpm-track-h {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px 10px;
    margin-bottom: 6px;
  }
  .bpm-track-t {
    font-size: 12px;
    font-weight: 700;
    color: #334155;
  }
  .bpm-track-s {
    font-size: 11px;
    color: #94a3b8;
  }
  .bpm-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-height: 28px;
    margin-bottom: 8px;
  }
  .bpm-chip {
    border: 1.5px solid #c4b5fd;
    background: #faf5ff;
    color: #2C155A;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 999px;
    cursor: pointer;
    font-family: inherit;
  }
  .bpm-chip:hover {
    background: #f3e8ff;
  }
  .bpm-chip-x {
    opacity: 0.7;
    margin-left: 2px;
  }
  .bpm-empty {
    font-size: 12px;
    color: #bbb;
  }
  .bpm-add {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .bpm-inp {
    flex: 1;
    min-width: 0;
    padding: 8px 10px;
    border: 1.5px solid #e0dbd4;
    border-radius: 8px;
    font-size: 13px;
    font-family: inherit;
  }
  .bpm-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 16px 14px;
    border-top: 1px solid #ece8e3;
    flex-shrink: 0;
    background: #fafaf9;
  }
  .bpm-foot-r {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }
  .bpm-btn {
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    font-family: inherit;
  }
  .bpm-btn-primary {
    background: #631EED;
    color: #fff;
  }
  .bpm-btn-primary:hover {
    filter: brightness(1.05);
  }
  .bpm-btn-sec {
    background: #e8e4ff;
    color: #4c1d95;
  }
  .bpm-btn-ghost {
    background: transparent;
    color: #64748b;
  }
  .bpm-btn-ghost:hover {
    background: #f1f5f9;
    color: #334155;
  }
</style>
