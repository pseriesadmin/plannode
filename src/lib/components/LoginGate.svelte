<script lang="ts">
  import { signInWithEmailPassword, signUpWithEmailPassword } from '$lib/stores/authSession';

  let mode: 'login' | 'signup' = 'login';
  let email = '';
  let password = '';
  let busy = false;
  let msg = '';

  async function submit() {
    msg = '';
    busy = true;
    try {
      const fn = mode === 'login' ? signInWithEmailPassword : signUpWithEmailPassword;
      const r = await fn(email, password);
      msg = r.message;
      if (!r.ok) return;
      if (mode === 'signup') mode = 'login';
    } finally {
      busy = false;
    }
  }
</script>

<div class="gate">
  <div class="card">
    <h1>Plannode</h1>
    <p class="sub">계속하려면 이메일 계정으로 로그인해줘.</p>

    <div class="tabs">
      <button type="button" class:act={mode === 'login'} on:click={() => (mode = 'login')}>로그인</button>
      <button type="button" class:act={mode === 'signup'} on:click={() => (mode = 'signup')}>회원가입</button>
    </div>

    <form
      on:submit|preventDefault={() => {
        void submit();
      }}
    >
      <label class="lb" for="lg-email">이메일</label>
      <input id="lg-email" class="in" type="email" autocomplete="email" bind:value={email} required />

      <label class="lb" for="lg-pw">비밀번호</label>
      <input
        id="lg-pw"
        class="in"
        type="password"
        autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
        bind:value={password}
        required
        minlength="6"
      />

      <button type="submit" class="go" disabled={busy}>{busy ? '처리 중…' : mode === 'login' ? '들어가기' : '가입하기'}</button>
    </form>

    {#if msg}
      <p class="msg" class:err={msg.includes('실패') || msg.includes('Invalid') || msg.includes('Error')}>{msg}</p>
    {/if}

    <p class="hint">Supabase 대시보드에서 Email provider를 켜 두었는지 확인해줘.</p>
  </div>
</div>

<style>
  .gate {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(160deg, #ede9fe 0%, #f5f5f0 45%, #fff 100%);
    font-family: system-ui, sans-serif;
  }
  .card {
    width: 100%;
    max-width: 400px;
    padding: 2rem 1.75rem;
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 12px 40px rgba(80, 60, 120, 0.12);
    border: 1px solid #e8e4de;
  }
  h1 {
    margin: 0 0 0.35rem;
    font-size: 1.65rem;
    color: #4c1d95;
  }
  .sub {
    margin: 0 0 1.25rem;
    font-size: 0.9rem;
    color: #666;
    line-height: 1.5;
  }
  .tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 1rem;
  }
  .tabs button {
    flex: 1;
    padding: 8px;
    border-radius: 8px;
    border: 1px solid #ddd;
    background: #fafafa;
    cursor: pointer;
    font-weight: 600;
    font-size: 13px;
    color: #555;
  }
  .tabs button.act {
    border-color: #6b4ef6;
    background: #f0ecff;
    color: #5b21b6;
  }
  .lb {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: #444;
    margin: 10px 0 4px;
  }
  .in {
    width: 100%;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid #ccc;
    font-size: 14px;
  }
  .go {
    width: 100%;
    margin-top: 1.1rem;
    padding: 12px;
    border: none;
    border-radius: 10px;
    background: #6b4ef6;
    color: #fff;
    font-weight: 700;
    font-size: 15px;
    cursor: pointer;
  }
  .go:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }
  .msg {
    margin-top: 12px;
    font-size: 13px;
    color: #15803d;
    line-height: 1.45;
  }
  .msg.err {
    color: #b91c1c;
  }
  .hint {
    margin-top: 1rem;
    font-size: 11px;
    color: #999;
    line-height: 1.4;
  }
</style>
