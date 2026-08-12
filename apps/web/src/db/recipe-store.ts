import { asc, eq } from 'drizzle-orm';

import type { Database } from './client';
import { ingredients, recipeTags, recipes, steps, tags } from './schema';

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
