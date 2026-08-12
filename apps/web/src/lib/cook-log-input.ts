import * as z from 'zod';

import { isDateString } from './date';

/**
 * 作った記録の入力値のバリデーションと正規化（docs: requirements/functional.md §3）。
 *
 * 写真を残すことが目的の機能なので、写真は 1 枚以上が必須。作った日も必須で、
 * メモだけが任意。フォーム側とサーバー側で同じスキーマを使い、判定がずれないようにする。
 */

/** 入力欄の上限。DB 側に制約はないが、極端に長い入力は受け付けない */
const LIMIT = {
  memo: 1000,
  /** 写真のストレージキー（`users/<userId>/<uuid>`） */
  storageKey: 200,
} as const;

/** 1 件の記録に添付できる写真の枚数。無料枠での運用なので控えめにする */
export const COOK_LOG_PHOTO_LIMIT = 10;

export const cookLogInputSchema = z.object({
  /**
   * 作った日（`YYYY-MM-DD`）。
   *
   * デフォルトの「今日」はブラウザ側で入れる。サーバーはタイムゾーンを持たないため、
   * ここでは実在する日付かどうかだけを見る（未来日は弾かない）。
   */
  cookedAt: z.string().trim().refine(isDateString, '作った日を選んでください'),
  memo: z
    .string()
    .trim()
    .max(LIMIT.memo, `メモは ${LIMIT.memo} 文字以内で入力してください`),
  // 実体は R2 にあり、ここで持つのはキーだけ。所有者の検証はユースケース側で行う
  photos: z
    .array(
      z.object({
        storageKey: z.string().trim().min(1).max(LIMIT.storageKey),
      }),
    )
    .min(1, '写真を 1 枚以上選んでください')
    .max(
      COOK_LOG_PHOTO_LIMIT,
      `写真は ${COOK_LOG_PHOTO_LIMIT} 枚まで添付できます`,
    ),
});

/** フォームから受け取る生の入力値（トリム済み） */
export type CookLogInput = z.infer<typeof cookLogInputSchema>;

/** DB へそのまま書ける形に整えた作った記録 */
export type NormalizedCookLog = {
  readonly cookedAt: string;
  readonly memo: string | null;
  readonly photos: ReadonlyArray<{
    readonly storageKey: string;
    readonly order: number;
  }>;
};

/**
 * 入力値を DB に書ける形へ整える。
 *
 * - メモは空文字なら未入力（NULL）に倒す
 * - 写真は同じキーの重複を落とす（同じ実体を 2 行持たせない）。
 *   キーは空文字を弾いてあるので、重ねを落としても 1 枚は必ず残る
 */
export const normalizeCookLogInput = (
  input: CookLogInput,
): NormalizedCookLog => ({
  cookedAt: input.cookedAt,
  memo: input.memo === '' ? null : input.memo,
  photos: [...new Set(input.photos.map((row) => row.storageKey))].map(
    (storageKey, index) => ({ storageKey, order: index }),
  ),
});

/** Server Function の入力バリデータ。正規化までを一息に行う */
export const normalizedCookLogInputSchema = cookLogInputSchema.transform(
  normalizeCookLogInput,
);
