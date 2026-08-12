import { notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import * as z from 'zod';

import { getDatabase } from '~/db/client';
import { getImageStore } from '~/db/image-store';
import { createRecipeStore } from '~/db/recipe-store';
import { createShoppingItemStore } from '~/db/shopping-item-store';

import { requireUser } from './auth.server';
import { ImageAccessDeniedError } from './image-service';
import { normalizedRecipeInputSchema } from './recipe-input';
import { recipeSearchCriteriaSchema } from './recipe-search';
import {
  RecipeNotFoundError,
  addIngredientsToShoppingList,
  addRecipe,
  editRecipe,
  getRecipeDetail,
  getRecipeForEdit,
  listRecipeSummaries,
  removeRecipe,
} from './recipe-service';

/**
 * レシピの作成・更新・取得・削除の Server Function。
 *
 * 認可はすべてここで完結させる（`requireUser()` のユーザー ID を必ず使い、
 * クライアントから来た userId は一切信用しない）。
 * このファイルはクライアントのバンドルにも入るため、ハンドラの外で
 * サーバー専用モジュールを参照しないこと。
 */

/**
 * 見つからない / 他人のレシピは、存在を伏せて 404 として返す。
 *
 * 他人の画像キーを添えて保存しようとした場合（改ざんされたリクエスト）も、
 * 同じく「無い」として扱う。
 */
const toNotFound = (error: unknown): never => {
  if (
    error instanceof RecipeNotFoundError ||
    error instanceof ImageAccessDeniedError
  ) {
    throw notFound();
  }

  throw error;
};

const recipeIdSchema = z.object({ recipeId: z.string().min(1) });

const updateRecipeInputSchema = z.object({
  recipeId: z.string().min(1),
  recipe: normalizedRecipeInputSchema,
});

/** 買い物リストへ送る材料の指定（詳細画面に並んでいる順の添字） */
const addIngredientsInputSchema = z.object({
  recipeId: z.string().min(1),
  ingredientIndexes: z.array(z.int().nonnegative()).min(1),
});

/** 一覧（ホーム）に出す自分のレシピを、絞り込み条件付きで取得する */
export const fetchRecipeSummaries = createServerFn({ method: 'GET' })
  .inputValidator(recipeSearchCriteriaSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();

    return listRecipeSummaries(createRecipeStore(getDatabase()), user.id, data);
  });

/** レシピを新規作成する */
export const createRecipe = createServerFn({ method: 'POST' })
  .inputValidator(normalizedRecipeInputSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const recipeId = await addRecipe(
      createRecipeStore(getDatabase()),
      user.id,
      data,
    ).catch(toNotFound);

    return { recipeId };
  });

/** 既存レシピを更新する */
export const updateRecipe = createServerFn({ method: 'POST' })
  .inputValidator(updateRecipeInputSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();

    await editRecipe(
      createRecipeStore(getDatabase()),
      getImageStore(),
      user.id,
      data.recipeId,
      data.recipe,
    ).catch(toNotFound);

    return { recipeId: data.recipeId };
  });

/** レシピを削除する */
export const deleteRecipe = createServerFn({ method: 'POST' })
  .inputValidator(recipeIdSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();

    await removeRecipe(
      createRecipeStore(getDatabase()),
      getImageStore(),
      user.id,
      data.recipeId,
    ).catch(toNotFound);
  });

/**
 * 選んだ材料を買い物リストへ送る。
 *
 * 追加するラベルはサーバー側で材料行から組み立てるので、
 * クライアントからは「どの行か」だけを受け取る。
 */
export const sendIngredientsToShoppingList = createServerFn({ method: 'POST' })
  .inputValidator(addIngredientsInputSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const db = getDatabase();

    const addedCount = await addIngredientsToShoppingList(
      createRecipeStore(db),
      createShoppingItemStore(db),
      user.id,
      data.recipeId,
      data.ingredientIndexes,
    ).catch(toNotFound);

    return { addedCount };
  });

/** 詳細表示用に 1 件のレシピを取得する */
export const fetchRecipeDetail = createServerFn({ method: 'GET' })
  .inputValidator(recipeIdSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();

    return getRecipeDetail(
      createRecipeStore(getDatabase()),
      user.id,
      data.recipeId,
    ).catch(toNotFound);
  });

/** 編集フォームの初期値を取得する */
export const fetchRecipeForEdit = createServerFn({ method: 'GET' })
  .inputValidator(recipeIdSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();

    return getRecipeForEdit(
      createRecipeStore(getDatabase()),
      user.id,
      data.recipeId,
    ).catch(toNotFound);
  });

/** タグ入力の候補（ユーザーが持つ既存タグの名前） */
export const fetchTagNames = createServerFn({ method: 'GET' }).handler(
  async () => {
    const user = await requireUser();
    const tags = await createRecipeStore(getDatabase()).listTags(user.id);

    return tags.map((tag) => tag.name);
  },
);
