<script lang="ts">
  import { tick } from 'svelte';
  import { get } from 'svelte/store';
  import { nodes, currentProject } from '$lib/stores/projects';
  import { authSession } from '$lib/stores/authSession';
  import { pendingIaExportIntent } from '$lib/stores/iaExportIntent';
  import { isSupabaseCloudConfigured } from '$lib/supabase/env';
  import { runPlannodeIAExport, type IAExportIntent } from '$lib/ai/iaExportRunner';

  let loading: IAExportIntent | null = null;
  let resultText = '';
  let resultHint = '';
  let showModal = false;
  let modalEl: HTMLDivElement | undefined;

  function pilotToast(msg: string) {
    if (typeof window === 'undefined') return;
    try {
      window.dispatchEvent(new CustomEvent('plannode-pilot-toast', { detail: { message: msg } }));
    } catch {
      /* ignore */
    }
  }

  /** IA 탭: IA 구조·화면목록 초안만 (기능명세 정렬은 기능명세 보기에서 처리). 상단 출력 등에서 FUNCTIONAL_SPEC은 기존처럼 `run`으로 처리 가능 */
  const IA_TRACKS: {
    heading: string;
    hint?: string;
    intents: IAExportIntent[];
  }[] = [{ heading: '', intents: ['IA_STRUCTURE', 'SCREEN_LIST'] }];

  const LABELS: Record<IAExportIntent, { t: string; d: string }> = {
    IA_STRUCTURE: {
      t: '메뉴·계층 구조',
      d: '메뉴 ID·상위·화면 유형·Mermaid (표 + 다이어그램 초안)'
    },
    SCREEN_LIST: {
      t: '화면 목록',
      d: '화면 ID·경로·접근·우선순위·연결 화면 (마크다운 표)'
    },
    FUNCTIONAL_SPEC: {
      t: '기능·요구 표',
      d: '기능 ID·설명·사용자 유형·입출력·예외·우선순위 (기능명세 열)'
    }
  };

  async function run(intent: IAExportIntent) {
    const n = get(nodes);
    const p = get(currentProject);
    const session = get(authSession);
    const token = session?.access_token ?? null;
    loading = intent;
    resultHint = '';
    resultText = '';
    try {
      const res = await runPlannodeIAExport({
        nodes: n,
        activeProject: p ? { name: p.name, description: p.description } : null,
        planProjectId: p?.plan_project_id ?? null,
        plannodeProjectId: p?.id ?? null,
        intent,
        accessToken: token
      });
      if (res.kind === 'text') {
        resultText = res.text;
        resultHint = '서버 응답(Claude). 아래는 마크다운/표로 복사해 쓰면 돼요.';
      } else if (res.kind === 'no_key') {
        resultText = res.fallbackClipboard;
        resultHint =
          '서버에 AI 키가 없어. 복사용 전체 프롬프트예요 — 외부 챗봇에 붙여넣기.';
        pilotToast('서버 AI 키가 없어. 복사용 프롬프트를 모달에서 복사해줘.');
      } else if (res.kind === 'unauthorized') {
        resultText = res.fallbackClipboard;
        resultHint = `${res.message} · 아래는 복사용 프롬프트예요.`;
        pilotToast('로그인이 필요하거나 세션이 만료됐어. 복사용 프롬프트를 확인해줘.');
      } else {
        resultText = res.message;
        resultHint = '오류';
        pilotToast(`문서 초안 오류: ${res.message}`);
      }
    } catch (e) {
      resultText = e instanceof Error ? e.message : String(e);
      resultHint = '클라이언트 오류';
      pilotToast('문서 초안 요청 중 오류가 났어. 다시 시도해줘.');
    } finally {
      loading = null;
      showModal = true;
    }
  }

  function closeModal() {
    showModal = false;
  }

  async function copyResult() {
    if (!resultText || typeof navigator === 'undefined') return;
    try {
      await navigator.clipboard.writeText(resultText);
      pilotToast('클립보드에 복사했어.');
    } catch {
      pilotToast('복사에 실패했어. 브라우저 권한·HTTPS를 확인해줘.');
    }
  }

  $: if (showModal) {
    void tick().then(() => {
      modalEl?.querySelector<HTMLButtonElement>('.iax-copy')?.focus();
    });
  }

  /** 상단 「출력」메뉴에서 IA 인텐트만 넘긴 경우 자동 1회 실행 */
  $: {
    const pi = $pendingIaExportIntent;
    if (pi) {
      pendingIaExportIntent.set(null);
      void run(pi);
    }
  }
</script>

<svelte:window
  on:keydown={(e) => {
    if (!showModal || e.key !== 'Escape') return;
    e.preventDefault();
    closeModal();
  }}
