import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import { LogOut, NotebookText, ShoppingBasket } from 'lucide-react';
import { useState } from 'react';

import { Button } from '~/components/ui/button';
import { authClient } from '~/lib/auth-client';
import { REDIRECT_SEARCH_PARAM } from '~/lib/redirect';

/** 下部タブバーに並べる行き先。左から使う頻度の高い順 */
const NAV_ITEMS = [
  { to: '/', label: 'レシピ', icon: NotebookText },
  { to: '/shopping-list', label: '買い物リスト', icon: ShoppingBasket },
] as const;

/**
 * ログイン後の全ページを包む共通シェル。
 *
 * モバイル優先なので、行き来はヘッダーではなく親指の届く下部タブバーに置く。
 */
const AuthenticatedLayout = () => {
  const router = useRouter();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const signOut = async () => {
    setIsSigningOut(true);
    await authClient.signOut();
    // セッションを持っているルートのコンテキストを作り直してからログイン画面へ送る
    // （順序を逆にすると、古いセッションのままログイン画面のガードに弾かれる）
    await router.invalidate();
    await navigate({ to: '/login', replace: true });
  };

  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-background/85 border-border sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between gap-3 px-4">
          <Link
            to="/"
            className="focus-visible:ring-ring/50 flex items-center gap-2 rounded-lg outline-none focus-visible:ring-3"
          >
            <span aria-hidden="true" className="text-xl">
              🍳
            </span>
            <span className="font-heading text-lg font-bold tracking-tight">
              Recette
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="ログアウト"
            disabled={isSigningOut}
            onClick={() => void signOut()}
          >
            <LogOut className="size-5" />
          </Button>
        </div>
      </header>

      {/* 固定した下部タブバーに最後の要素が隠れないよう、その分の余白を確保する */}
      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-5 pb-[calc(5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>

      <nav
        aria-label="メインナビゲーション"
        className="bg-background/95 border-border fixed inset-x-0 bottom-0 z-10 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="mx-auto flex w-full max-w-md">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <li key={to} className="flex-1">
              <Link
                to={to}
                // `/` は前方一致だとどのページでも active になるので完全一致で判定する
                activeOptions={{ exact: to === '/' }}
                className="group text-muted-foreground focus-visible:ring-ring/50 data-[status=active]:text-primary flex flex-col items-center gap-1 rounded-lg py-2 text-xs font-medium outline-none transition-colors focus-visible:ring-3"
              >
                <span className="group-data-[status=active]:bg-accent flex h-8 w-14 items-center justify-center rounded-full transition-colors">
                  <Icon className="size-5" />
                </span>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
};

/**
 * ログイン必須ページをまとめる pathless layout route。
 *
 * URL には現れないので、認証が要るページは `routes/_authenticated/` 配下に
 * 置くだけでガードと共通シェルの両方がかかる（`/` は `routes/_authenticated/index.tsx`）。
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
  component: AuthenticatedLayout,
});
