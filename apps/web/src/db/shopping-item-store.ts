import type { Database } from './client';
import { shoppingItems } from './schema';

/**
 * 買い物リスト項目の永続化層。
 *
 * レシピの材料から追加するユースケース（`~/lib/recipe-service`）が使う分だけを
 * 切り出してある。画面から直接呼ぶ読み書きは `~/lib/shopping-list` にある。
 */
export type ShoppingItemStore = {
  /** 項目をまとめて追加する。同じラベルが既にあっても弾かない */
  insertShoppingItems(
    rows: ReadonlyArray<{
      userId: string;
      label: string;
      recipeId: string | null;
    }>,
  ): Promise<void>;
};

/** D1 上の実装 */
export const createShoppingItemStore = (db: Database): ShoppingItemStore => ({
  insertShoppingItems: async (rows) => {
    if (rows.length === 0) {
      return;
    }

    await db.insert(shoppingItems).values(rows.map((row) => ({ ...row })));
  },
});
