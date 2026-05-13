<script lang="ts">
  import { presenceAvatarLetter } from '$lib/supabase/projectPresence';

  export let email: string;
  export let selected: boolean = false;
</script>

<button
  type="button"
  class="cw-presence-avatar"
  class:cw-presence-avatar--on={selected}
  title="클릭하면 이메일 표시"
  aria-pressed={selected}
  on:click
>
  <span class="cw-presence-letter">{presenceAvatarLetter(email)}</span>
</button>

<style>
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
    box-shadow: 0 0 0 2px rgba(99, 30, 237, 0.12);
  }

  .cw-presence-avatar:focus-visible {
    outline: 2px solid #631eed;
    outline-offset: 2px;
  }

  .cw-presence-avatar--on {
    border-color: #631eed;
    box-shadow: 0 0 0 2px rgba(99, 30, 237, 0.2);
  }

  .cw-presence-letter {
    line-height: 1;
  }
</style>
