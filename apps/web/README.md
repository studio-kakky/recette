# @recette/web

Recette のアプリ本体。TanStack Start (React) + Vite を Cloudflare Workers 上で動かす。

## スクリプト

リポジトリルートからは `pnpm web:dev` / `pnpm web:build` でも実行できる。

| コマンド                 | 内容                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `pnpm dev`               | 開発サーバ (http://localhost:3000)。SSR は Workers ランタイム (workerd) 上で動く                           |
| `pnpm build`             | 本番ビルド。`dist/client`（静的アセット）と `dist/server`（Worker + デプロイ用 `wrangler.json`）を出力     |
| `pnpm preview`           | ビルド成果物を Workers ランタイムでプレビュー                                                              |
| `pnpm run deploy`        | ビルドして Cloudflare Workers にデプロイ（`deploy` は pnpm の組み込みコマンドと衝突するため `run` が必須） |
| `pnpm cf-typegen`        | `wrangler.jsonc` のバインディングから型を生成                                                              |
| `pnpm typecheck`         | 型チェック                                                                                                 |
| `pnpm db:generate`       | スキーマ定義からマイグレーション SQL を生成                                                                |
| `pnpm db:migrate:local`  | ローカル D1 にマイグレーションを適用                                                                       |
| `pnpm db:migrate:remote` | Cloudflare 上の D1 にマイグレーションを適用                                                                |

## Cloudflare 構成

- `vite.config.ts` に `@cloudflare/vite-plugin` の `cloudflare({ viteEnvironment: { name: 'ssr' } })` を組み込み、SSR 環境を workerd で動かしている
- `wrangler.jsonc` が入力設定。`main` は TanStack Start が提供する `@tanstack/react-start/server-entry`
- ビルド時に `dist/server/wrangler.json`（出力設定）が生成され、`vite preview` / `wrangler deploy` はこちらを自動的に参照する

### バインディング

| バインディング | 種別 | リソース名       | 用途                                 |
| -------------- | ---- | ---------------- | ------------------------------------ |
| `IMAGES`       | R2   | `recette-images` | レシピの写真（参照用 / 作った記録）  |
| `DB`           | D1   | `recette-db`     | レシピ・材料・作った記録などのデータ |

開発時 (`pnpm dev` / `pnpm preview`) はローカルにシミュレートされたバケット / DB が使われるため、Cloudflare アカウントは不要。ローカルの状態は `.wrangler/` 配下に置かれる（Git 管理外）。

`wrangler.jsonc` の `d1_databases[].database_id` は実 DB をまだ作っていないためプレースホルダ。ローカル開発では参照されない。

### 型生成

バインディングの型は `wrangler types` で `worker-configuration.d.ts` に生成し、リポジトリにコミットしている（`tsconfig.json` の `types` / `include` に登録済み）。

**`wrangler.jsonc` のバインディングを変更したら `pnpm cf-typegen` を実行し直すこと。**

生成される `Env` インターフェースは以下のような形になる。

```ts
interface Env {
  IMAGES: R2Bucket;
  DB: D1Database;
}
```

## データベース (D1 + Drizzle)

スキーマは `src/db/schema.ts`。設計のもとになったドラフトは docs の「データモデル」を参照。

### 設計の方針

- **主キーは text の UUID**（`crypto.randomUUID()` をアプリ側で採番）。integer の autoincrement と違い INSERT 前に ID が確定するので、レシピと材料行をまとめて作るような処理で往復が要らない。後続で導入する認証基盤（better-auth）も text の ID を使うため、`userId` の型も揃う
- **日時は integer の Unix 秒**（`{ mode: 'timestamp' }`）。TS 側では `Date` として読み書きする。`created_at` / `updated_at` は DB 側にも `(unixepoch())` のデフォルトを持たせてある
- **`cook_logs.cooked_at` は `YYYY-MM-DD` の text**。「作った日」は時刻を持たない値なので、辞書順 = 時系列順になる text で保持する
- **材料の `amount` は text**。「適量」「大さじ2」を許容し、合算・換算はしない
- **削除は外部キーのカスケード任せ**。ユーザーを消せば配下のレシピ・材料・記録・タグ・買い物リストも消える。例外は `shopping_items.recipe_id`（由来レシピが消えても項目は残すので `set null`）
- インデックスは実際のアクセスパターンに合わせた複合インデックス（例: 一覧用の `recipes(user_id, updated_at)`、並び順用の `ingredients(recipe_id, "order")`）

### マイグレーション

生成は Drizzle Kit、適用は wrangler が担当する。`drizzle.config.ts` の `out` と `wrangler.jsonc` の `migrations_dir` はどちらも `drizzle/migrations` を指しており、生成された SQL がそのまま wrangler から適用される。

```sh
# スキーマを変更したらマイグレーションを生成（--name で任意の名前を付けられる）
pnpm db:generate

# ローカル D1 に適用
pnpm db:migrate:local

# ローカル D1 に直接クエリを投げる
pnpm exec wrangler d1 execute recette-db --local --command "SELECT * FROM recipes"
```

### Server Function からの接続

`src/db/client.ts` の `getDatabase()` が `env.DB` から Drizzle インスタンスを返す。`cloudflare:workers` の `env` が実行中のリクエストのバインディングに解決されるため、env を引数で引き回す必要はない。

```ts
import { createServerFn } from '@tanstack/react-start';
import { desc } from 'drizzle-orm';

import { getDatabase } from '~/db/client';
import { recipes } from '~/db/schema';

export const listRecipes = createServerFn().handler(async () => {
  const db = getDatabase();
  return db.select().from(recipes).orderBy(desc(recipes.updatedAt)).all();
});
```

## デプロイ前の準備

以下は Cloudflare アカウントに対する操作。まだ実行していない。

```sh
# ログイン
pnpm exec wrangler login

# R2 バケットを作成（wrangler.jsonc の bucket_name と一致させる）
pnpm exec wrangler r2 bucket create recette-images

# D1 を作成し、出力された database_id を wrangler.jsonc のプレースホルダに書き戻す
pnpm exec wrangler d1 create recette-db
pnpm cf-typegen

# 本番 D1 にマイグレーションを適用
pnpm db:migrate:remote

# デプロイ
pnpm run deploy
```
