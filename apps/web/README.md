# @recette/web

Recette のアプリ本体。TanStack Start (React) + Vite を Cloudflare Workers 上で動かす。

## セットアップ

```sh
pnpm install

# 環境変数のテンプレートをコピーして値を埋める（→「認証」の節）
cp .dev.vars.example .dev.vars

# ローカル D1 にマイグレーションを適用
pnpm db:migrate:local

pnpm dev
```

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

生成される `Env` インターフェースは以下のような形になる。`.dev.vars` に書いた環境変数もここに載る（載るのは名前だけで、値は含まれない）。

```ts
interface Env {
  IMAGES: R2Bucket;
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}
```

## データベース (D1 + Drizzle)

スキーマは `src/db/schema.ts`。設計のもとになったドラフトは docs の「データモデル」を参照。

### 設計の方針

- **主キーは text の UUID**（`crypto.randomUUID()` をアプリ側で採番）。integer の autoincrement と違い INSERT 前に ID が確定するので、レシピと材料行をまとめて作るような処理で往復が要らない。認証基盤（better-auth）も text の ID を採番するため、`userId` の型も揃う
- **`users` は better-auth の user モデルそのもの**。アプリ独自の User テーブルは持たない。`sessions` / `accounts` / `verifications` も better-auth のコアスキーマ（詳細は「認証」の節）
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

## 認証 (better-auth + Google OAuth)

ログイン手段は **Google OAuth のみ**。セッションもユーザーも D1 に保存する（セルフホスト。外部の認証 SaaS は使わない）。

### 構成

| ファイル                        | 役割                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| `src/lib/auth.server.ts`        | better-auth 本体の設定と、セッション検証ヘルパー（`requireUser` / `getOptionalUser`） |
| `src/lib/session.ts`            | ログイン状態をクライアントから取れるようにする Server Function                        |
| `src/lib/auth-client.ts`        | ブラウザから `/api/auth/*` を叩くクライアント（`authClient`）                         |
| `src/lib/redirect.ts`           | `?redirect=` の復帰先を同一オリジンの相対パスに限定する `sanitizeRedirect`            |
| `src/routes/api/auth/$.ts`      | better-auth のハンドラを `/api/auth/*` にマウントするサーバールート                   |
| `src/routes/login.tsx`          | `/login`。「Google でログイン」ボタンだけの最小 UI                                    |
| `src/routes/_authenticated.tsx` | ログイン必須ページをまとめる pathless layout route（認証ガード）                      |

### 画面のガード

- セッションは **`src/routes/__root.tsx` の `beforeLoad` で 1 度だけ取得**し、`context.user` として子ルートへ配る。ページごとに get-session を叩かない
- ログインが要るページは **`src/routes/_authenticated/` 配下に置く**だけでガードがかかる（`/` は `src/routes/_authenticated/index.tsx`）。未ログインなら `/login?redirect=<現在地>` へリダイレクトする
- `beforeLoad` は SSR でもクライアント遷移でも走るため、直接 URL を開いた場合もリンク遷移の場合もガードが効く
- `/login` はログイン済みなら復帰先（`?redirect=`、既定は `/`）へ送る。復帰先は `sanitizeRedirect()` を通し、**同一オリジンの相対パス以外は `/` に落とす**（オープンリダイレクト対策）。Google 認証後の戻り先（`callbackURL`）にも同じ値を使う
- ログアウトは `router.invalidate()` でセッションを取り直してから `/login` へ遷移する

**`.server.ts` の付いたモジュールをクライアントから import しないこと。** D1 バインディングやシークレットを参照するため、クライアントバンドルに入るとビルドが落ちる（TanStack Start の import protection が検出する）。クライアントから使いたい処理は Server Function 越しに呼ぶ。

### テーブル

better-auth のコアスキーマを `src/db/schema.ts` にそのまま定義し、drizzle アダプタに `usePlural: true` を渡して複数形のテーブル名と対応させている。

| テーブル        | 内容                                                 |
| --------------- | ---------------------------------------------------- |
| `users`         | ユーザー。アプリの User そのもの                     |
| `sessions`      | ログインセッション（セッション Cookie の検証に使う） |
| `accounts`      | 外部 ID プロバイダとの紐付けと OAuth トークン        |
| `verifications` | OAuth の state / PKCE を置く短命テーブル             |

