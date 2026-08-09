import { env } from 'cloudflare:workers';
import { redirect } from '@tanstack/react-router';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { tanstackStartCookies } from 'better-auth/tanstack-start';

import { getDatabase } from '~/db/client';
import * as schema from '~/db/schema';

/** better-auth のインスタンス型（`auth.api.*` の戻り値の型付けに使う） */
export type Auth = ReturnType<typeof createAuth>;

const createAuth = () =>
  betterAuth({
    /**
     * OAuth のコールバック URL や Cookie のドメインの組み立てに使う。
     * ローカルは http://localhost:3000、本番は公開ドメイン。
     */
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDatabase(), {
      provider: 'sqlite',
      schema,
      // スキーマのテーブル名が複数形（users / sessions / accounts / verifications）
      usePlural: true,
      // D1 はインタラクティブなトランザクションを持たないため無効にする
      transaction: false,
    }),
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    // メール + パスワードは使わない（認証は Google OAuth のみ）
    emailAndPassword: { enabled: false },
    // Cookie プラグインは必ず最後に置く（better-auth の要件）
    plugins: [tanstackStartCookies()],
  });

/**
 * better-auth のインスタンス。
 *
 * D1 バインディングもシークレットも isolate 内では不変なので、初回アクセス時に
 * 1 度だけ組み立てて使い回す（`betterAuth()` はエンドポイント一式を構築するため、
 * リクエストごとに作り直すと無駄が大きい）。
 */
let cachedAuth: Auth | undefined;

export const getAuth = (): Auth => (cachedAuth ??= createAuth());

/** ログイン中のユーザー。better-auth の user モデル（= `users` テーブル）そのもの */
export type SessionUser = Auth['$Infer']['Session']['user'];

/**
 * 現在のリクエストのセッションからユーザーを取り出す。未ログインなら `null`。
 *
 * Server Function / サーバールートのハンドラの中でのみ呼べる
 * （`getRequestHeaders()` がリクエストコンテキストを必要とするため）。
 */
export const getOptionalUser = async (): Promise<SessionUser | null> => {
  const session = await getAuth().api.getSession({
    headers: getRequestHeaders(),
  });

  return session?.user ?? null;
};

/**
 * ログインを必須にする。未ログインなら `/login` へリダイレクトする。
 *
 * すべての Server Function の先頭で呼び、返ってきた `user.id` でデータを絞ること
 * （データはユーザー単位で分離する / docs: 非機能要件）。
 *
 * @example
 * export const listRecipes = createServerFn().handler(async () => {
 *   const user = await requireUser();
 *   const db = getDatabase();
 *
 *   return db.select().from(recipes).where(eq(recipes.userId, user.id)).all();
 * });
 */
export const requireUser = async (): Promise<SessionUser> => {
  const user = await getOptionalUser();

  if (!user) {
    throw redirect({ to: '/login' });
  }

  return user;
};
