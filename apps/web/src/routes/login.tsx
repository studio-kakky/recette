import { createFileRoute, redirect } from '@tanstack/react-router';
import {
  LoaderCircle,
  NotebookPen,
  Search,
  ShoppingBasket,
} from 'lucide-react';
import { useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
import * as z from 'zod';

import { Button } from '~/components/ui/button';
import { authClient } from '~/lib/auth-client';
import { REDIRECT_SEARCH_PARAM, sanitizeRedirect } from '~/lib/redirect';

/** Google のブランドガイドラインに沿った "G" ロゴ（公式カラー） */
const GoogleLogo = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" {...props}>
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.28-3.14.76-4.59l-7.97-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
);

/** コンセプト「入り口は雑でいい。あとから見つかればいい。」を 3 ステップで見せる */
const FEATURES: ReadonlyArray<{
  readonly icon: ComponentType<{ className?: string }>;
  readonly label: string;
}> = [
  { icon: NotebookPen, label: '放り込む' },
  { icon: Search, label: '見つける' },
  { icon: ShoppingBasket, label: '買い物へ' },
];

/** 認証ガードから渡ってくる復帰先。中身は使う直前に必ずサニタイズする */
const loginSearchSchema = z.object({
  [REDIRECT_SEARCH_PARAM]: z.string().optional(),
});

const Login = () => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const search = Route.useSearch();

  const signInWithGoogle = async () => {
    setErrorMessage(null);
    setIsSigningIn(true);

    // 成功した場合は Google の同意画面へ遷移するため、この先には戻ってこない
    const { error } = await authClient.signIn.social({
      provider: 'google',
      // 認証後の戻り先。オープンリダイレクトを防ぐため相対パスだけを通す
      callbackURL: sanitizeRedirect(search[REDIRECT_SEARCH_PARAM]),
    });

    setIsSigningIn(false);
    setErrorMessage(error ? 'ログインを開始できませんでした。' : null);
  };

  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-6 py-12">
      {/* 温かみを出すための装飾。画面上部からほんのり色を落とす */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-[radial-gradient(70%_100%_at_50%_0%,var(--accent),transparent_75%)]"
      />

      <div className="flex w-full max-w-sm flex-col gap-8">
        <header className="flex flex-col items-center gap-4 text-center">
          <span
            aria-hidden="true"
            className="bg-card border-border flex size-16 items-center justify-center rounded-2xl border text-3xl shadow-sm"
          >
            🍳
          </span>
          <div className="flex flex-col gap-1.5">
            <h1 className="font-heading text-4xl font-bold tracking-tight">
              Recette
            </h1>
            <p className="text-muted-foreground text-xs tracking-[0.3em]">
              ルセット
            </p>
          </div>
          <p className="text-foreground/85 text-sm leading-relaxed text-balance">
            自分のレシピを、放り込んで、見つけて、買い物へ。
          </p>
        </header>

        <ul className="grid grid-cols-3 gap-2">
          {FEATURES.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="bg-card/70 border-border/70 flex flex-col items-center gap-2 rounded-xl border px-2 py-3"
            >
              <Icon className="text-primary size-5" />
              <span className="text-muted-foreground text-xs">{label}</span>
            </li>
          ))}
        </ul>

        <div className="bg-card border-border flex flex-col gap-3 rounded-2xl border p-5 shadow-sm">
          {errorMessage !== null && (
            <p
              role="alert"
              className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
            >
              {errorMessage}
            </p>
          )}
          <Button
            variant="outline"
            size="lg"
            disabled={isSigningIn}
            onClick={() => void signInWithGoogle()}
            // Google のブランドガイドラインに合わせ、白背景・グレー枠線・ロゴ左配置にする
            // （ここだけテーマトークンではなく Google 指定の色を使う）
            className="h-12 w-full gap-3 rounded-xl border-[#dadce0] bg-white text-[0.9375rem] text-[#1f1f1f] hover:bg-[#f8f9fa] hover:text-[#1f1f1f] disabled:opacity-70"
          >
            {isSigningIn ? (
              <LoaderCircle className="size-5 animate-spin" />
            ) : (
              <GoogleLogo className="size-5" />
            )}
            {isSigningIn ? 'リダイレクトしています…' : 'Google でログイン'}
          </Button>
          <p className="text-muted-foreground text-center text-xs leading-relaxed text-pretty">
            Google アカウントですぐに使いはじめられます。
          </p>
        </div>

        <p className="text-muted-foreground text-center text-xs">
          入り口は雑でいい。あとから見つかればいい。
        </p>
      </div>
    </main>
  );
};

export const Route = createFileRoute('/login')({
  validateSearch: loginSearchSchema,
  beforeLoad: ({ context, search }) => {
    // ログイン済みならログイン画面に用はないので、復帰先（既定は `/`）へ送る
    if (context.user) {
      throw redirect({ href: sanitizeRedirect(search[REDIRECT_SEARCH_PARAM]) });
    }
  },
  component: Login,
});
