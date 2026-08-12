import { createServerFn } from '@tanstack/react-start';
import * as z from 'zod';

import { getDatabase } from '~/db/client';
import { createCookLogStore } from '~/db/cook-log-store';
import { getImageStore } from '~/db/image-store';
import { createRecipeStore } from '~/db/recipe-store';

import { requireUser } from './auth.server';
import { normalizedCookLogInputSchema } from './cook-log-input';
import {
  addCookLog,
  editCookLog,
  listCookLogEntries,
  removeCookLog,
} from './cook-log-service';
import { toNotFound } from './not-found';

/**
 * 作った記録の Server Function（docs: requirements/functional.md §3）。
 *
 * 認可はすべてここで完結させる（`requireUser()` のユーザー ID を必ず使い、
 * クライアントから来た userId は一切信用しない）。
 * このファイルはクライアントのバンドルにも入るため、ハンドラの外で
 * サーバー専用モジュールを参照しないこと。
 */

const recipeIdSchema = z.object({ recipeId: z.string().min(1) });

const createCookLogInputSchema = z.object({
  recipeId: z.string().min(1),
  cookLog: normalizedCookLogInputSchema,
});

const updateCookLogInputSchema = z.object({
  cookLogId: z.string().min(1),
  cookLog: normalizedCookLogInputSchema,
});

const cookLogIdSchema = z.object({ cookLogId: z.string().min(1) });

/** レシピ 1 件分の作った記録を新しい順に取得する */
export const fetchCookLogs = createServerFn({ method: 'GET' })
  .inputValidator(recipeIdSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const db = getDatabase();

    return listCookLogEntries(
      createRecipeStore(db),
      createCookLogStore(db),
      user.id,
      data.recipeId,
    ).catch(toNotFound);
  });

/** 作った記録を追加する */
export const createCookLog = createServerFn({ method: 'POST' })
  .inputValidator(createCookLogInputSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const db = getDatabase();

    const cookLogId = await addCookLog(
      createRecipeStore(db),
      createCookLogStore(db),
      user.id,
      data.recipeId,
      data.cookLog,
    ).catch(toNotFound);

    return { cookLogId };
  });

/** 作った記録を更新する（写真の差し替えを含む） */
export const updateCookLog = createServerFn({ method: 'POST' })
  .inputValidator(updateCookLogInputSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const db = getDatabase();

    await editCookLog(
      createRecipeStore(db),
      createCookLogStore(db),
      getImageStore(),
      user.id,
      data.cookLogId,
      data.cookLog,
    ).catch(toNotFound);
  });

/** 作った記録を削除する */
export const deleteCookLog = createServerFn({ method: 'POST' })
  .inputValidator(cookLogIdSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const db = getDatabase();

    await removeCookLog(
      createRecipeStore(db),
      createCookLogStore(db),
      getImageStore(),
      user.id,
      data.cookLogId,
    ).catch(toNotFound);
  });
