import * as z from 'zod';

/**
 * レシピ一覧の絞り込み条件（docs: requirements/functional.md §4）。
 *
 * 条件は URL のクエリに載せる（`?q=` と `?tags=`）。リロードしても戻ってきても
 * 同じ結果が出せるようにするためで、画面側は URL を唯一の状態として扱う。
 * ここは URL ↔ 条件の変換だけを持つ純関数の集まりにして、DB も React も要らない形で試せるようにする。
 */

/** キーワードのクエリパラメータ名 */
export const KEYWORD_SEARCH_PARAM = 'q';

/** タグのクエリパラメータ名 */
export const TAG_SEARCH_PARAM = 'tags';

/** 条件の上限。URL は誰でも書き換えられるので、受け取る側で頭打ちにする */
const LIMIT = {
  keyword: 100,
  tagName: 50,
  tags: 30,
} as const;

/**
 * URL のクエリ。
 *
 * 手で書き換えられた値（数値・オブジェクトなど）で画面を落とさないよう、
 * 型が合わなければ `undefined`（＝未指定）に倒す。
 */
export const recipeSearchSchema = z.object({
  [KEYWORD_SEARCH_PARAM]: z.string().optional().catch(undefined),
  [TAG_SEARCH_PARAM]: z.array(z.string()).optional().catch(undefined),
});

export type RecipeSearch = z.infer<typeof recipeSearchSchema>;

/** 絞り込み条件。Server Function の入力でもあるため、そのまま検証できる形にしておく */
export const recipeSearchCriteriaSchema = z.object({
  /** キーワード。未入力は `null`（空文字と区別せず「条件なし」に倒す） */
  keyword: z.string().min(1).max(LIMIT.keyword).nullable(),
  /** 選択中のタグ名。複数選択は AND（すべて持つレシピだけを残す） */
  tagNames: z.array(z.string().min(1).max(LIMIT.tagName)).max(LIMIT.tags),
});

export type RecipeSearchCriteria = z.infer<typeof recipeSearchCriteriaSchema>;

/** 何も絞り込まない条件（＝全件） */
export const EMPTY_RECIPE_SEARCH_CRITERIA: RecipeSearchCriteria = {
  keyword: null,
  tagNames: [],
};

/** 入力欄の値を条件用のキーワードに揃える（前後の空白と長すぎる入力を落とす） */
const normalizeKeyword = (value: string | undefined): string | null => {
  const keyword = (value ?? '').trim().slice(0, LIMIT.keyword);

  return keyword === '' ? null : keyword;
};

/** タグ名の並びを整える（空白落とし・空要素除去・重複排除・上限） */
const normalizeTagNames = (values: readonly string[] | undefined): string[] =>
  [
    ...new Set(
      (values ?? [])
        .map((value) => value.trim())
        .filter((value) => value !== '' && value.length <= LIMIT.tagName),
    ),
  ].slice(0, LIMIT.tags);

/**
 * URL のクエリを絞り込み条件に変換する。
 *
 * @example
 * normalizeRecipeSearch({ q: '  カレー ', tags: ['和食', '和食', ''] });
 * // → { keyword: 'カレー', tagNames: ['和食'] }
 */
export const normalizeRecipeSearch = (
  search: RecipeSearch,
): RecipeSearchCriteria => ({
  keyword: normalizeKeyword(search[KEYWORD_SEARCH_PARAM]),
  tagNames: normalizeTagNames(search[TAG_SEARCH_PARAM]),
});

/** 何かしら絞り込んでいるか（空状態の出し分けに使う） */
export const isRecipeSearchActive = (criteria: RecipeSearchCriteria): boolean =>
  criteria.keyword !== null || criteria.tagNames.length > 0;

/**
 * 絞り込み条件を URL のクエリに戻す。
 * 条件なしの項目は `undefined` にして、URL からパラメータごと消す。
 */
export const toRecipeSearchParams = (
  criteria: RecipeSearchCriteria,
): RecipeSearch => ({
  [KEYWORD_SEARCH_PARAM]: criteria.keyword ?? undefined,
  [TAG_SEARCH_PARAM]:
    criteria.tagNames.length > 0 ? [...criteria.tagNames] : undefined,
});

/** 条件をすべて外したクエリ（「条件をクリア」の遷移先） */
export const CLEARED_RECIPE_SEARCH: RecipeSearch = toRecipeSearchParams(
  EMPTY_RECIPE_SEARCH_CRITERIA,
);

/** いまのクエリのキーワードだけを差し替えたクエリを返す */
export const withKeyword = (
  search: RecipeSearch,
  keyword: string,
): RecipeSearch =>
  toRecipeSearchParams({
    ...normalizeRecipeSearch(search),
    keyword: normalizeKeyword(keyword),
  });

/** いまのクエリのタグを 1 つ付け外ししたクエリを返す */
export const withToggledTagName = (
  search: RecipeSearch,
  name: string,
): RecipeSearch => {
  const criteria = normalizeRecipeSearch(search);
  const tagName = name.trim();
  const isSelected = criteria.tagNames.includes(tagName);

  return toRecipeSearchParams({
    ...criteria,
    tagNames: normalizeTagNames(
      isSelected
        ? criteria.tagNames.filter((selected) => selected !== tagName)
        : // 選択順をそのまま残す（チップの並びは選択と無関係に名前順で描く）
          [...criteria.tagNames, tagName],
    ),
  });
};
