import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit の設定。
 *
 * マイグレーションの「生成」だけをここで行い、「適用」は wrangler に任せる
 * （`wrangler d1 migrations apply` はローカル / リモートどちらにも同じ SQL を流せる）。
 * そのため `out` は wrangler.jsonc の `migrations_dir` と同じディレクトリを指す。
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
});
