import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import { Button } from '~/components/ui/button';
import { authClient } from '~/lib/auth-client';

const Login = () => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const signInWithGoogle = async () => {
    setErrorMessage(null);
    setIsSigningIn(true);

    // 成功した場合は Google の同意画面へ遷移するため、この先には戻ってこない
    const { error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL: '/',
    });

    setIsSigningIn(false);
    setErrorMessage(error ? 'ログインを開始できませんでした。' : null);
  };

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">ログイン</h1>
        <p className="text-muted-foreground text-sm">
          Recette は Google アカウントでログインして使います。
        </p>
      </div>
      <Button
        size="lg"
        disabled={isSigningIn}
        onClick={() => void signInWithGoogle()}
      >
        {isSigningIn ? 'リダイレクトしています…' : 'Google でログイン'}
      </Button>
      {errorMessage !== null && (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage}
        </p>
      )}
    </main>
  );
};

export const Route = createFileRoute('/login')({
  component: Login,
});
