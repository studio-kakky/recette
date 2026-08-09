// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/.tanstack/**',
    '**/.vite/**',
    '**/.astro/**',
    // Astro のドキュメントサイトは lint 対象外
    'apps/docs/**',
    // TanStack Router の生成物
    'apps/web/src/routeTree.gen.ts',
    // wrangler types の生成物
    'apps/web/worker-configuration.d.ts',
  ]),
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
  },
  // 整形は Prettier に任せるため、競合するルールを最後に無効化する
  prettier,
);
