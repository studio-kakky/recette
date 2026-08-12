import { notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import * as z from 'zod';

import { getDatabase } from '~/db/client';
import { createRecipeStore } from '~/db/recipe-store';

import { requireUser } from './auth.server';
import { normalizedRecipeInputSchema } from './recipe-input';
import {
  RecipeNotFoundError,
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

/** 見つからない / 他人のレシピは、存在を伏せて 404 として返す */
const toNotFound = (error: unknown): never => {
  if (error instanceof RecipeNotFoundError) {
    throw notFound();
  }

  throw error;
};

const recipeIdSchema = z.object({ recipeId: z.string().min(1) });

const updateRecipeInputSchema = z.object({
  recipeId: z.string().min(1),
  recipe: normalizedRecipeInputSchema,
});

/** 一覧（ホーム）に出す自分のレシピを取得する */
export const fetchRecipeSummaries = createServerFn({ method: 'GET' }).handler(
  async () => {
    const user = await requireUser();

    return listRecipeSummaries(createRecipeStore(getDatabase()), user.id);
  },
);

/** レシピを新規作成する */
export const createRecipe = createServerFn({ method: 'POST' })
  .inputValidator(normalizedRecipeInputSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const recipeId = await addRecipe(
      createRecipeStore(getDatabase()),
      user.id,
      data,
    );

    return { recipeId };
  });

/** 既存レシピを更新する */
export const updateRecipe = createServerFn({ method: 'POST' })
  .inputValidator(updateRecipeInputSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();

    await editRecipe(
      createRecipeStore(getDatabase()),
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
      user.id,
      data.recipeId,
    ).catch(toNotFound);
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
