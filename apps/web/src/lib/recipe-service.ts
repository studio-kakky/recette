import type { RecipeStore } from '~/db/recipe-store';

import type { NormalizedRecipe } from './recipe-input';

/**
 * レシピの作成・更新・編集用取得のユースケース。
 *
 * DB は `RecipeStore` 越しにしか触らないので、偽の store を渡せば認可も
 * 行の並びもユニットテストで確かめられる（D1 が要らない）。
 */

/**
 * 対象のレシピが見つからない、または他ユーザーのものだったときのエラー。
 *
 * 「他人のレシピが存在すること」を知られないよう、両方を同じエラーで扱う。
 */
export class RecipeNotFoundError extends Error {
  constructor() {
    super('レシピが見つかりません');
    this.name = 'RecipeNotFoundError';
  }
}

/** 編集フォームに流し込む値 */
export type RecipeFormValues = {
  readonly title: string;
  readonly memo: string;
  readonly url: string;
  readonly ingredients: ReadonlyArray<{
    readonly name: string;
    readonly amount: string;
  }>;
  readonly steps: ReadonlyArray<{ readonly body: string }>;
  readonly tagNames: readonly string[];
};

/**
 * レシピ名から ID を引く。無いタグはこの場で作る。
 *
 * `tags` はユーザー内で name ユニークなので、同名タグの同時作成は
 * 衝突を無視して（`insertTags`）から ID を読み直すことで吸収する。
 */
const resolveTagIds = async (
  store: RecipeStore,
  userId: string,
  names: readonly string[],
): Promise<string[]> => {
  if (names.length === 0) {
    return [];
  }

  const pickIds = (tags: ReadonlyArray<{ id: string; name: string }>) => {
    const idByName = new Map(tags.map((tag) => [tag.name, tag.id]));

    return names
      .map((name) => idByName.get(name))
      .filter((id) => id !== undefined);
  };

  const existing = await store.listTags(userId);
  const missing = names.filter(
    (name) => !existing.some((tag) => tag.name === name),
  );

  if (missing.length === 0) {
    return pickIds(existing);
  }

  await store.insertTags(missing.map((name) => ({ userId, name })));

  return pickIds(await store.listTags(userId));
};

/**
 * レシピの操作者が持ち主であることを確かめる。
 * 見つからない / 他人のものなら `RecipeNotFoundError` を投げる。
 */
const requireOwnedRecipe = async (
  store: RecipeStore,
  userId: string,
  recipeId: string,
) => {
  const recipe = await store.findRecipe(recipeId);

  if (!recipe || recipe.userId !== userId) {
    throw new RecipeNotFoundError();
  }

  return recipe;
};

/** レシピを新規作成し、作成された ID を返す */
export const addRecipe = async (
  store: RecipeStore,
  userId: string,
  recipe: NormalizedRecipe,
): Promise<string> => {
  const recipeId = await store.insertRecipe({
    userId,
    title: recipe.title,
    memo: recipe.memo,
    url: recipe.url,
  });

  await store.replaceIngredients(recipeId, recipe.ingredients);
  await store.replaceSteps(recipeId, recipe.steps);
  await store.replaceRecipeTags(
    recipeId,
    await resolveTagIds(store, userId, recipe.tagNames),
  );

  return recipeId;
};

/**
 * 既存レシピを更新する。
 *
 * 材料・手順・タグ紐付けは delete → insert で丸ごと差し替える
 * （D1 にインタラクティブなトランザクションが無いため、差分更新はしない）。
 */
export const editRecipe = async (
  store: RecipeStore,
  userId: string,
  recipeId: string,
  recipe: NormalizedRecipe,
): Promise<void> => {
  await requireOwnedRecipe(store, userId, recipeId);

  await store.updateRecipe(recipeId, {
    title: recipe.title,
    memo: recipe.memo,
    url: recipe.url,
  });
  await store.replaceIngredients(recipeId, recipe.ingredients);
  await store.replaceSteps(recipeId, recipe.steps);
  await store.replaceRecipeTags(
    recipeId,
    await resolveTagIds(store, userId, recipe.tagNames),
  );
};

/** 編集フォームの初期値を取り出す */
export const getRecipeForEdit = async (
  store: RecipeStore,
  userId: string,
  recipeId: string,
): Promise<RecipeFormValues> => {
  const recipe = await requireOwnedRecipe(store, userId, recipeId);

  const [ingredients, steps, tagNames] = await Promise.all([
    store.findIngredients(recipeId),
    store.findSteps(recipeId),
    store.findRecipeTagNames(recipeId),
  ]);

  return {
    title: recipe.title,
    memo: recipe.memo ?? '',
    url: recipe.url ?? '',
    ingredients: ingredients.map((row) => ({
      name: row.name,
      amount: row.amount ?? '',
    })),
    steps,
    tagNames,
  };
};
