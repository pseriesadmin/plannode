import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5174
  },
  // 워크스페이스 내 Documents 아래 중첩 복제본이 있으면 Vitest 이중 수집·tsconfig 오류
  test: {
    exclude: ['**/node_modules/**', '**/.svelte-kit/**', '**/dist/**', '**/Documents/**']
  }
});

