import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    // tsconfig.json の paths (`~/*` → `./src/*`) を解決する
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    // SSR 環境を Workers ランタイム (workerd) で動かす。tanstackStart() より前に置く
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    // react の vite plugin は tanstackStart() より後に置く必要がある
    viteReact(),
  ],
});
