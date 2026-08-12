import { asc, desc, eq } from 'drizzle-orm';

import type { Database } from './client';
import { cookLogPhotos, cookLogs } from './schema';

/**
 * 作った記録の読み書きを行う永続化層。
 *
 * `~/db/recipe-store` と同じ考え方で、認可や差し替えの手順といったロジックは
 * ユースケース（`~/lib/cook-log-service`）に置き、ここは「言われたとおりに
 * 読み書きするだけ」に留める（偽の store を渡せば D1 なしでテストできる）。
 */
export type CookLogStore = {
  /** レシピ 1 件分の記録。最終的な並びはユースケース側で決める */
  listCookLogs(recipeId: string): Promise<
    Array<{
      id: string;
      cookedAt: string;
      memo: string | null;
      createdAt: Date;
    }>
  >;
  /**
   * レシピ配下の記録に紐づく写真を、記録をまたいで一度に引く。
   * 記録 1 件ずつ引くと N+1 になるため、まとめて取ってから割り当てる。
   */
  listCookLogPhotosByRecipe(
    recipeId: string,
  ): Promise<Array<{ cookLogId: string; storageKey: string; order: number }>>;
  /** 記録 1 件。存在しなければ `undefined` */
  findCookLog(cookLogId: string): Promise<
    | {
        id: string;
        recipeId: string;
        cookedAt: string;
        memo: string | null;
      }
    | undefined
  >;
  /** 記録の写真（`order` 昇順）。実体は R2 にあり、ここで持つのはキーだけ */
  findCookLogPhotos(cookLogId: string): Promise<Array<{ storageKey: string }>>;
  /** 記録本体を作成し、採番した ID を返す */
  insertCookLog(cookLog: {
    recipeId: string;
    cookedAt: string;
    memo: string | null;
  }): Promise<string>;
  /** 記録本体を更新する */
  updateCookLog(
    cookLogId: string,
    values: { cookedAt: string; memo: string | null },
  ): Promise<void>;
  /** 記録本体を削除する。写真の行は FK のカスケードで消える */
  deleteCookLog(cookLogId: string): Promise<void>;
  /** 写真行を丸ごと差し替える。R2 の実体はユースケース側が別途始末する */
  replaceCookLogPhotos(
    cookLogId: string,
    rows: ReadonlyArray<{ storageKey: string; order: number }>,
  ): Promise<void>;
};

/**
 * D1 上の実装。
 *
 * D1 はインタラクティブなトランザクションを持たないため、差し替えは
 * delete → insert の 2 文を素直に流す（`~/db/recipe-store` と同じ方針）。
 */
export const createCookLogStore = (db: Database): CookLogStore => ({
  listCookLogs: (recipeId) =>
    db
      .select({
        id: cookLogs.id,
        cookedAt: cookLogs.cookedAt,
        memo: cookLogs.memo,
        createdAt: cookLogs.createdAt,
      })
      .from(cookLogs)
      .where(eq(cookLogs.recipeId, recipeId))
      // `cook_logs_recipe_id_cooked_at_idx` に乗る並び
      .orderBy(desc(cookLogs.cookedAt), desc(cookLogs.createdAt))
      .all(),

  listCookLogPhotosByRecipe: (recipeId) =>
    db
      .select({
        cookLogId: cookLogPhotos.cookLogId,
        storageKey: cookLogPhotos.storageKey,
        order: cookLogPhotos.order,
      })
      .from(cookLogPhotos)
      .innerJoin(cookLogs, eq(cookLogs.id, cookLogPhotos.cookLogId))
      .where(eq(cookLogs.recipeId, recipeId))
      .orderBy(asc(cookLogPhotos.order))
      .all(),

  findCookLog: (cookLogId) =>
    db
      .select({
        id: cookLogs.id,
        recipeId: cookLogs.recipeId,
        cookedAt: cookLogs.cookedAt,
        memo: cookLogs.memo,
      })
      .from(cookLogs)
      .where(eq(cookLogs.id, cookLogId))
      .get(),

  findCookLogPhotos: (cookLogId) =>
    db
      .select({ storageKey: cookLogPhotos.storageKey })
      .from(cookLogPhotos)
      .where(eq(cookLogPhotos.cookLogId, cookLogId))
      .orderBy(asc(cookLogPhotos.order))
      .all(),

  insertCookLog: async (cookLog) => {
    const inserted = await db
      .insert(cookLogs)
      .values(cookLog)
      .returning({ id: cookLogs.id })
      .get();

    return inserted.id;
  },

  updateCookLog: async (cookLogId, values) => {
    await db.update(cookLogs).set(values).where(eq(cookLogs.id, cookLogId));
  },

  deleteCookLog: async (cookLogId) => {
    // 写真の行は `ON DELETE CASCADE` に任せる（schema.ts の `cookLogPhotos` を参照）
    await db.delete(cookLogs).where(eq(cookLogs.id, cookLogId));
  },

  replaceCookLogPhotos: async (cookLogId, rows) => {
    await db
      .delete(cookLogPhotos)
      .where(eq(cookLogPhotos.cookLogId, cookLogId));

    if (rows.length > 0) {
      await db
        .insert(cookLogPhotos)
        .values(rows.map((row) => ({ ...row, cookLogId })));
    }
  },
});
