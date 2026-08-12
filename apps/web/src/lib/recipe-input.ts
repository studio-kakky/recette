import * as z from 'zod';

/**
 * レシピ入力値のバリデーションと正規化（docs: requirements/functional.md §2）。
 *
 * 必須はタイトルのみ。「URL だけ」「タイトルだけ」のような部分入力でも保存できる。
 * フォーム側とサーバー側で同じスキーマを使い、判定がずれないようにする。
 */

/** 入力欄の上限。DB 側に制約はないが、極端に長い入力は受け付けない */
const LIMIT = {
  title: 200,
  memo: 4000,
  url: 2000,
  ingredientName: 100,
  ingredientAmount: 100,
  stepBody: 2000,
  tagName: 50,
  /** 材料・手順の行数 */
  rows: 200,
  tags: 30,
  /** 写真のストレージキー（`users/<userId>/<uuid>`） */
  storageKey: 200,
} as const;

/** 1 レシピに添付できる写真の枚数。無料枠での運用なので控えめにする */
export const RECIPE_PHOTO_LIMIT = 20;

/** http(s) の URL だけを通す。OGP 取得はしないので到達性までは見ない */
const isHttpUrl = (value: string): boolean => /^https?:\/\/\S+$/.test(value);

/** 空文字は「未入力」として DB では NULL にする */
const emptyToNull = (value: string): string | null =>
  value === '' ? null : value;

export const recipeInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'タイトルを入力してください')
    .max(LIMIT.title, `タイトルは ${LIMIT.title} 文字以内で入力してください`),
  memo: z
    .string()
    .trim()
    .max(LIMIT.memo, `メモは ${LIMIT.memo} 文字以内で入力してください`),
  url: z
    .string()
    .trim()
    .max(LIMIT.url, `URL は ${LIMIT.url} 文字以内で入力してください`)
    .refine(
      (value) => value === '' || isHttpUrl(value),
      'http:// または https:// で始まる URL を入力してください',
    ),
  ingredients: z
    .array(
      z.object({
        name: z.string().trim().max(LIMIT.ingredientName),
        amount: z.string().trim().max(LIMIT.ingredientAmount),
      }),
    )
    .max(LIMIT.rows),
  steps: z
    .array(z.object({ body: z.string().trim().max(LIMIT.stepBody) }))
    .max(LIMIT.rows),
  tagNames: z.array(z.string().trim().max(LIMIT.tagName)).max(LIMIT.tags),
  // 実体は R2 にあり、ここで持つのはキーだけ。所有者の検証はユースケース側で行う
  photos: z
    .array(z.object({ storageKey: z.string().trim().max(LIMIT.storageKey) }))
    .max(RECIPE_PHOTO_LIMIT),
});

/** フォームから受け取る生の入力値（トリム済み） */
export type RecipeInput = z.infer<typeof recipeInputSchema>;

/** DB へそのまま書ける形に整えたレシピ */
export type NormalizedRecipe = {
  readonly title: string;
  readonly memo: string | null;
  readonly url: string | null;
  readonly ingredients: ReadonlyArray<{
    readonly name: string;
    readonly amount: string | null;
    readonly order: number;
  }>;
  readonly steps: ReadonlyArray<{
    readonly body: string;
    readonly order: number;
  }>;
  readonly tagNames: readonly string[];
  readonly photos: ReadonlyArray<{
    readonly storageKey: string;
    readonly order: number;
  }>;
};

/**
 * 入力値を DB に書ける形へ整える。
 *
 * - 材料は名前が、手順は本文が空の行を落とす（フォームは常に空行を 1 行余らせるため）
 * - `order` は空行を詰めたあとの並び順。表示順はこの値の昇順で復元する
 * - タグ名は空を落として重複を除く（`tags` はユーザー内で name ユニーク）
 * - 写真は同じキーの重複を落とす（同じ実体を 2 行持たせない）
 */
export const normalizeRecipeInput = (input: RecipeInput): NormalizedRecipe => ({
  title: input.title,
  memo: emptyToNull(input.memo),
  url: emptyToNull(input.url),
  ingredients: input.ingredients
    .filter((row) => row.name !== '')
    .map((row, index) => ({
      name: row.name,
      amount: emptyToNull(row.amount),
      order: index,
    })),
  steps: input.steps
    .filter((row) => row.body !== '')
    .map((row, index) => ({ body: row.body, order: index })),
  tagNames: [...new Set(input.tagNames.filter((name) => name !== ''))],
  photos: [
    ...new Set(
      input.photos.map((row) => row.storageKey).filter((key) => key !== ''),
    ),
  ].map((storageKey, index) => ({ storageKey, order: index })),
});

/** Server Function の入力バリデータ。正規化までを一息に行う */
export const normalizedRecipeInputSchema =
  recipeInputSchema.transform(normalizeRecipeInput);
