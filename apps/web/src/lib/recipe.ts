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
  getRecipeForEdit,
} from './recipe-service';

/**
 * レシピの作成・更新・編集用取得の Server Function。
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
