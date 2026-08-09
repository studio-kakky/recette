import { defineConfig } from 'vitest/config';

// アプリのビルド構成に影響を与えないよう、vite.config.ts とは独立させている
// （vitest.config.ts が存在する場合、Vitest はこちらを優先して読み込む）
export default defineConfig({
  resolve: {
    alias: {
      // tsconfig.json の paths (`~/*` → `./src/*`) に合わせる
      '~': new URL('./src', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
