import { createAuthClient } from 'better-auth/react';

/**
 * ブラウザから better-auth の API（`/api/auth/*`）を叩くクライアント。
 *
 * アプリと認証 API が同一オリジンなので `baseURL` は指定しない。
 *
 * @example
 * // Google のログイン画面へ遷移する
 * await authClient.signIn.social({ provider: 'google', callbackURL: '/' });
 *
 * @example
 * // ログアウトする
 * await authClient.signOut();
 */
export const authClient = createAuthClient();