/>

<div class="iax">
  <p class="iax-lead">
    <strong>문서 초안 (AI)</strong> — 아래 보기(IA / 기능명세)와 같은 열을 기준으로 표·다이어그램 초안을 뽑아요. 서버에 Claude가 있을 때만 자동 생성돼요.
  </p>
  {#if !isSupabaseCloudConfigured()}
    <p class="iax-hint">Supabase가 꺼져 있으면 «복사용 프롬프트»만 써요 (서버 AI 없음).</p>
  {/if}
  {#if $nodes.length === 0}
    <p class="iax-empty" role="status">
      아직 트리에 노드가 없어요. 왼쪽 캔버스에서 노드를 추가한 뒤 다시 와 주세요. (초안은 현재 트리·그리드 메타를 기준으로 뽑아요.)
    </p>
  {/if}
  <div class="iax-tracks">
    {#each IA_TRACKS as track (track.intents.join(','))}
      <div class="iax-track">
        {#if track.heading}
          <h4 class="iax-track-h">{track.heading}</h4>
        {/if}
        {#if track.hint}
          <p class="iax-track-hint">{track.hint}</p>
        {/if}
        <div class="iax-grid">
          {#each track.intents as intent (intent)}
            <button
              type="button"
              class="iax-btn"
              disabled={!!loading || $nodes.length === 0}
              aria-label={`${LABELS[intent].t}. ${LABELS[intent].d}`}
              on:click={() => run(intent)}
            >
              <span class="iax-btn-title">{LABELS[intent].t}</span>
              <span class="iax-btn-desc">{LABELS[intent].d}</span>
              {#if loading === intent}<span class="iax-loading" aria-hidden="true">…</span>{/if}
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>

{#if showModal}
  <div
    class="iax-dim"
    role="presentation"
    on:click|self={closeModal}
    on:keydown={(e) => e.key === 'Escape' && closeModal()}
  >
    <div
      bind:this={modalEl}
      class="iax-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="iax-modal-title"
    >
      <h3 id="iax-modal-title" class="iax-modal-h">문서 초안 (AI)</h3>
      <p class="iax-modal-sub">{resultHint}</p>
      <pre class="iax-pre" id="iax-result-text">{resultText}</pre>
      <div class="iax-modal-actions">
        <button type="button" class="iax-copy" on:click={copyResult}>복사</button>
        <button type="button" class="iax-close" on:click={closeModal}>닫기</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .iax {
    flex-shrink: 0;
    padding: 10px 0 16px;
    border-top: 1px solid #c5ccd5;
    margin-top: 4px;
  }
  .iax-hint {
    font-size: 12px;
    color: #888;
    margin: 0 0 12px;
  }
  .iax-empty {
    font-size: 13px;
    color: #555;
    margin: 0 0 14px;
    padding: 10px 12px;
    border-radius: 8px;
    background: #f5f3ff;
    border: 1px solid #e4e0ff;
    line-height: 1.45;
  }
  .iax-tracks {
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-width: 560px;
  }
  .iax-track-h {
    margin: 0 0 6px;
    font-size: 13px;
    font-weight: 700;
    color: #2d2a44;
    letter-spacing: -0.02em;
  }
  .iax-track-hint {
    margin: 0 0 10px;
    font-size: 12px;
    color: #666;
    line-height: 1.4;
  }
  .iax-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .iax-loading {
    margin-left: 6px;
    font-weight: 600;
  }
  .iax-btn {
    text-align: left;
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid #e4e0ff;
    background: #fafaff;
    cursor: pointer;
  }
  .iax-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .iax-btn-title {
    display: block;
    font-weight: 600;
    font-size: 15px;
  }
  .iax-btn-desc {
    display: block;
    font-size: 12px;
    color: #666;
    margin-top: 4px;
  }
  .iax-dim {
    position: fixed;
    inset: 0;
    z-index: 10050;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .iax-modal {
    background: #fff;
    border-radius: 12px;
    max-width: min(900px, 100%);
    max-height: min(86vh, 100%);
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }
  .iax-modal-h {
    margin: 0;
    padding: 16px 20px 0;
    font-size: 16px;
  }
  .iax-modal-sub {
    margin: 8px 20px 0;
    font-size: 12px;
    color: #666;
  }
  .iax-pre {
    margin: 12px 20px 0;
    padding: 12px;
    background: #f6f4ff;
    border-radius: 8px;
    overflow: auto;
    max-height: 50vh;
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .iax-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px 16px;
  }
  .iax-copy,
  .iax-close {
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    border: 1px solid #ccc;
    background: #fff;
  }
  .iax-copy {
    border-color: #6b61f6;
    color: #3d36b5;
  }
</style>
