import { and, asc, count, desc, eq, inArray, min, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';

import type { RecipeSearchCriteria } from '~/lib/recipe-search';

import type { Database } from './client';
import { LIKE_ESCAPE_CHARACTER, toLikeContainsPattern } from './like';
import {
  cookLogs,
  ingredients,
  photos,
  recipeTags,
  recipes,
  steps,
  tags,
} from './schema';

/** `LIKE` の部分一致。メタ文字は打ち消してあるので `ESCAPE` 句を必ず添える */
const likeContains = (column: SQLiteColumn, pattern: string): SQL =>
  sql`${column} like ${pattern} escape ${LIKE_ESCAPE_CHARACTER}`;

/**
 * キーワードの絞り込み。タイトル・メモ・材料名のどれかに含まれていれば残す（OR）。
 *
 * 材料はレシピ 1 件に複数行あるため、結合ではなく `EXISTS` で「1 行でも一致するか」を見る
 * （結合するとレシピが材料の数だけ重複してしまう）。
 */
const buildKeywordFilter = (keyword: string): SQL | undefined => {
  const pattern = toLikeContainsPattern(keyword);

  return or(
    likeContains(recipes.title, pattern),
    // メモ未入力（NULL）は LIKE の結果も NULL になり、一致扱いにならない
    likeContains(recipes.memo, pattern),
    sql`exists (select 1 from ${ingredients} where ${ingredients.recipeId} = ${recipes.id} and ${likeContains(ingredients.name, pattern)})`,
  );
};

/**
 * タグの絞り込み。選択したタグを **すべて** 持つレシピだけを残す（AND）。
 *
 * 「一致したタグの種類数 = 選択数」で AND を表現する。タグ名はユーザー内で
 * ユニークなので、種類数を数えれば「どれか 1 つに複数回一致した」と区別できる。
 */
const buildTagFilter = (tagNames: readonly string[]): SQL =>
  sql`(select count(distinct ${tags.name}) from ${recipeTags} inner join ${tags} on ${tags.id} = ${recipeTags.tagId} where ${recipeTags.recipeId} = ${recipes.id} and ${inArray(tags.name, [...tagNames])}) = ${tagNames.length}`;

/**
 * 一覧のしぼり込み条件（持ち主 + キーワード + タグ）を組み立てる。
 *
 * 持ち主の条件は常に付ける。検索条件が空なら持ち主だけで絞る（＝全件）。
 */
export const buildRecipeSearchFilter = (
  userId: string,
  criteria: RecipeSearchCriteria,
): SQL | undefined =>
  and(
    eq(recipes.userId, userId),
    criteria.keyword === null
      ? undefined
      : buildKeywordFilter(criteria.keyword),
    criteria.tagNames.length === 0
      ? undefined
      : buildTagFilter(criteria.tagNames),
  );

/**
 * レシピの読み書きを行う永続化層。
 *
 * ユースケース（`~/lib/recipe-service`）はこのインターフェース越しに DB を触る。
 * 認可や差し替えの手順といったロジックはユースケース側に置き、ここは
 * 「言われたとおりに読み書きするだけ」に留めることで、D1 なしでテストできる。
 */
export type RecipeStore = {
  /** レシピ本体。存在しなければ `undefined` */
  findRecipe(recipeId: string): Promise<
    | {
        id: string;
        userId: string;
        title: string;
        memo: string | null;
        url: string | null;
      }
    | undefined
  >;
  /** 材料行（`order` 昇順） */
  findIngredients(
    recipeId: string,
  ): Promise<Array<{ name: string; amount: string | null }>>;
  /** 手順行（`order` 昇順） */
  findSteps(recipeId: string): Promise<Array<{ body: string }>>;
  /** レシピに付いているタグ名 */
  findRecipeTagNames(recipeId: string): Promise<string[]>;
  /** ユーザーが持つタグの一覧（名前昇順） */
  listTags(userId: string): Promise<Array<{ id: string; name: string }>>;
  /**
   * ユーザーのレシピ本体（一覧のカードに出す分だけ）。
   * `criteria` で絞り込む（条件が空なら全件）。
   */
  listRecipes(
    userId: string,
    criteria: RecipeSearchCriteria,
  ): Promise<
    Array<{
      id: string;
      title: string;
      url: string | null;
      updatedAt: Date;
    }>
  >;
  /**
   * ユーザーのレシピに付いているタグ名を、レシピをまたいで一度に引く。
   * 一覧で 1 レシピずつ引くと N+1 になるため、まとめて取ってから割り当てる。
   */
  listTagNamesByRecipe(
    userId: string,
  ): Promise<Array<{ recipeId: string; name: string }>>;
  /**
   * ユーザーのレシピごとの「作った回数」。
   * 0 回のレシピは行自体が返らない（呼び出し側で 0 として扱う）。
   */
  countCookLogsByRecipe(
    userId: string,
  ): Promise<Array<{ recipeId: string; cookCount: number }>>;
  /** ユーザーのレシピごとの先頭写真（`order` が最小のもの）のキー */
  listFirstPhotoKeysByRecipe(
    userId: string,
  ): Promise<Array<{ recipeId: string; storageKey: string }>>;
  /** レシピ本体を作成し、採番した ID を返す */
  insertRecipe(recipe: {
    userId: string;
    title: string;
    memo: string | null;
    url: string | null;
  }): Promise<string>;
  /** レシピ本体を更新する（`updatedAt` も更新する） */
  updateRecipe(
    recipeId: string,
    values: { title: string; memo: string | null; url: string | null },
  ): Promise<void>;
  /** レシピ本体を削除する。配下の行は FK のカスケードで消える */
  deleteRecipe(recipeId: string): Promise<void>;
  /** 材料行を丸ごと差し替える */
  replaceIngredients(
    recipeId: string,
    rows: ReadonlyArray<{ name: string; amount: string | null; order: number }>,
  ): Promise<void>;
  /** 手順行を丸ごと差し替える */
  replaceSteps(
    recipeId: string,
    rows: ReadonlyArray<{ body: string; order: number }>,
  ): Promise<void>;
  /** タグを作成する。同名タグが既にあれば何もしない */
  insertTags(
    rows: ReadonlyArray<{ userId: string; name: string }>,
  ): Promise<void>;
  /** レシピとタグの紐付けを丸ごと差し替える */
  replaceRecipeTags(recipeId: string, tagIds: readonly string[]): Promise<void>;
};

/**
 * D1 上の実装。
 *
 * D1 はインタラクティブなトランザクションを持たないため、差し替えは
 * delete → insert の 2 文を素直に流す（途中で失敗すると行が消えたままになるが、
 * MVP では許容する）。
 */
export const createRecipeStore = (db: Database): RecipeStore => ({
  findRecipe: (recipeId) =>
    db
      .select({
        id: recipes.id,
        userId: recipes.userId,
        title: recipes.title,
        memo: recipes.memo,
        url: recipes.url,
      })
      .from(recipes)
      .where(eq(recipes.id, recipeId))
      .get(),

  findIngredients: (recipeId) =>
    db
      .select({ name: ingredients.name, amount: ingredients.amount })
      .from(ingredients)
      .where(eq(ingredients.recipeId, recipeId))
      .orderBy(asc(ingredients.order))
      .all(),

  findSteps: (recipeId) =>
    db
      .select({ body: steps.body })
      .from(steps)
      .where(eq(steps.recipeId, recipeId))
      .orderBy(asc(steps.order))
      .all(),

  findRecipeTagNames: async (recipeId) => {
    const rows = await db
      .select({ name: tags.name })
      .from(recipeTags)
      .innerJoin(tags, eq(tags.id, recipeTags.tagId))
      .where(eq(recipeTags.recipeId, recipeId))
      .orderBy(asc(tags.name))
      .all();

    return rows.map((row) => row.name);
  },

  listTags: (userId) =>
    db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(eq(tags.userId, userId))
      .orderBy(asc(tags.name))
      .all(),

  listRecipes: (userId, criteria) =>
    db
      .select({
        id: recipes.id,
        title: recipes.title,
        url: recipes.url,
        updatedAt: recipes.updatedAt,
      })
      .from(recipes)
      .where(buildRecipeSearchFilter(userId, criteria))
      // `recipes_user_id_updated_at_idx` に乗る並び。最終的な並びはユースケース側で決める
      .orderBy(desc(recipes.updatedAt))
      .all(),

  listTagNamesByRecipe: (userId) =>
    db
      .select({ recipeId: recipeTags.recipeId, name: tags.name })
      .from(recipeTags)
      .innerJoin(tags, eq(tags.id, recipeTags.tagId))
      .innerJoin(recipes, eq(recipes.id, recipeTags.recipeId))
      .where(eq(recipes.userId, userId))
      .orderBy(asc(tags.name))
      .all(),

  countCookLogsByRecipe: (userId) =>
    db
      .select({ recipeId: cookLogs.recipeId, cookCount: count() })
      .from(cookLogs)
      .innerJoin(recipes, eq(recipes.id, cookLogs.recipeId))
      .where(eq(recipes.userId, userId))
      .groupBy(cookLogs.recipeId)
      .all(),

  listFirstPhotoKeysByRecipe: async (userId) => {
    // SQLite では min() を使った集約に限り、同じ行の他カラム（storage_key）を
    // そのまま取り出せる。つまり「order が最小の行の storageKey」が 1 クエリで得られる
    const rows = await db
      .select({
        recipeId: photos.recipeId,
        storageKey: photos.storageKey,
        order: min(photos.order),
      })
      .from(photos)
      .innerJoin(recipes, eq(recipes.id, photos.recipeId))
      .where(eq(recipes.userId, userId))
      .groupBy(photos.recipeId)
      .all();

    return rows.map(({ recipeId, storageKey }) => ({ recipeId, storageKey }));
  },

  insertRecipe: async (recipe) => {
    const inserted = await db
      .insert(recipes)
      .values(recipe)
      .returning({ id: recipes.id })
      .get();

    return inserted.id;
  },

  updateRecipe: async (recipeId, values) => {
    await db
      .update(recipes)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(recipes.id, recipeId));
  },

  deleteRecipe: async (recipeId) => {
    // 材料・手順・写真・タグ紐付け・作った記録は
    // `ON DELETE CASCADE` に任せる（schema.ts の各テーブル定義を参照）
    await db.delete(recipes).where(eq(recipes.id, recipeId));
  },

  replaceIngredients: async (recipeId, rows) => {
    await db.delete(ingredients).where(eq(ingredients.recipeId, recipeId));

    if (rows.length > 0) {
      await db
        .insert(ingredients)
        .values(rows.map((row) => ({ ...row, recipeId })));
    }
  },

  replaceSteps: async (recipeId, rows) => {
    await db.delete(steps).where(eq(steps.recipeId, recipeId));

    if (rows.length > 0) {
      await db.insert(steps).values(rows.map((row) => ({ ...row, recipeId })));
    }
  },

  insertTags: async (rows) => {
    if (rows.length === 0) {
      return;
    }

    // 同じ名前のタグを同時に作ろうとした場合はユニーク制約に任せて捨てる
    await db
      .insert(tags)
      .values([...rows])
      .onConflictDoNothing();
  },

  replaceRecipeTags: async (recipeId, tagIds) => {
    await db.delete(recipeTags).where(eq(recipeTags.recipeId, recipeId));

    if (tagIds.length > 0) {
      await db
        .insert(recipeTags)
        .values(tagIds.map((tagId) => ({ recipeId, tagId })));
    }
  },
});