アダプタは **better-auth のフィールド名（camelCase）で drizzle のテーブルオブジェクトを引く**ので、プロパティ名は better-auth に合わせること（DB のカラム名は snake_case のままでよい）。カラムを増やすときは `pnpm db:generate` → `pnpm db:migrate:local`。

### 環境変数

`.dev.vars.example` をコピーして `.dev.vars` を作る（`.dev.vars` は Git 管理外）。

| 変数                   | 内容                                                                |
| ---------------------- | ------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`   | セッション Cookie の署名などに使う秘密鍵。`openssl rand -base64 32` |
| `BETTER_AUTH_URL`      | アプリの公開 URL。ローカルは `http://localhost:3000`                |
| `GOOGLE_CLIENT_ID`     | Google OAuth クライアント ID                                        |
| `GOOGLE_CLIENT_SECRET` | Google OAuth クライアントシークレット                               |

変数を増やしたら `pnpm cf-typegen` で `worker-configuration.d.ts` を更新する。

### Google OAuth クライアントの発行（手作業）

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作る（既存のものでもよい）
2. 「APIとサービス」→「OAuth 同意画面」を設定する
   - User Type は **外部**、公開ステータスは「テスト」のままでよい
   - スコープは `email` / `profile` / `openid` の 3 つ
   - 「テストユーザー」に自分と身内の Google アカウントを追加する（テスト中はここに載っているアカウントしかログインできない）
3. 「APIとサービス」→「認証情報」→「認証情報を作成」→「OAuth クライアント ID」
   - アプリケーションの種類: **ウェブ アプリケーション**
   - **承認済みの JavaScript 生成元**
     - `http://localhost:3000`
     - `https://<本番ドメイン>`
   - **承認済みのリダイレクト URI**（better-auth のコールバックパスは `/api/auth/callback/google` 固定）
     - `http://localhost:3000/api/auth/callback/google`
     - `https://<本番ドメイン>/api/auth/callback/google`
4. 発行されたクライアント ID / シークレットを `.dev.vars`（ローカル）と `wrangler secret`（本番）に入れる

### 動作確認

```sh
pnpm db:migrate:local
pnpm dev
```

- http://localhost:3000/login を開き「Google でログイン」→ Google の同意画面に飛ぶ
- 同意するとトップに戻り、表示名とログアウトボタンが出る
- ログアウトするとログイン前の表示に戻る

クレデンシャルを入れる前でも、以下でハンドラが生きていることは確認できる。

```sh
curl http://localhost:3000/api/auth/ok           # => {"ok":true}
curl http://localhost:3000/api/auth/get-session  # => null（未ログイン）
```

### Server Function でのセッション検証

`requireUser()` は未ログインなら `/login` へリダイレクトし、ログイン済みならユーザーを返す。**すべての Server Function の先頭で呼び、返ってきた `user.id` でデータを絞ること**（データはユーザー単位で分離する / docs: 非機能要件）。

```ts
import { createServerFn } from '@tanstack/react-start';
import { desc, eq } from 'drizzle-orm';

import { getDatabase } from '~/db/client';
import { recipes } from '~/db/schema';
import { requireUser } from '~/lib/auth.server';

export const listRecipes = createServerFn().handler(async () => {
  const user = await requireUser();
  const db = getDatabase();

  return db
    .select()
    .from(recipes)
    .where(eq(recipes.userId, user.id))
    .orderBy(desc(recipes.updatedAt))
    .all();
});
```

リダイレクトさせずに未ログインを扱いたい場合（ログイン状態の出し分けなど）は `getOptionalUser()` を使う。ルートのローダーから呼ぶ用の Server Function は `~/lib/session` の `fetchOptionalUser` にある。

```tsx
export const Route = createFileRoute('/')({
  loader: () => fetchOptionalUser(),
  component: Home,
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

# 認証用のシークレットを登録（値は対話的に入力する）
pnpm exec wrangler secret put BETTER_AUTH_SECRET
pnpm exec wrangler secret put BETTER_AUTH_URL
pnpm exec wrangler secret put GOOGLE_CLIENT_ID
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET

# デプロイ
pnpm run deploy
```
