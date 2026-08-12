import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Check, Plus, ShoppingBasket, Trash2 } from 'lucide-react';
import { startTransition, useOptimistic, useState } from 'react';
import type { FormEvent } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import {
  SHOPPING_ITEM_LABEL_MAX_LENGTH,
  applyShoppingListAction,
  groupShoppingItems,
  shoppingItemLabelSchema,
  type ShoppingListAction,
  type ShoppingListItem,
} from '~/lib/shopping-item';
import {
  addShoppingItem,
  clearCheckedShoppingItems,
  listShoppingItems,
  toggleShoppingItem,
} from '~/lib/shopping-list';
import { cn } from '~/lib/utils';

/** 保存に失敗したときの案内。原因は伏せて、やり直せることだけ伝える */
const SAVE_ERROR_MESSAGE =
  '保存できませんでした。通信環境を確かめて、もう一度お試しください。';

type ShoppingItemRowProps = {
  readonly item: ShoppingListItem;
  readonly onToggle: (item: ShoppingListItem) => void;
};

/**
 * 買い物リストの 1 行。
 *
 * 片手・店内での操作が前提なので、チェックボックスだけでなく行全体を
 * タップターゲットにしている（`role="checkbox"` でチェックボックスとして読ませる）。
 */
const ShoppingItemRow = ({ item, onToggle }: ShoppingItemRowProps) => (
  <li>
    <button
      type="button"
      role="checkbox"
      aria-checked={item.checked}
      onClick={() => onToggle(item)}
      className="border-border bg-card focus-visible:ring-ring/50 active:bg-muted flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left outline-none transition-colors focus-visible:ring-3"
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors',
          item.checked
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-input',
        )}
      >
        {item.checked && <Check className="size-4" />}
      </span>
      <span
        className={cn(
          'text-base leading-snug break-words',
          item.checked && 'text-muted-foreground line-through',
        )}
      >
        {item.label}
      </span>
    </button>
  </li>
);

/** 買い物リスト画面 */
const ShoppingListPage = () => {
  const router = useRouter();
  const items = Route.useLoaderData();
  const [optimisticItems, applyOptimistic] = useOptimistic(
    items,
    applyShoppingListAction,
  );
  const [label, setLabel] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  const { unchecked, checked } = groupShoppingItems(optimisticItems);

  /**
   * 楽観的更新を先に描いてから保存し、保存後にローダーを引き直して実データへ揃える。
   * 失敗した場合、楽観的更新はトランジションの終了時に自動で巻き戻る。
   */
  const mutate = (action: ShoppingListAction, save: () => Promise<unknown>) => {
    startTransition(async () => {
      applyOptimistic(action);

      try {
        await save();
        await router.invalidate();
        setErrorMessage(null);
      } catch {
        setErrorMessage(SAVE_ERROR_MESSAGE);
      }
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsed = shoppingItemLabelSchema.safeParse(label);
    if (!parsed.success) {
      setErrorMessage(parsed.error.issues[0]?.message ?? SAVE_ERROR_MESSAGE);
      return;
    }

    // 続けて何個も打ち込めるよう、入力欄は送信と同時に空にする
    setLabel('');

    // ID をここで採番しておくと、保存を待つ間の行もそのままチェックできる
    const id = crypto.randomUUID();
    mutate(
      {
        type: 'add',
        item: { id, label: parsed.data, checked: false, createdAt: new Date() },
      },
      () => addShoppingItem({ data: { id, label: parsed.data } }),
    );
  };

  const handleToggle = (item: ShoppingListItem) => {
    const checkedNext = !item.checked;

    mutate({ type: 'toggle', id: item.id, checked: checkedNext }, () =>
      toggleShoppingItem({ data: { id: item.id, checked: checkedNext } }),
    );
  };

  const handleClearChecked = () => {
    setIsConfirmingClear(false);
    mutate({ type: 'clearChecked' }, () => clearCheckedShoppingItems());
  };

  return (
    <>
      {/* 下部固定の入力欄に最後の行が隠れないよう、その分の余白を確保する */}
      <section className="flex flex-col gap-5 pb-20">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            買い物リスト
          </h1>
          {optimisticItems.length > 0 && (
            <p className="text-muted-foreground text-sm">
              残り {unchecked.length} 件
            </p>
          )}
        </div>

        {errorMessage !== null && (
          <p
            role="alert"
            className="text-destructive bg-destructive/10 rounded-lg px-3 py-2 text-sm"
          >
            {errorMessage}
          </p>
        )}

        {optimisticItems.length === 0 ? (
          <div className="bg-card border-border flex flex-col items-center gap-3 rounded-2xl border px-6 py-12 text-center">
            <ShoppingBasket
              className="text-primary size-8"
              aria-hidden="true"
            />
            <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
              買うものはまだありません。
              <br />
              下の入力欄から追加してください。
            </p>
          </div>
        ) : (
          <>
            {unchecked.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {unchecked.map((item) => (
                  <ShoppingItemRow
                    key={item.id}
                    item={item}
                    onToggle={handleToggle}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground rounded-2xl border border-dashed px-6 py-8 text-center text-sm">
                ぜんぶかごに入りました。
              </p>
            )}

            {checked.length > 0 && (
              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-muted-foreground text-sm font-medium">
                    かごに入れた（{checked.length}）
                  </h2>
                  {/* 削除は入力欄から遠いこの位置に置き、さらに確認を挟む */}
                  <AlertDialog
                    open={isConfirmingClear}
                    onOpenChange={setIsConfirmingClear}
                  >
                    <AlertDialogTrigger
                      render={<Button variant="destructive" size="sm" />}
                    >
                      <Trash2 data-icon="inline-start" />
                      まとめて削除
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogMedia>
                          <Trash2 className="text-destructive" />
                        </AlertDialogMedia>
                        <AlertDialogTitle>
                          チェック済みを削除しますか？
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          かごに入れた {checked.length}{' '}
                          件をリストから消します。元には戻せません。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>キャンセル</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={handleClearChecked}
                        >
                          削除する
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <ul className="flex flex-col gap-2">
                  {checked.map((item) => (
                    <ShoppingItemRow
                      key={item.id}
                      item={item}
                      onToggle={handleToggle}
                    />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </section>

      {/*
        入力欄は親指が届く下部に固定する。
        下部タブバー（`_authenticated.tsx`）の高さ 4.25rem 分だけ持ち上げて重ならないようにする。
      */}
      <div className="bg-background/95 border-border fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 border-t backdrop-blur">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex w-full max-w-md items-center gap-2 px-4 py-2.5"
        >
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            aria-label="買うものを追加"
            placeholder="牛乳、豚肉 300g など"
            maxLength={SHOPPING_ITEM_LABEL_MAX_LENGTH}
            autoComplete="off"
            enterKeyHint="done"
            className="h-11 flex-1 rounded-xl"
          />
          <Button
            type="submit"
            aria-label="追加"
            disabled={label.trim() === ''}
            className="size-11 shrink-0 rounded-xl"
          >
            <Plus className="size-5" />
          </Button>
        </form>
      </div>
    </>
  );
};

export const Route = createFileRoute('/_authenticated/shopping-list')({
  loader: () => listShoppingItems(),
  component: ShoppingListPage,
});
