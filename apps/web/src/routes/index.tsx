import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';

import { Button } from '~/components/ui/button';
import { authClient } from '~/lib/auth-client';
import { fetchOptionalUser } from '~/lib/session';

const Home = () => {
  const user = Route.useLoaderData();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const signOut = async () => {
    setIsSigningOut(true);
    await authClient.signOut();
    // ローダーを流し直してログイン状態の表示を更新する
    await router.invalidate();
    setIsSigningOut(false);
  };

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Recette</h1>
      <p className="text-muted-foreground text-sm">
        レシピを集めて、いつでも取り出せるように。
      </p>
      {user ? (
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
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button render={<Link to="/login" />}>ログイン</Button>
        </div>
      )}
    </main>
  );
};

export const Route = createFileRoute('/')({
  loader: () => fetchOptionalUser(),
  component: Home,
});
