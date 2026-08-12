import { createServerFn } from '@tanstack/react-start';
import { and, asc, eq } from 'drizzle-orm';

import { getDatabase } from '~/db/client';
import { shoppingItems } from '~/db/schema';
import { requireUser } from './auth.server';
import {
  addShoppingItemInputSchema,
  assertShoppingItemOwnedBy,
  toggleShoppingItemInputSchema,
  type ShoppingListItem,
} from './shopping-item';

/**
 * 買い物リストの Server Function（docs: requirements/functional.md §5）。
 *
 * どの入り口でも先に `requireUser()` を呼び、ログイン中のユーザーの項目だけを読み書きする。
 * 判定そのもの（バリデーション・所有者チェック）は `~/lib/shopping-item` の純粋な関数に
 * 寄せてあり、そちらで単体テストしている。
 *
 * このファイルはクライアントのバンドルにも入るため、ハンドラの外で
 * サーバー専用モジュールを参照しないこと。
 */

/** 画面に渡す列。`userId` のような内部の値はクライアントに出さない */
const itemColumns = {
  id: shoppingItems.id,
  label: shoppingItems.label,
  checked: shoppingItems.checked,
  createdAt: shoppingItems.createdAt,
};

/** ログイン中のユーザーの買い物リストを、追加した順に全件返す */
export const listShoppingItems = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ShoppingListItem[]> => {
    const user = await requireUser();

    return getDatabase()
      .select(itemColumns)
      .from(shoppingItems)
      .where(eq(shoppingItems.userId, user.id))
      .orderBy(asc(shoppingItems.createdAt))
      .all();
  },
);

/** 項目を 1 件追加する。ID はクライアント採番のものをそのまま使う */
export const addShoppingItem = createServerFn({ method: 'POST' })
  .inputValidator(addShoppingItemInputSchema)
  .handler(async ({ data }): Promise<ShoppingListItem> => {
    const user = await requireUser();

    const [created] = await getDatabase()
      .insert(shoppingItems)
      .values({ id: data.id, userId: user.id, label: data.label })
      .returning(itemColumns);

    if (!created) {
      throw new Error('買い物リストに追加できませんでした');
    }

    return created;
  });

/** チェックを ON/OFF する */
export const toggleShoppingItem = createServerFn({ method: 'POST' })
  .inputValidator(toggleShoppingItemInputSchema)
  .handler(async ({ data }): Promise<void> => {
    const user = await requireUser();
    const db = getDatabase();

    // 所有者を確かめてから更新する。`userId` で絞るだけだと他人の項目を指定したときに
    // 「何も起きずに成功した」ように見えてしまうため、明示的に弾く
    const item = await db
      .select({ userId: shoppingItems.userId })
      .from(shoppingItems)
      .where(eq(shoppingItems.id, data.id))
      .get();

    assertShoppingItemOwnedBy(item, user.id);

    await db
      .update(shoppingItems)
      .set({ checked: data.checked })
      .where(
        and(eq(shoppingItems.id, data.id), eq(shoppingItems.userId, user.id)),
      );
  });

/** チェック済みの項目をまとめて消す。消せるのは自分の項目だけ */
export const clearCheckedShoppingItems = createServerFn({
  method: 'POST',
}).handler(async (): Promise<void> => {
  const user = await requireUser();

  await getDatabase()
    .delete(shoppingItems)
    .where(
      and(eq(shoppingItems.userId, user.id), eq(shoppingItems.checked, true)),
    );
});
