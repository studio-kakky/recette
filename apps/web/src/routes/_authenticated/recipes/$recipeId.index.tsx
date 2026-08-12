import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import { ExternalLink, LoaderCircle, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { RecipeCookLogs } from '~/components/recipe-cook-logs';
import { RecipeIngredients } from '~/components/recipe-ingredients';
import { RecipeNotFound } from '~/components/recipe-not-found';
import { Button } from '~/components/ui/button';
import { fetchCookLogs } from '~/lib/cook-log';
import { toImageUrl } from '~/lib/image-key';
import { deleteRecipe, fetchRecipeDetail } from '~/lib/recipe';

/**
 * レシピ詳細。
 *
 * 登録済みの全フィールドを読む画面であり、編集・削除の起点でもある。
 * 未入力のフィールドは節ごと出さない（空の見出しを並べても読みにくいだけなので）。
 */

const Section = ({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) => (
  <section className="flex flex-col gap-3">
    <h2 className="font-heading text-base font-semibold">{title}</h2>
    {children}
  </section>
);

const RecipeDetail = () => {
  const { recipe, cookLogs } = Route.useLoaderData();
  const { recipeId } = Route.useParams();
  const router = useRouter();
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const handleDelete = async () => {
    // 取り消せない操作なので、ネイティブの確認ダイアログを 1 枚挟む
    if (
      !window.confirm(
        `「${recipe.title}」を削除します。元に戻せません。よろしいですか？`,
      )
    ) {
      return;
    }

    setError(undefined);
    setIsDeleting(true);

    try {
      await deleteRecipe({ data: { recipeId } });
      // 消えたレシピが一覧に残らないよう、遷移前にローダーのキャッシュを捨てる
      await router.invalidate();
      await navigate({ to: '/' });
    } catch {
      setError('削除できませんでした。時間をおいてもう一度お試しください。');
      setIsDeleting(false);
    }
  };

  // ヘッダー・ナビは共通シェル（`_authenticated.tsx`）が持つので、ここは本文だけを描く
  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-pretty">
          {recipe.title}
        </h1>
        {recipe.tagNames.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {recipe.tagNames.map((name) => (
              <li
                key={name}
                className="bg-secondary text-secondary-foreground rounded-full px-2.5 py-1 text-xs font-medium"
              >
                {name}
              </li>
            ))}
          </ul>
        )}
        {recipe.url !== null && (
          <a
            href={recipe.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary focus-visible:ring-ring/50 inline-flex items-start gap-1.5 rounded-lg text-sm outline-none hover:underline focus-visible:ring-3"
          >
            <ExternalLink className="mt-0.5 size-4 shrink-0" />
            <span className="break-all">{recipe.url}</span>
          </a>
        )}
      </header>

      {recipe.ingredients.length > 0 && (
        <RecipeIngredients
          recipeId={recipeId}
          ingredients={recipe.ingredients}
        />
      )}

      {recipe.steps.length > 0 && (
        <Section title="手順">
          <ol className="flex flex-col gap-2">
            {recipe.steps.map((step, index) => (
              <li
                key={`${index}-${step.body}`}
                className="border-border bg-card flex items-start gap-2 rounded-xl border p-3"
              >
                <span className="bg-secondary text-secondary-foreground mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs tabular-nums">
                  {index + 1}
                </span>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {recipe.memo !== null && (
        <Section title="メモ">
          <p className="border-border bg-card rounded-xl border p-3 text-sm leading-relaxed whitespace-pre-wrap">
            {recipe.memo}
          </p>
        </Section>
      )}

      {recipe.photos.length > 0 && (
        <Section title="写真">
          {/*
            本のページやスクショが多いので、切り抜かず元の比率のまま縦に並べる。
            細かい字は拡大して読めるよう、タップで実体を開けるようにしておく。
          */}
          <ul className="flex flex-col gap-3">
            {recipe.photos.map((photo, index) => (
              <li key={photo.storageKey}>
                <a
                  href={toImageUrl(photo.storageKey)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus-visible:ring-ring/50 block rounded-xl outline-none focus-visible:ring-3"
                >
                  <img
                    src={toImageUrl(photo.storageKey)}
                    alt={`${recipe.title} の写真 ${index + 1}`}
                    loading="lazy"
                    className="border-border bg-muted w-full rounded-xl border"
                  />
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <RecipeCookLogs recipeId={recipeId} cookLogs={cookLogs} />

      {error !== undefined && (
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
        >
          {error}
        </p>
      )}

      {/* 画面下端は共通シェルのタブバーが占めるので、操作ボタンは本文の末尾に置く */}
      <div className="border-border flex gap-3 border-t pt-5">
        <Button
          render={<Link to="/recipes/$recipeId/edit" params={{ recipeId }} />}
          size="lg"
          className="flex-1"
        >
          <Pencil />
          編集する
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="lg"
          disabled={isDeleting}
          onClick={() => void handleDelete()}
        >
          {isDeleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
          {isDeleting ? '削除しています…' : '削除'}
        </Button>
      </div>
    </article>
  );
};

export const Route = createFileRoute('/_authenticated/recipes/$recipeId/')({
  // レシピ本体と作った記録は互いに依存しないので、まとめて取りに行く
  loader: async ({ params }) => {
    const [recipe, cookLogs] = await Promise.all([
      fetchRecipeDetail({ data: { recipeId: params.recipeId } }),
      fetchCookLogs({ data: { recipeId: params.recipeId } }),
    ]);

    return { recipe, cookLogs };
  },
  component: RecipeDetail,
  notFoundComponent: RecipeNotFound,
});
