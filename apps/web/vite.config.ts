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
    tanstackStart(),
    // react の vite plugin は tanstackStart() より後に置く必要がある
    viteReact(),
  ],
});
