# @recette/web

Recette のアプリ本体。TanStack Start (React) + Vite を Cloudflare Workers 上で動かす。

## スクリプト

リポジトリルートからは `pnpm web:dev` / `pnpm web:build` でも実行できる。

| コマンド | 内容 |
| --- | --- |
| `pnpm dev` | 開発サーバ (http://localhost:3000)。SSR は Workers ランタイム (workerd) 上で動く |
| `pnpm build` | 本番ビルド。`dist/client`（静的アセット）と `dist/server`（Worker + デプロイ用 `wrangler.json`）を出力 |
| `pnpm preview` | ビルド成果物を Workers ランタイムでプレビュー |
| `pnpm run deploy` | ビルドして Cloudflare Workers にデプロイ（`deploy` は pnpm の組み込みコマンドと衝突するため `run` が必須） |
| `pnpm cf-typegen` | `wrangler.jsonc` のバインディングから型を生成 |
| `pnpm typecheck` | 型チェック |

## Cloudflare 構成

- `vite.config.ts` に `@cloudflare/vite-plugin` の `cloudflare({ viteEnvironment: { name: 'ssr' } })` を組み込み、SSR 環境を workerd で動かしている
- `wrangler.jsonc` が入力設定。`main` は TanStack Start が提供する `@tanstack/react-start/server-entry`
- ビルド時に `dist/server/wrangler.json`（出力設定）が生成され、`vite preview` / `wrangler deploy` はこちらを自動的に参照する

### バインディング

| バインディング | 種別 | リソース名 | 用途 |
| --- | --- | --- | --- |
| `IMAGES` | R2 | `recette-images` | レシピの写真（参照用 / 作った記録） |

開発時 (`pnpm dev` / `pnpm preview`) はローカルにシミュレートされたバケットが使われるため、Cloudflare アカウントは不要。

### 型生成

バインディングの型は `wrangler types` で `worker-configuration.d.ts` に生成し、リポジトリにコミットしている（`tsconfig.json` の `types` / `include` に登録済み）。

**`wrangler.jsonc` のバインディングを変更したら `pnpm cf-typegen` を実行し直すこと。**

生成される `Env` インターフェースは以下のような形になる。

```ts
interface Env {
  IMAGES: R2Bucket;
}
```

## デプロイ前の準備

以下は Cloudflare アカウントに対する操作。まだ実行していない。

```sh
# ログイン
pnpm exec wrangler login

# R2 バケットを作成（wrangler.jsonc の bucket_name と一致させる）
pnpm exec wrangler r2 bucket create recette-images

# デプロイ
pnpm run deploy
```
