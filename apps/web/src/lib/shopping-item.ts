import { z } from 'zod';

/**
 * 買い物リスト項目のドメインロジック（docs: requirements/functional.md §5）。
 *
 * DB にも Server Function にも触れない純粋な処理だけを置き、単体テストできるようにする。
 * D1 を触る側は `~/lib/shopping-list`。
 */

/** 画面で扱う 1 項目。DB 行のうち表示に必要な列だけを持つ */
export type ShoppingListItem = {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly createdAt: Date;
};

/** ラベルの最大長。これより長い行は買い物中に読み取れないので入り口で弾く */
export const SHOPPING_ITEM_LABEL_MAX_LENGTH = 100;

/** 「牛乳」「豚肉 300g」のようなフリーテキスト 1 行 */
export const shoppingItemLabelSchema = z
  .string()
  .trim()
  .min(1, '買うものを入力してください')
  .max(
    SHOPPING_ITEM_LABEL_MAX_LENGTH,
    `${SHOPPING_ITEM_LABEL_MAX_LENGTH} 文字以内で入力してください`,
  );

/**
 * 追加の入力。ID はクライアントで採番して渡す
 * （楽観的に描いた行が、サーバーの応答を待たずにそのままチェックできる）。
 */
export const addShoppingItemInputSchema = z.object({
  id: z.uuid(),
  label: shoppingItemLabelSchema,
});
export type AddShoppingItemInput = z.infer<typeof addShoppingItemInputSchema>;

/** チェックの ON/OFF */
export const toggleShoppingItemInputSchema = z.object({
  id: z.uuid(),
  checked: z.boolean(),
});
export type ToggleShoppingItemInput = z.infer<
  typeof toggleShoppingItemInputSchema
>;

/**
 * 見つからない場合と他人の項目だった場合で同じメッセージにする
 * （文言の違いから他ユーザーの項目の存在を推し量られないようにする）。
 */
export const SHOPPING_ITEM_NOT_FOUND_MESSAGE =
  '買い物リストの項目が見つかりません';

export class ShoppingItemNotFoundError extends Error {
  constructor() {
    super(SHOPPING_ITEM_NOT_FOUND_MESSAGE);
    this.name = 'ShoppingItemNotFoundError';
  }
}

/**
 * 操作対象がログイン中のユーザーの項目であることを確かめる。
 * 他人の項目・存在しない項目はどちらも `ShoppingItemNotFoundError` で弾く。
 */
export const assertShoppingItemOwnedBy = (
  item: { readonly userId: string } | null | undefined,
  userId: string,
): void => {
  if (item == null || item.userId !== userId) {
    throw new ShoppingItemNotFoundError();
  }
};

/** 追加が古い順。同じ秒に作られた項目もあるので、id で決着をつけて並びを安定させる */
const byCreatedAt = (a: ShoppingListItem, b: ShoppingListItem): number =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);

export type GroupedShoppingItems = {
  readonly unchecked: ShoppingListItem[];
  readonly checked: ShoppingListItem[];
};

/**
 * 未チェックを上・チェック済みを下に分ける。
 * 店内では「まだ買っていないもの」だけを見たいので、買い終わった行は下に沈める。
 */
export const groupShoppingItems = (
  items: readonly ShoppingListItem[],
): GroupedShoppingItems => ({
  unchecked: items.filter((item) => !item.checked).sort(byCreatedAt),
  checked: items.filter((item) => item.checked).sort(byCreatedAt),
});

/** 楽観的更新で先に描く操作 */
export type ShoppingListAction =
  | { readonly type: 'add'; readonly item: ShoppingListItem }
  | { readonly type: 'toggle'; readonly id: string; readonly checked: boolean }
  | { readonly type: 'clearChecked' };

/**
 * 操作を適用したリストを返す（元の配列は変更しない）。
 *
 * サーバーの応答を待たずにこの結果を描き、保存後にローダーの実データへ揃える。
 */
export const applyShoppingListAction = (
  items: readonly ShoppingListItem[],
  action: ShoppingListAction,
): ShoppingListItem[] => {
  switch (action.type) {
    case 'add':
      return [...items, action.item];
    case 'toggle':
      return items.map((item) =>
        item.id === action.id ? { ...item, checked: action.checked } : item,
      );
    case 'clearChecked':
      return items.filter((item) => !item.checked);
  }
};
