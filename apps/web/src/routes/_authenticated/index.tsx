import { Link, createFileRoute } from '@tanstack/react-router';
import {
  Link2,
  NotebookPen,
  Plus,
  SearchX,
  UtensilsCrossed,
} from 'lucide-react';
import { useCallback } from 'react';

import { RecipeSearchPanel } from '~/components/recipe-search-panel';
import { Button } from '~/components/ui/button';
import { toImageUrl } from '~/lib/image-key';
import { fetchRecipeSummaries, fetchTagNames } from '~/lib/recipe';
import {
  CLEARED_RECIPE_SEARCH,
  isRecipeSearchActive,
  normalizeRecipeSearch,
  recipeSearchSchema,
  withKeyword,
  withToggledTagName,
} from '~/lib/recipe-search';
import type { RecipeSummary } from '~/lib/recipe-service';

/**
 * レシピ一覧（ホーム）。
 *
 * ヘッダー・ナビ・ログアウトは共通シェル（`_authenticated.tsx`）が持つので、
 * ここは本文だけを描く。
 *
 * 絞り込み条件は URL のクエリ（`?q=` `?tags=`）に載せる。リロードしても
 * 戻ってきても同じ結果になり、条件付きの一覧をそのまま共有・ブックマークもできる。
 */

/** カード 1 枚。片手で押せるよう、カード全体をリンクにする */
const RecipeCard = ({ recipe }: { recipe: RecipeSummary }) => (
  <li>
    <Link
      to="/recipes/$recipeId"
      params={{ recipeId: recipe.id }}
      className="bg-card border-border hover:bg-accent/40 focus-visible:ring-ring/50 flex gap-3 rounded-2xl border p-4 transition-colors outline-none focus-visible:ring-3"
    >
      {/* 隣にタイトルがあるので、サムネイル自体は読み上げ対象にしない */}
      {recipe.photoStorageKey !== null && (
        <img
          src={toImageUrl(recipe.photoStorageKey)}
          alt=""
          loading="lazy"
          className="border-border bg-muted size-16 shrink-0 rounded-xl border object-cover"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-2">
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
      </div>
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

/** 絞り込んだ結果が 0 件のとき。条件を外す導線をその場に置く */
const NoMatchState = ({ onClear }: { readonly onClear: () => void }) => (
  <div className="bg-card border-border flex flex-col items-center gap-3 rounded-2xl border px-6 py-12 text-center">
    <SearchX className="text-primary size-8" aria-hidden="true" />
    <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
      条件に合うレシピが見つかりませんでした。
      <br />
      言葉を変えるか、条件を外してみてください。
    </p>
    <Button variant="outline" size="lg" onClick={onClear}>
      条件をクリア
    </Button>
  </div>
);

const Home = () => {
  const { recipes, tagOptions } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const criteria = normalizeRecipeSearch(search);
  const isSearching = isRecipeSearchActive(criteria);

  // 絞り込みは履歴に積まない（戻るたびに 1 文字ずつ遡らせない）。
  // 条件は現在のクエリから作り直すので、ハンドラは navigate だけに依存する
  const handleKeywordChange = useCallback(
    (keyword: string) => {
      void navigate({
        search: (previous) => withKeyword(previous, keyword),
        replace: true,
      });
    },
    [navigate],
  );

  const handleTagToggle = useCallback(
    (name: string) => {
      void navigate({
        search: (previous) => withToggledTagName(previous, name),
        replace: true,
      });
    },
    [navigate],
  );

  const handleClear = useCallback(() => {
    void navigate({ search: CLEARED_RECIPE_SEARCH, replace: true });
  }, [navigate]);

  // レシピもタグも無い＝まだ何も放り込んでいない人には、検索窓を出さない
  const canSearch = isSearching || recipes.length > 0 || tagOptions.length > 0;

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

      {canSearch && (
        <RecipeSearchPanel
          keyword={criteria.keyword ?? ''}
          selectedTagNames={criteria.tagNames}
          tagOptions={tagOptions}
          onKeywordChange={handleKeywordChange}
          onTagToggle={handleTagToggle}
        />
      )}

      {recipes.length === 0 ? (
        isSearching ? (
          <NoMatchState onClear={handleClear} />
        ) : (
          <EmptyState />
        )
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
  validateSearch: recipeSearchSchema,
  // 条件が変わったらローダーを引き直す（正規化してから渡すので、表記ゆれで再取得しない）
  loaderDeps: ({ search }) => normalizeRecipeSearch(search),
  loader: async ({ deps }) => {
    const [recipes, tagOptions] = await Promise.all([
      fetchRecipeSummaries({ data: deps }),
      // チップに出す候補は絞り込み結果に依らない（条件を足し引きできるようにする）
      fetchTagNames(),
    ]);

    return { recipes, tagOptions };
  },
  component: Home,
});
