---
title: 技術スタック
description: Recette の技術選定と理由
sidebar:
  order: 1
---

## 全体像

**Cloudflare にフルスタックで寄せる**。身内規模なら無料枠内でほぼ 0 円運用でき、DB・画像・ホスティングが 1 プラットフォームにまとまる。

```
[ブラウザ (モバイル優先)]
        │
[Cloudflare Workers] ← TanStack Start (SSR + Server Functions)
        │  ├── D1 (SQLite) ─ レシピ・タグ・買い物リスト・認証
        │  └── R2 ─ 写真（参照用 / 作った記録）
```

## 選定

| レイヤ | 技術 | 理由 |
| --- | --- | --- |
| フレームワーク | **TanStack Start** (React) | 型安全なルーティング + Server Functions。Cloudflare Workers を公式サポート（`@cloudflare/vite-plugin`） |
| ホスティング | **Cloudflare Workers** | 無料枠が広い。wrangler でデプロイ完結 |
| DB | **Cloudflare D1** (SQLite) | 身内規模・1 リージョンで十分。無料枠内 |
| ORM | **Drizzle ORM** | D1 公式対応。スキーマ = 型。マイグレーションも drizzle-kit で完結 |
| 画像ストレージ | **Cloudflare R2** | egress 無料。Workers から直接読み書き |
| 認証 | **better-auth** | セルフホストで外部 SaaS 不要。Google OAuth。Drizzle アダプタで D1 に保存 |
| スタイリング | **Tailwind CSS v4 + shadcn/ui** | モバイル優先 UI を素早く。既存の実装規約に合致 |
| バリデーション | **Zod** | Server Functions の入力パースと共通スキーマ |
| テスト | **Vitest** | ドメインロジック中心にユニットテスト |
| パッケージ管理 | **pnpm workspace** | `apps/docs`（本ドキュメント）と `apps/web`（アプリ本体）を同居 |

## 構成メモ

### TanStack Start × Cloudflare

- `@cloudflare/vite-plugin` を `viteEnvironment: { name: 'ssr' }` で組み込み、`wrangler.jsonc` の `main` に `@tanstack/react-start/server-entry` を指定する公式構成
- D1 / R2 へは Workers のバインディング経由でアクセス（Server Functions 内でのみ利用。クライアントには一切露出しない）

### 画像の扱い

- アップロードは Server Function 経由で R2 に保存（キーは推測不可能なランダム値）
- 配信も Workers 経由で認可チェックを通す（[非機能要件](/requirements/non-functional/)の「他人の画像にアクセス不可」を担保）
- クライアント側で長辺リサイズしてからアップロードし、R2 容量と表示速度を稼ぐ（詳細は設計時に決定）

### 認証

- better-auth + Google OAuth のみ。セッションは D1 に保存
- 全 Server Function の先頭でセッション検証 → `userId` でデータを絞る

## リポジトリ構成（予定）

```
recette/
├── apps/
│   ├── docs/   # Starlight（本ドキュメント）
│   └── web/    # TanStack Start（アプリ本体）
└── packages/   # 必要になったら共通パッケージを切り出す
```

最初から packages を切らず、`apps/web` 内で完結させる。共有が必要になった時点で切り出す。

## 見送った選択肢

| 選択肢 | 見送り理由 |
| --- | --- |
| Next.js + OpenNext | Workers に乗せる変換レイヤが増える。TanStack Start はネイティブに Workers 対応 |
| Vercel + 外部 DB | サービスが 3 つに分散し、無料枠管理が煩雑 |
| Supabase | 認証・DB は便利だが、Cloudflare に寄せる方針と分散する |
| Auth.js | TanStack Start との組み合わせ実績が better-auth の方が厚い |
