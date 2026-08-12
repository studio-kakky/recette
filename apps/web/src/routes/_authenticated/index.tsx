import { Link, createFileRoute } from '@tanstack/react-router';
import { Link2, NotebookPen, Plus, UtensilsCrossed } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { fetchRecipeSummaries } from '~/lib/recipe';
import type { RecipeSummary } from '~/lib/recipe-service';

/**
 * レシピ一覧（ホーム）。
 *
 * ヘッダー・ナビ・ログアウトは共通シェル（`_authenticated.tsx`）が持つので、
 * ここは本文だけを描く。
 */

/** カード 1 枚。片手で押せるよう、カード全体をリンクにする */
const RecipeCard = ({ recipe }: { recipe: RecipeSummary }) => (
  <li>
    <Link
      to="/recipes/$recipeId"
      params={{ recipeId: recipe.id }}
      className="bg-card border-border hover:bg-accent/40 focus-visible:ring-ring/50 flex flex-col gap-2 rounded-2xl border p-4 transition-colors outline-none focus-visible:ring-3"
    >
      <h2 className="font-heading leading-snug font-bold tracking-tight text-pretty">
        {recipe.title}
      </h2>

      {recipe.tagNames.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {recipe.tagNames.map((name) => (
            <li
              key={name}
              className="bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-xs"
            >
              {name}
            </li>
          ))}
        </ul>
      )}

      <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="flex items-center gap-1">
          <UtensilsCrossed className="size-3.5" aria-hidden="true" />
          {recipe.cookCount === 0
            ? 'まだ作っていない'
            : `${recipe.cookCount} 回作った`}
        </span>
        {recipe.hasUrl && (
          <span className="flex items-center gap-1">
            <Link2 className="size-3.5" aria-hidden="true" />
            リンクあり
          </span>
        )}
      </p>
    </Link>
  </li>
);

/** 1 件も無いときの入り口 */
const EmptyState = () => (
  <div className="bg-card border-border flex flex-col items-center gap-3 rounded-2xl border px-6 py-12 text-center">
    <NotebookPen className="text-primary size-8" aria-hidden="true" />
    <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
      まだレシピがありません。
      <br />
      入り口は雑でいい。あとから見つかればいい。
    </p>
    <Button render={<Link to="/recipes/new" />} size="lg">
      <Plus />
      最初のレシピを放り込む
    </Button>
  </div>
);

const Home = () => {
  const recipes = Route.useLoaderData();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          レシピ
        </h1>
        {recipes.length > 0 && (
          <p className="text-muted-foreground text-sm">{recipes.length} 件</p>
        )}
      </div>

      {recipes.length === 0 ? (
        <EmptyState />
      ) : (
        // 最後のカードが FAB に隠れないよう、リストの下に余白を足す
        <ul className="flex flex-col gap-3 pb-16">
          {recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </ul>
      )}

      {/*
        新規作成の FAB。下部タブバー（`_authenticated.tsx`）の上に浮かせる。
        本文と同じ max-w-md の中で右寄せし、幅の広い画面でも親指の位置から離れないようにする。
        空状態のときは同じ導線がカード内にあるので出さない。
      */}
      {recipes.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-20">
          <div className="mx-auto flex w-full max-w-md justify-end px-4">
            <Button
              render={<Link to="/recipes/new" />}
              aria-label="レシピを追加"
              className="pointer-events-auto size-14 rounded-full shadow-lg"
            >
              <Plus className="size-6" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
};

export const Route = createFileRoute('/_authenticated/')({
  loader: () => fetchRecipeSummaries(),
  component: Home,
});
