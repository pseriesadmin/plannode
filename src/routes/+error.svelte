<script lang="ts">
  import { dev } from '$app/environment';

  /** SvelteKit이 레이아웃과 동일하게 주입 — 미선언 시 unknown prop 경고 방지 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export let data: any = {};
  export let params: Record<string, string> = {};

  /** 404 등에서 하이드레이션 초기 틱에 undefined인 경우가 있어 선택 prop + 기본값 */
  export let error: Error | undefined = undefined;
  export let status: number | undefined = undefined;

  $: code = status ?? 500;
  $: msg =
    error?.message ??
    (code === 404 ? '요청한 주소에 해당하는 페이지가 없어.' : '오류가 발생했어.');
</script>

<span hidden>{JSON.stringify(data)}{JSON.stringify(params)}</span>

<div class="err-wrap">
  <h1>{code}</h1>
  <p class="msg">{msg}</p>
  {#if dev && error?.stack}
    <pre class="stk">{error.stack}</pre>
  {/if}
  <p class="hint"><a href="/">처음으로</a></p>
</div>

<style>
  .err-wrap {
    padding: 2rem;
    font-family: system-ui, sans-serif;
    max-width: 640px;
    margin: 0 auto;
  }
  h1 {
    font-size: 2rem;
    color: #b91c1c;
    margin: 0 0 0.5rem;
  }
  .msg {
    color: #444;
    line-height: 1.6;
  }
  .stk {
    margin-top: 1rem;
    padding: 1rem;
    background: #f4f4f0;
    border-radius: 8px;
    overflow: auto;
    font-size: 11px;
  }
  .hint {
    margin-top: 1.5rem;
    font-size: 14px;
  }
  .hint a {
    color: #631EED;
  }
</style>
