import { createFileRoute } from '@tanstack/react-router';

import { Button } from '~/components/ui/button';

const Home = () => (
  <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 px-6 py-12">
    <h1 className="text-3xl font-bold tracking-tight">Recette</h1>
    <p className="text-muted-foreground text-sm">
      レシピを集めて、いつでも取り出せるように。
    </p>
    <div className="flex flex-wrap gap-3">
      <Button>はじめる</Button>
      <Button variant="outline">くわしく見る</Button>
    </div>
  </main>
);

export const Route = createFileRoute('/')({
  component: Home,
});
