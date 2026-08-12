import { Link, useRouter } from '@tanstack/react-router';
import { Check, LoaderCircle, ShoppingBasket } from 'lucide-react';
import { useState } from 'react';

import { Button } from '~/components/ui/button';
import { sendIngredientsToShoppingList } from '~/lib/recipe';
import { cn } from '~/lib/utils';

/**
 * レシピ詳細の材料セクション（docs: requirements/functional.md §5）。
 *
 * 通常は読むだけの一覧で、「買い物リストへ」を押した間だけ選択モードに変わる。
 * 買い物リストに送るのは行の添字だけで、ラベルはサーバー側で組み立て直す。
 */

type IngredientRow = {
  readonly name: string;
  readonly amount: string | null;
};

type RecipeIngredientsProps = {
  readonly recipeId: string;
  readonly ingredients: readonly IngredientRow[];
};

const SAVE_ERROR_MESSAGE =
  '買い物リストに追加できませんでした。通信環境を確かめて、もう一度お試しください。';

const IngredientAmount = ({ amount }: { readonly amount: string }) => (
  <span className="text-muted-foreground shrink-0 tabular-nums">{amount}</span>
);

export const RecipeIngredients = ({
  recipeId,
  ingredients,
}: RecipeIngredientsProps) => {
  const router = useRouter();
  // null は選択モードでない状態。モード中だけ選んだ行の添字を持つ
  const [selectedIndexes, setSelectedIndexes] = useState<
    readonly number[] | null
  >(null);
  const [addedCount, setAddedCount] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isSelecting = selectedIndexes !== null;
  const isAllSelected =
    isSelecting && selectedIndexes.length === ingredients.length;

  const startSelecting = () => {
    setSelectedIndexes([]);
    // 前回の結果を残したままだと、どの操作への返事か分からなくなる
    setAddedCount(null);
    setErrorMessage(null);
  };

  const toggleIndex = (index: number) => {
    setSelectedIndexes((current) => {
      if (current === null) {
        return current;
      }

      return current.includes(index)
        ? current.filter((selected) => selected !== index)
        : [...current, index];
    });
  };

  const toggleAll = () => {
    setSelectedIndexes(
      isAllSelected ? [] : ingredients.map((_, index) => index),
    );
  };

  const handleAdd = async () => {
    if (selectedIndexes === null || selectedIndexes.length === 0) {
      return;
    }

    setErrorMessage(null);
    setIsSaving(true);

    try {
      const { addedCount: added } = await sendIngredientsToShoppingList({
        data: { recipeId, ingredientIndexes: [...selectedIndexes] },
      });

      setSelectedIndexes(null);
      setAddedCount(added);
      // 買い物リストのローダーが古い一覧を出さないよう、キャッシュを捨てる
      await router.invalidate();
    } catch {
      setErrorMessage(SAVE_ERROR_MESSAGE);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-base font-semibold">材料</h2>
        {isSelecting ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIndexes(null)}
          >
            やめる
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={startSelecting}
          >
            <ShoppingBasket data-icon="inline-start" />
            買い物リストへ
          </Button>
        )}
      </div>

      {isSelecting && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            {selectedIndexes.length} 件を選択中
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={toggleAll}>
            {isAllSelected ? 'すべて解除' : 'すべて選択'}
          </Button>
        </div>
      )}

      <ul className="border-border bg-card divide-border divide-y rounded-xl border">
        {ingredients.map((ingredient, index) => (
          // 同じ材料名を 2 行書けるので、並び順を含めたキーにする
          <li key={`${index}-${ingredient.name}`}>
            {isSelecting ? (
              // 片手で操作できるよう、チェックボックスだけでなく行全体を押せるようにする
              <button
                type="button"
                role="checkbox"
                aria-checked={selectedIndexes.includes(index)}
                onClick={() => toggleIndex(index)}
                className="focus-visible:ring-ring/50 active:bg-muted flex min-h-12 w-full items-center gap-3 px-3 py-2.5 text-left text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-inset"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors',
                    selectedIndexes.includes(index)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input',
                  )}
                >
                  {selectedIndexes.includes(index) && (
                    <Check className="size-4" />
                  )}
                </span>
                <span className="flex-1 break-words">{ingredient.name}</span>
                {ingredient.amount !== null && (
                  <IngredientAmount amount={ingredient.amount} />
                )}
              </button>
            ) : (
              <div className="flex items-baseline justify-between gap-3 px-3 py-2.5 text-sm">
                <span>{ingredient.name}</span>
                {ingredient.amount !== null && (
                  <IngredientAmount amount={ingredient.amount} />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {isSelecting && (
        <Button
          type="button"
          size="lg"
          disabled={selectedIndexes.length === 0 || isSaving}
          onClick={() => void handleAdd()}
        >
          {isSaving ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <ShoppingBasket />
          )}
          {isSaving
            ? '追加しています…'
            : selectedIndexes.length === 0
              ? '買い物リストに追加'
              : `${selectedIndexes.length} 件を買い物リストに追加`}
        </Button>
      )}

      {addedCount !== null && (
        <p
          role="status"
          className="bg-secondary text-secondary-foreground flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-sm"
        >
          <span>{addedCount} 件追加しました</span>
          <Link
            to="/shopping-list"
            className="text-primary focus-visible:ring-ring/50 rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3"
          >
            買い物リストを見る
          </Link>
        </p>
      )}

      {errorMessage !== null && (
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
        >
          {errorMessage}
        </p>
      )}
    </section>
  );
};
