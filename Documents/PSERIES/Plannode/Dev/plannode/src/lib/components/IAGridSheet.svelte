<script lang="ts">
  import { get } from 'svelte/store';
  import { nodes, currentProject, touchProjectUpdatedAt } from '$lib/stores/projects';
  import type { Node } from '$lib/supabase/client';
  import type { IaGridRowMeta } from '$lib/ai/types';
  import { downloadIaGridCsv } from '$lib/ai/iaGridCsvExport';

  const NODES_PREFIX = 'plannode_nodes_v3_';

  const DEPTH_LABELS = ['루트', '모듈', '기능', '상세기능', '서브기능', '세부항목', '하위항목', '기타'];

  function readIa(n: Node): IaGridRowMeta {
    const m = n.metadata?.iaGrid;
    return m && typeof m === 'object' ? { ...m } : {};
  }

  function parentName(list: Node[], parentId: string | undefined): string {
    if (!parentId) return '—';
    const p = list.find((x) => x.id === parentId);
    return p?.name?.trim() ? p.name : '—';
  }

  function depthLabel(d: number): string {
    const i = Math.max(0, Math.min(d, DEPTH_LABELS.length - 1));
    return DEPTH_LABELS[i] ?? `Lv${d}`;
  }

  function onIaInput(nodeId: string, field: keyof IaGridRowMeta, ev: Event) {
    const pid = $currentProject?.id;
    if (!pid) return;
    const raw = (ev.currentTarget as HTMLInputElement | HTMLTextAreaElement).value;
    nodes.update((list) => {
      const next = list.map((n) => {
        if (n.id !== nodeId) return n;
        const prev = readIa(n);
        const iaGrid: IaGridRowMeta = { ...prev, [field]: raw };
        const base =
          n.metadata && typeof n.metadata === 'object' ? { ...n.metadata } : {};
        const metadata = { ...base, iaGrid };
        return { ...n, metadata, updated_at: new Date().toISOString() };
      });
      try {
        localStorage.setItem(NODES_PREFIX + pid, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    touchProjectUpdatedAt(pid);
  }

  $: sorted = [...$nodes].sort((a, b) =>
    (a.num || '').localeCompare(b.num || '', undefined, { numeric: true })
  );
  $: hasProject = !!$currentProject;

  function pilotToast(msg: string) {
    if (typeof window === 'undefined') return;
    try {
      window.dispatchEvent(new CustomEvent('plannode-pilot-toast', { detail: { message: msg } }));
    } catch {
      /* ignore */
    }
  }

  function onDownloadCsv() {
    downloadIaGridCsv(get(currentProject), get(nodes), pilotToast);
  }
</script>

<div class="ia-sheet-wrap" aria-label="IA 스프레드시트 영역">
  <header class="ia-sheet-header ia-sheet-header-strip" aria-label="IA 상단">
    <div class="ia-sheet-header-main">
      <div class="ia-sheet-title">정보구조(IA) — 스프레드시트</div>
    </div>
    <div class="ia-sheet-header-actions" role="toolbar" aria-label="IA 표 내보내기(CSV)">
      <button
        type="button"
        class="ia-dl-btn"
        disabled={!hasProject || sorted.length === 0}
        on:click={onDownloadCsv}
      >
        엑셀용 CSV 다운로드
      </button>
    </div>
  </header>

  {#if !hasProject}
    <p class="ia-sheet-empty">프로젝트를 열면 행이 채워져요.</p>
  {:else if sorted.length === 0}
    <p class="ia-sheet-empty">노드가 없어요.</p>
  {:else}
    <div class="ia-sheet-scroll" role="region" aria-label="IA 편집 표">
      <table class="ia-sheet-table">
        <colgroup>
          <col class="ia-col ia-col--num" />
          <col class="ia-col ia-col--depth" />
          <col class="ia-col ia-col--name" />
          <col class="ia-col ia-col--mid" />
          <col class="ia-col ia-col--scode" />
          <col class="ia-col ia-col--pm" />
          <col class="ia-col ia-col--path" />
          <col class="ia-col ia-col--route" />
          <col class="ia-col ia-col--stype" />
          <col class="ia-col ia-col--short" />
          <col class="ia-col ia-col--short" />
          <col class="ia-col ia-col--acc" />
          <col class="ia-col ia-col--authz" />
          <col class="ia-col ia-col--api" />
          <col class="ia-col ia-col--prio" />
          <col class="ia-col ia-col--link" />
          <col class="ia-col ia-col--note" />
        </colgroup>
        <thead>
          <tr>
            <th class="ia-sheet-th">기능ID</th>
            <th class="ia-sheet-th">뎁스</th>
            <th class="ia-sheet-th">메뉴명</th>
            <th class="ia-sheet-th">메뉴ID</th>
            <th class="ia-sheet-th ia-sheet-th--tech">화면코드</th>
            <th class="ia-sheet-th">상위메뉴</th>
            <th class="ia-sheet-th">Path</th>
            <th class="ia-sheet-th ia-sheet-th--tech">라우트</th>
            <th class="ia-sheet-th">화면유형</th>
            <th class="ia-sheet-th">로그인</th>
            <th class="ia-sheet-th">개발필요</th>
            <th class="ia-sheet-th">접근권한</th>
            <th class="ia-sheet-th ia-sheet-th--tech">인증범위</th>
            <th class="ia-sheet-th ia-sheet-th--tech">API·리소스</th>
            <th class="ia-sheet-th">우선순위</th>
            <th class="ia-sheet-th">연결화면</th>
            <th class="ia-sheet-th">비고</th>
          </tr>
        </thead>
        <tbody>
          {#each sorted as n (n.id)}
            {@const ia = readIa(n)}
            {@const pmenu = ia.parentMenu?.trim() ? ia.parentMenu : parentName(sorted, n.parent_id)}
            <tr class="ia-sheet-row">
              <td class="ia-sheet-td ia-sheet-td--ro">{n.num?.trim() || '—'}</td>
              <td class="ia-sheet-td ia-sheet-td--ro ia-sheet-td--depth"
                ><span class="ia-depth-chip">{depthLabel(n.depth)}</span>
                <span class="ia-depth-num">({n.depth})</span></td
              >
              <td class="ia-sheet-td ia-sheet-td--ro">{n.name || '—'}</td>
              <td class="ia-sheet-td"
                ><input
                  class="ia-grid-inp"
                  value={ia.menuId ?? ''}
                  aria-label={`${n.name} 메뉴ID`}
                  on:input={(e) => onIaInput(n.id, 'menuId', e)}
                /></td
              >
              <td class="ia-sheet-td"
                ><input
                  class="ia-grid-inp ia-grid-inp--mono"
                  value={ia.screenCode ?? ''}
                  placeholder="SCR-…"
                  aria-label={`${n.name} 화면코드`}
                  on:input={(e) => onIaInput(n.id, 'screenCode', e)}
                /></td
              >
              <td class="ia-sheet-td"
                ><input
                  class="ia-grid-inp"
                  value={ia.parentMenu ?? ''}
                  placeholder={pmenu === '—' ? '' : pmenu}
                  aria-label={`${n.name} 상위메뉴`}
                  on:input={(e) => onIaInput(n.id, 'parentMenu', e)}
                /></td
              >
              <td class="ia-sheet-td"
                ><input
                  class="ia-grid-inp"
                  value={ia.path ?? ''}
                  aria-label={`${n.name} Path`}
                  on:input={(e) => onIaInput(n.id, 'path', e)}
                /></td
              >
              <td class="ia-sheet-td"
                ><input
                  class="ia-grid-inp ia-grid-inp--mono"
                  value={ia.routePattern ?? ''}
                  placeholder="/…"
                  aria-label={`${n.name} 라우트`}
                  on:input={(e) => onIaInput(n.id, 'routePattern', e)}
                /></td
              >
              <td class="ia-sheet-td"
                ><input
                  class="ia-grid-inp"
                  value={ia.screenType ?? ''}
                  aria-label={`${n.name} 화면유형`}
                  on:input={(e) => onIaInput(n.id, 'screenType', e)}
                /></td
              >
              <td class="ia-sheet-td"
                ><input
                  class="ia-grid-inp"
                  value={ia.loginRequired ?? ''}
                  placeholder="Y/N"
                  aria-label={`${n.name} 로그인필요`}
                  on:input={(e) => onIaInput(n.id, 'loginRequired', e)}
                /></td
              >
              <td class="ia-sheet-td"
                ><input
                  class="ia-grid-inp"
                  value={ia.devNeeded ?? ''}
                  placeholder="Y/N/부분"
                  aria-label={`${n.name} 개발필요`}
                  on:input={(e) => onIaInput(n.id, 'devNeeded', e)}
                /></td
              >
              <td class="ia-sheet-td"
                ><input
                  class="ia-grid-inp"
                  value={ia.accessLevel ?? ''}
                  aria-label={`${n.name} 접근권한`}
                  on:input={(e) => onIaInput(n.id, 'accessLevel', e)}
                /></td
              >
              <td class="ia-sheet-td"
                ><input
                  class="ia-grid-inp ia-grid-inp--mono"
                  value={ia.authScope ?? ''}
                  placeholder="세션·JWT…"
                  aria-label={`${n.name} 인증범위`}
                  on:input={(e) => onIaInput(n.id, 'authScope', e)}
                /></td
              >
              <td class="ia-sheet-td"
                ><input
                  class="ia-grid-inp ia-grid-inp--mono"
                  value={ia.apiResources ?? ''}
                  placeholder="GET /api/…"
                  aria-label={`${n.name} API·리소스`}
                  on:input={(e) => onIaInput(n.id, 'apiResources', e)}
                /></td
              >
              <td class="ia-sheet-td"
                ><input
                  class="ia-grid-inp"
                  value={ia.devPriority ?? ''}
                  placeholder="P1~P3"
                  aria-label={`${n.name} 우선순위`}
                  on:input={(e) => onIaInput(n.id, 'devPriority', e)}
                /></td
              >
              <td class="ia-sheet-td"
                ><input
                  class="ia-grid-inp"
                  value={ia.linkedScreens ?? ''}
                  aria-label={`${n.name} 연결화면`}
                  on:input={(e) => onIaInput(n.id, 'linkedScreens', e)}
                /></td
              >
              <td class="ia-sheet-td"
                ><textarea
                  class="ia-grid-inp"
                  rows="2"
                  value={ia.note ?? ''}
                  aria-label={`${n.name} 비고`}
                  on:input={(e) => onIaInput(n.id, 'note', e)}
                ></textarea
                ></td
              >
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .ia-sheet-wrap {
    width: 100%;
    box-sizing: border-box;
    margin-bottom: 16px;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .ia-sheet-header {
    margin-bottom: 10px;
  }
  .ia-sheet-header-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px 20px;
  }
  .ia-sheet-header-main {
    flex: 1 1 260px;
    min-width: 0;
  }
  .ia-sheet-header-actions {
    flex: 0 0 auto;
    align-self: flex-start;
    margin-inline-end: 6px;
    padding-top: 1px;
  }
  .ia-dl-btn {
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
  .ia-dl-btn:hover:not(:disabled) {
    filter: brightness(1.05);
  }
  .ia-dl-btn:active:not(:disabled) {
    transform: translateY(1px);
  }
  .ia-dl-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .ia-sheet-title {
    font-size: 15px;
    font-weight: 700;
    color: #1a1a1a;
    margin: 0;
  }
  .ia-sheet-empty {
    padding: 24px;
    text-align: center;
    color: #94a3b8;
    font-size: 13px;
    border: 1px dashed #cbd5e1;
    border-radius: 8px;
    margin: 0;
  }
  .ia-sheet-scroll {
    flex: 1;
    min-height: 200px;
    overflow: auto;
    border: 1px solid #8fa0b2;
    border-radius: 2px;
    background: #fff;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
  }
  .ia-sheet-table {
    table-layout: fixed;
    width: 100%;
    min-width: 1540px;
    border-collapse: collapse;
    border-spacing: 0;
    font-size: 12px;
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans KR', sans-serif;
  }
  .ia-col--num {
    width: 72px;
  }
  .ia-col--depth {
    width: 100px;
  }
  .ia-col--name {
    width: 140px;
  }
  .ia-col--mid {
    width: 80px;
  }
  .ia-col--scode {
    width: 100px;
  }
  .ia-col--pm {
    width: 112px;
  }
  .ia-col--path {
    width: 100px;
  }
  .ia-col--route {
    width: 108px;
  }
  .ia-col--stype {
    width: 88px;
  }
  .ia-col--short {
    width: 72px;
  }
  .ia-col--acc {
    width: 80px;
  }
  .ia-col--authz {
    width: 92px;
  }
  .ia-col--api {
    width: 120px;
  }
  .ia-col--prio {
    width: 64px;
  }
  .ia-col--link {
    width: 100px;
  }
  .ia-col--note {
    width: 160px;
  }
  .ia-sheet-th {
    position: sticky;
    top: 0;
    z-index: 2;
    padding: 6px 6px;
    text-align: center;
    font-weight: 600;
    font-size: 10px;
    color: #1e293b;
    background: linear-gradient(180deg, #eef2ff 0%, #e0e7ff 100%);
    border-right: 1px solid #9aaabe;
    border-bottom: 1px solid #7a8a9e;
    white-space: nowrap;
    user-select: none;
  }
  .ia-sheet-th--tech {
    background: linear-gradient(180deg, #e8f4fc 0%, #d4e8f7 100%);
    color: #0c4a6e;
  }
  .ia-sheet-th:last-child {
    border-right: none;
  }
  .ia-sheet-td {
    padding: 0;
    border-right: 1px solid #c5ccd5;
    border-bottom: 1px solid #c5ccd5;
    vertical-align: middle;
    background: #fff;
    color: #0f172a;
  }
  .ia-sheet-td:last-child {
    border-right: none;
  }
  .ia-sheet-row:nth-child(even) .ia-sheet-td {
    background: #f7f9fc;
  }
  .ia-sheet-row:hover .ia-sheet-td {
    background: #e8f4fc;
  }
  .ia-sheet-td--ro {
    padding: 5px 8px;
    font-size: 11px;
    vertical-align: middle;
    color: #334155;
    background: #f1f5f9 !important;
  }
  .ia-sheet-td--depth {
    text-align: center;
    line-height: 1.25;
  }
  .ia-depth-chip {
    display: inline-block;
    font-size: 9px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 2px;
    background: #6366f1;
    color: #fff;
  }
  .ia-depth-num {
    display: block;
    font-size: 9px;
    color: #64748b;
    margin-top: 2px;
  }
  :global(.ia-grid-inp) {
    display: block;
    width: 100%;
    box-sizing: border-box;
    margin: 0;
    font: inherit;
    font-size: 11px;
    line-height: 1.35;
    padding: 5px 6px;
    border: none;
    border-radius: 0;
    background: transparent;
    color: #0f172a;
    outline: none;
    min-height: 28px;
  }
  :global(.ia-grid-inp:focus) {
    background: #fefce8;
    box-shadow: inset 0 0 0 2px #4f46e5;
  }
  :global(textarea.ia-grid-inp) {
    resize: vertical;
    min-height: 44px;
    max-height: 160px;
    font-family: inherit;
  }
  :global(.ia-grid-inp--mono) {
    font-family: ui-monospace, 'SF Mono', 'Consolas', 'Malgun Gothic', monospace;
    font-size: 10px;
  }
</style>
