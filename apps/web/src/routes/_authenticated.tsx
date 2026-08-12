import { createFileRoute, redirect } from '@tanstack/react-router';

import { REDIRECT_SEARCH_PARAM } from '~/lib/redirect';

/**
 * ログイン必須ページをまとめる pathless layout route。
 *
 * URL には現れないので、認証が要るページは `routes/_authenticated/` 配下に
 * 置くだけでガードがかかる（`/` は `routes/_authenticated/index.tsx`）。
 *
 * セッションはルート（`__root.tsx`）の `beforeLoad` で取得済みのものを使う。
 * SSR でもクライアント遷移でも `beforeLoad` は走るため、どちらでもガードが効く。
 */
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => {
    if (!context.user) {
      throw redirect({
        to: '/login',
        // ログイン後に元いたページへ戻すため、現在地を引き継ぐ
        search: { [REDIRECT_SEARCH_PARAM]: location.href },
      });
    }

    // 子ルートでは `user` が非 null であることを型でも保証する
    return { user: context.user };
  },
});
