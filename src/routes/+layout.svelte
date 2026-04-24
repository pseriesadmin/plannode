<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { loadProjectsFromLocalStorage } from '$lib/stores/projects';
  import { initAuthSession, authLoading, authUser } from '$lib/stores/authSession';
  import { isSupabaseCloudConfigured } from '$lib/supabase/env';
  import { tryClaimPlatformMasterIfVacant } from '$lib/supabase/platformMaster';
  import LoginGate from '$lib/components/LoginGate.svelte';
  import SplashScreen from '$lib/components/SplashScreen.svelte';
  import type { LayoutData } from './$types';

  export let data: LayoutData;
  export let params: Record<string, string> = {};

  /** 첫 스플래시가 너무 짧게 깜빡이지 않도록 최소 표시 시간(ms) */
  const MIN_SPLASH_MS = 1500;

  let mounted = false;
  let splashMinDone = false;
  let projectsHydrated = false;

  onMount(() => {
    mounted = true;
    initAuthSession();
    const t = setTimeout(() => {
      splashMinDone = true;
    }, MIN_SPLASH_MS);
    return () => clearTimeout(t);
  });

  $: if (browser && mounted && !$authLoading && isSupabaseCloudConfigured() && $authUser) {
    void tryClaimPlatformMasterIfVacant();
    if (!projectsHydrated) {
      loadProjectsFromLocalStorage();
      projectsHydrated = true;
    }
  }
  $: if (!$authUser) projectsHydrated = false;

  $: needAuth = browser && mounted && isSupabaseCloudConfigured() && !$authUser && !$authLoading;
  $: missingEnv = browser && mounted && !isSupabaseCloudConfigured();
</script>

<!-- data/params는 레이아웃 계약 유지용(빈 객체일 때가 많음) -->
<span hidden aria-hidden="true">{JSON.stringify(data)}{JSON.stringify(params)}</span>

<!-- 서버·클라이언트 동일 분기: !browser 전용 if와 else-if를 나누면 하이드레이션 불일치로 onMount 미실행·무한 스플래시 가능 -->
{#if !browser || !mounted || $authLoading || !splashMinDone}
  <SplashScreen />
{:else if missingEnv}
  <div class="splash wide">
    <p class="t">환경 설정 필요</p>
    <p class="d">Plannode 보안 모드는 Supabase가 필요해. 프로젝트 루트에 <code>.env</code>로 <code>VITE_SUPABASE_URL</code> · <code>VITE_SUPABASE_ANON_KEY</code>를 넣고 다시 실행해줘.</p>
  </div>
{:else if needAuth}
  <LoginGate />
{:else}
  <slot />
{/if}

<style>
  .splash {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: system-ui, sans-serif;
    font-size: 1.5rem;
    font-weight: 700;
    color: #5b21b6;
    background: #f5f5f0;
  }
  .splash.wide {
    flex-direction: column;
    padding: 2rem;
    text-align: center;
    font-size: 1rem;
    font-weight: 400;
    color: #444;
  }
  .splash .t {
    font-size: 1.2rem;
    font-weight: 700;
    color: #1f2937;
    margin-bottom: 0.75rem;
  }
  .splash .d {
    max-width: 420px;
    line-height: 1.6;
    font-size: 0.95rem;
  }
  .splash code {
    font-size: 0.85em;
    background: #eee;
    padding: 0.1em 0.35em;
    border-radius: 4px;
  }
</style>
