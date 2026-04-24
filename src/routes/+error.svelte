<script lang="ts">
  import { dev } from '$app/environment';

  /** SvelteKit이 레이아웃과 동일하게 주입 — 미선언 시 `<Error> was created with unknown prop 'params'` */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export let data: any = {};
  export let params: Record<string, string> = {};

  export let error: Error;
  export let status: number;
</script>

<span hidden>{JSON.stringify(data)}{JSON.stringify(params)}</span>

<div class="err-wrap">
  <h1>{status}</h1>
  <p class="msg">{error?.message ?? '오류가 발생했어.'}</p>
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
    color: #6b4ef6;
  }
</style>
