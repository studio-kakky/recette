import { createServerFn } from '@tanstack/react-start';

import { getOptionalUser } from './auth.server';

/**
 * ログイン状態をクライアント（ルートのローダーなど）から取得する Server Function。
 *
 * サーバー側でセッションを検証する処理そのものは `~/lib/auth.server` にある。
 * このファイルはクライアントのバンドルにも入るため、ハンドラの外で
 * サーバー専用モジュールを参照しないこと。
 */
export const fetchOptionalUser = createServerFn({ method: 'GET' }).handler(() =>
  getOptionalUser(),
);
