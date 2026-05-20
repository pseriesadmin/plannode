<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { nodes, currentProject } from '$lib/stores/projects';
  import { authSession } from '$lib/stores/authSession';
  import { pendingIaExportIntent, pendingIaTemplateExport } from '$lib/stores/iaExportIntent';
  import { isSupabaseCloudConfigured } from '$lib/supabase/env';
  import { runPlannodeIAExport, type IAExportIntent } from '$lib/ai/iaExportRunner';
  import {
    buildIaStructureMarkdownFromTree,
    buildWireframesMarkdownFromTree,
    resolveContextAnchorNodeId
  } from '$lib/ai/iaExporter';
  import { slugExportName } from '$lib/ai/iaGridCsvExport';

  type TemplateKind = 'ia' | 'wireframes';
  type ResultSource =
    | { kind: 'template'; template: TemplateKind }
    | { kind: 'ai'; intent: IAExportIntent };

  let loading: IAExportIntent | null = null;
  let resultText = '';
  let resultHint = '';
  let showModal = false;
  let modalEl: HTMLDivElement | undefined;
  let lastResultSource: ResultSource | null = null;
  /** 파일럿 `plannode-node-select` — L1 앵커(selId) */
  let pilotSelId: string | null = null;

  function onPilotNodeSelect(ev: Event) {
    const d = (ev as CustomEvent<{ nodeId?: string | null }>).detail;
    pilotSelId = d?.nodeId ?? null;
  }

  onMount(() => {
    if (typeof window === 'undefined') return;
    window.addEventListener('plannode-node-select', onPilotNodeSelect);
  });

  onDestroy(() => {
    if (typeof window === 'undefined') return;
    window.removeEventListener('plannode-node-select', onPilotNodeSelect);
  });

  function pilotToast(msg: string) {
    if (typeof window === 'undefined') return;
    try {
      window.dispatchEvent(new CustomEvent('plannode-pilot-toast', { detail: { message: msg } }));
    } catch {
      /* ignore */
    }
  }

  /** 트랙 A — PRD F2-4 정본: LLM 없이 동일 트리 → 동일 MD */
  const TEMPLATE_TRACK: {
    kind: TemplateKind;
    t: string;
    d: string;
  }[] = [
    {
      kind: 'ia',
      t: '정보 구조(IA) MD',
      d: '계층·IA 표·Mermaid — {slug}-ia.md (F4-3, LLM 없음)'
    },
    {
      kind: 'wireframes',
      t: '와이어프레임 키트 MD',
      d: '화면 목록·블록 뼈대 — {slug}-wireframes.md (F4-4, LLM 없음)'
    }
  ];

  /** 트랙 B — L5 AI 초안 (보조). 상단 출력·FUNCTIONAL_SPEC은 기존 `run` 경로 */
  const AI_TRACK: {
    heading: string;
    hint?: string;
    intents: IAExportIntent[];
  } = {
    heading: 'AI 초안 (보조)',
    hint: '서버 Claude — 문장·표 보강용. 구조 정본은 위 「구조보내기」예요.',
    intents: ['IA_STRUCTURE', 'SCREEN_LIST']
  };

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

  function projectMeta() {
    const p = get(currentProject);
    return p ? { name: p.name, description: p.description } : null;
  }

  function runTemplate(template: TemplateKind) {
    const n = get(nodes);
    const p = projectMeta();
    if (!p?.name) {
      pilotToast('프로젝트를 먼저 선택해줘.');
      return;
    }
    lastResultSource = { kind: 'template', template };
    resultHint =
      '로컬 템플릿 — 동일 트리면 항상 같은 내용이에요 (LLM·API 없음). 아래에서 저장·복사하면 돼요.';
    resultText =
      template === 'ia'
        ? buildIaStructureMarkdownFromTree(n, p)
        : buildWireframesMarkdownFromTree(n, p);
    showModal = true;
  }

  async function run(intent: IAExportIntent) {
    const n = get(nodes);
    const p = get(currentProject);
    const session = get(authSession);
    const token = session?.access_token ?? null;
    lastResultSource = { kind: 'ai', intent };
    loading = intent;
    resultHint = '';
    resultText = '';
    try {
      const currentNodeId = resolveContextAnchorNodeId(n, pilotSelId ?? (p?.id ? `${p.id}-r` : null));
      const res = await runPlannodeIAExport({
        nodes: n,
        activeProject: p ? { name: p.name, description: p.description } : null,
        planProjectId: p?.plan_project_id ?? null,
        plannodeProjectId: p?.id ?? null,
        currentNodeId,
        intent,
        accessToken: token
      });
      if (res.kind === 'text') {
        resultText = res.text;
        resultHint = '서버 응답(Claude). 아래는 마크다운/표로 복사해 쓰면 돼요.';
      } else if (res.kind === 'context_insufficient') {
        resultText = res.fallbackClipboard;
        resultHint = `${res.message} · 아래는 복사용 프롬프트(LAYER1 포함)예요.`;
        pilotToast(res.message);
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

  function resolveDownloadFilename(slug: string): string | null {
    const src = lastResultSource;
    if (!src) return null;
    if (src.kind === 'template') {
      return src.template === 'ia' ? `${slug}-ia.md` : `${slug}-wireframes.md`;
    }
    const nameByIntent: Record<IAExportIntent, string> = {
      IA_STRUCTURE: `${slug}-ia.md`,
      SCREEN_LIST: `${slug}-wireframes.md`,
      FUNCTIONAL_SPEC: `${slug}-functional-spec.md`
    };
    return nameByIntent[src.intent];
  }

  /** PRD M4 F4-3·F4-4 — 슬러그-ia.md / 슬러그-wireframes.md */
  function downloadResultMd() {
    if (!resultText.trim() || typeof document === 'undefined') return;
    const p = get(currentProject);
    if (!p?.name) {
      pilotToast('프로젝트를 먼저 선택해줘.');
      return;
    }
    const slug = slugExportName(p.name);
    const fname = resolveDownloadFilename(slug);
    if (!fname) return;
    const blob = new Blob([resultText], { type: 'text/markdown;charset=utf-8' });
    try {
      const u = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = u;
      a.download = fname;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(u);
      pilotToast(`${fname} 저장했어.`);
      try {
        window.dispatchEvent(new CustomEvent('plannode-auto-cloud-sync', { detail: { reason: 'ia-md-export' } }));
      } catch {
        /* ignore */
      }
    } catch {
      pilotToast('파일 저장이 막혔어. 다시 시도해줘.');
    }
  }

  $: downloadFileHint =
    $currentProject && lastResultSource
      ? (() => {
          const s = slugExportName($currentProject.name);
          const f = resolveDownloadFilename(s);
          return f ? `마크다운 파일로 저장 (${f})` : '마크다운 파일로 저장';
        })()
      : '마크다운 파일로 저장';

  $: modalTitle =
    lastResultSource?.kind === 'template' ? '구조보내기 (템플릿)' : '문서 초안 (서버 AI)';

  $: if (showModal) {
    void tick().then(() => {
      modalEl?.querySelector<HTMLButtonElement>('.iax-copy')?.focus();
    });
  }

  /** 상단 「출력」→ 구조보내기(트랙 A) 1회 실행 */
  $: {
    const pt = $pendingIaTemplateExport;
    if (pt) {
      pendingIaTemplateExport.set(null);
      runTemplate(pt);
    }
  }

  /** 상단 「출력」→ L5 인텐트(트랙 B) 1회 실행 */
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
    <strong>정보 구조(IA)</strong>는 노드 트리에서 뽑는 <strong>구조</strong>예요 (LLM이 아님).
    <strong>구조보내기</strong>는 API 없이 항상 같은 MD를 만들고,
    <strong>AI 초안</strong>은 서버 Claude로 문장·표를 보강하는 <strong>보조</strong>예요.
    <strong>「AI 분석」탭</strong>은 별도(F2-5)예요.
  </p>
  {#if $nodes.length === 0}
    <p class="iax-empty" role="status">
      아직 트리에 노드가 없어요. 왼쪽 캔버스에서 노드를 추가한 뒤 다시 와 주세요. (초안은 현재 트리·그리드 메타를 기준으로 뽑아요.)
    </p>
  {/if}
  <div class="iax-tracks">
    <div class="iax-track iax-track-a">
      <h4 class="iax-track-h">구조보내기 (정본 · LLM 없음)</h4>
      <p class="iax-track-hint">동일 트리 → 동일 MD. 네트워크 없이 바로 미리보기·저장해요.</p>
      <div class="iax-grid">
        {#each TEMPLATE_TRACK as row (row.kind)}
          <button
            type="button"
            class="iax-btn iax-btn-template"
            disabled={$nodes.length === 0}
            aria-label={`${row.t}. ${row.d}`}
            on:click={() => runTemplate(row.kind)}
          >
            <span class="iax-btn-title">{row.t}</span>
            <span class="iax-btn-desc">{row.d}</span>
          </button>
        {/each}
      </div>
    </div>
    <div class="iax-track iax-track-b">
      <h4 class="iax-track-h">{AI_TRACK.heading}</h4>
      {#if AI_TRACK.hint}
        <p class="iax-track-hint">{AI_TRACK.hint}</p>
      {/if}
      {#if !isSupabaseCloudConfigured()}
        <p class="iax-hint iax-hint-inline">Supabase 꺼짐 → 복사용 프롬프트만 (서버 AI 없음).</p>
      {/if}
      <div class="iax-grid">
        {#each AI_TRACK.intents as intent (intent)}
          <button
            type="button"
            class="iax-btn iax-btn-ai"
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
      <h3 id="iax-modal-title" class="iax-modal-h">{modalTitle}</h3>
      <p class="iax-modal-sub">{resultHint}</p>
      <pre class="iax-pre" id="iax-result-text">{resultText}</pre>
      <div class="iax-modal-actions">
        <button type="button" class="iax-dl" title={downloadFileHint} on:click={downloadResultMd}>마크다운 저장</button>
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
  .iax-lead {
    font-size: 13px;
    color: #444;
    line-height: 1.5;
    margin: 0 0 14px;
    max-width: 560px;
  }
  .iax-hint {
    font-size: 12px;
    color: #888;
    margin: 0 0 12px;
  }
  .iax-hint-inline {
    margin: 0 0 10px;
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
  .iax-track-a {
    padding-bottom: 4px;
    border-bottom: 1px dashed #d8d4f0;
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
  .iax-btn-template {
    border-color: #2d6a4f;
    background: #f8fdf9;
  }
  .iax-btn-ai {
    border-color: #e4e0ff;
    background: #fafaff;
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
  .iax-dl,
  .iax-close {
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    border: 1px solid #ccc;
    background: #fff;
  }
  .iax-dl {
    border-color: #2d6a4f;
    color: #1b4332;
    background: #f0fdf4;
  }
  .iax-copy {
    border-color: #631EED;
    color: #3d36b5;
  }
</style>
