import { Link, createFileRoute } from '@tanstack/react-router';
import { NotebookPen, Plus } from 'lucide-react';

import { Button } from '~/components/ui/button';

/**
 * レシピ一覧のプレースホルダー。
 *
 * ヘッダー・ナビ・ログアウトは共通シェル（`_authenticated.tsx`）が持つので、
 * ここは本文だけを描く。一覧の中身は後続で実装する。
 */
const Home = () => {
  const { user } = Route.useRouteContext();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          レシピ
        </h1>
        <p className="text-muted-foreground text-sm">
          <span className="text-foreground font-medium">{user.name}</span>{' '}
          さんのレシピ帳
        </p>
      </div>
      <div className="bg-card border-border flex flex-col items-center gap-3 rounded-2xl border px-6 py-12 text-center">
        <NotebookPen className="text-primary size-8" aria-hidden="true" />
        <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
          まだレシピがありません。
          <br />
          入り口は雑でいい。あとから見つかればいい。
        </p>
        {/* 一覧と新規作成ボタンの本実装までの暫定の入り口 */}
        <Button render={<Link to="/recipes/new" />} size="lg">
          <Plus />
          レシピを追加
        </Button>
      </div>
    </section>
  );
};

export const Route = createFileRoute('/_authenticated/')({
  component: Home,
});
