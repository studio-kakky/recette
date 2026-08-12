import {
  createFileRoute,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import { useState } from 'react';

import { Button } from '~/components/ui/button';
import { authClient } from '~/lib/auth-client';

const Home = () => {
  const { user } = Route.useRouteContext();
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
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Recette</h1>
      <p className="text-muted-foreground text-sm">
        レシピを集めて、いつでも取り出せるように。
      </p>
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          <span className="font-medium">{user.name}</span> でログイン中
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={isSigningOut}
            onClick={() => void signOut()}
          >
            ログアウト
          </Button>
        </div>
      </div>
    </main>
  );
};

export const Route = createFileRoute('/_authenticated/')({
  component: Home,
});
