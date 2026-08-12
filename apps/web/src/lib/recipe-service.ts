import type { ImageStore } from '~/db/image-store';
import type { RecipeStore } from '~/db/recipe-store';
import type { ShoppingItemStore } from '~/db/shopping-item-store';

import { requireOwnedImageKeys } from './image-service';
import { formatIngredientRowLabel } from './ingredient';
import type { NormalizedRecipe } from './recipe-input';
import type { RecipeSearchCriteria } from './recipe-search';
import { truncateShoppingItemLabel } from './shopping-item';

/**
 * レシピの作成・更新・取得・削除のユースケース。
 *
 * DB は `RecipeStore` 越しに、画像の実体は `ImageStore` 越しにしか触らないので、
 * 偽の store を渡せば認可も行の並びもユニットテストで確かめられる
 * （D1 も R2 も要らない）。
 *
 * 写真の行は FK のカスケードで消えるが、R2 のオブジェクトは消えないため、
 * レシピを消すとき・写真を外したときにここから明示的に削除する。
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

/** 一覧のカード 1 枚に出す値 */
export type RecipeSummary = {
  readonly id: string;
  readonly title: string;
  /** タグ名（名前昇順） */
  readonly tagNames: readonly string[];
  /** 作った回数。一度も作っていなければ 0 */
  readonly cookCount: number;
  /** 参照元 URL を持つレシピか */
  readonly hasUrl: boolean;
  /** 先頭写真のキー。カードのサムネイルに使う。写真が無ければ `null` */
  readonly photoStorageKey: string | null;
};

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
  readonly photos: ReadonlyArray<{ readonly storageKey: string }>;
};

/**
 * 詳細画面に出す 1 件分のレシピ。
 *
 * 未入力は空文字に丸めず `null` / 空配列のまま返し、表示するかどうかは
 * 画面側に委ねる（フォームと違い「未入力なら出さない」を選べるようにする）。
 */
export type RecipeDetail = {
  readonly title: string;
  readonly memo: string | null;
  readonly url: string | null;
  readonly ingredients: ReadonlyArray<{
    readonly name: string;
    readonly amount: string | null;
  }>;
  readonly steps: ReadonlyArray<{ readonly body: string }>;
  readonly tagNames: readonly string[];
  readonly photos: ReadonlyArray<{ readonly storageKey: string }>;
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

/**
 * 一覧（ホーム）に出す自分のレシピを、更新の新しい順に返す。
 *
 * `criteria` で絞り込む（条件が空なら全件）。絞り込みは store 側の SQL に任せ、
 * ここでは並びとカードに出す値の組み立てだけを行う。
 *
 * タグ・作った回数・写真はレシピ 1 件ずつ引くと N+1 になるため、
 * ユーザー単位でまとめて取ってから ID で突き合わせる（クエリ数はレシピ数に依らず一定）。
 * 絞り込みで消えたレシピの分は突き合わせで捨てられるので、条件を渡す必要はない。
 */
export const listRecipeSummaries = async (
  store: RecipeStore,
  userId: string,
  criteria: RecipeSearchCriteria,
): Promise<RecipeSummary[]> => {
  const [recipes, tagRows, cookCountRows, photoRows] = await Promise.all([
    store.listRecipes(userId, criteria),
    store.listTagNamesByRecipe(userId),
    store.countCookLogsByRecipe(userId),
    store.listFirstPhotoKeysByRecipe(userId),
  ]);

  const tagNamesByRecipe = tagRows.reduce(
    (acc, row) =>
      acc.set(row.recipeId, [...(acc.get(row.recipeId) ?? []), row.name]),
    new Map<string, string[]>(),
  );
  const cookCountByRecipe = new Map(
    cookCountRows.map((row) => [row.recipeId, row.cookCount]),
  );
  const photoKeyByRecipe = new Map(
    photoRows.map((row) => [row.recipeId, row.storageKey]),
  );

  return (
    [...recipes]
      // 「最近さわったものが上」。store も同じ順で返すが、並び順は一覧の仕様なのでここで確定させる
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((recipe) => ({
        id: recipe.id,
        title: recipe.title,
        tagNames: tagNamesByRecipe.get(recipe.id) ?? [],
        // 作った記録が 1 件も無いレシピは集計行が返らないので 0 に倒す
        cookCount: cookCountByRecipe.get(recipe.id) ?? 0,
        hasUrl: recipe.url !== null,
        photoStorageKey: photoKeyByRecipe.get(recipe.id) ?? null,
      }))
  );
};

/** レシピを新規作成し、作成された ID を返す */
export const addRecipe = async (
  store: RecipeStore,
  userId: string,
  recipe: NormalizedRecipe,
): Promise<string> => {
  // 他人の画像キーを自分のレシピに繋がせない（削除時に他人の実体を消してしまうため）
  requireOwnedImageKeys(
    userId,
    recipe.photos.map((photo) => photo.storageKey),
  );

  const recipeId = await store.insertRecipe({
    userId,
    title: recipe.title,
    memo: recipe.memo,
    url: recipe.url,
  });

  await store.replaceIngredients(recipeId, recipe.ingredients);
  await store.replaceSteps(recipeId, recipe.steps);
  await store.replacePhotos(recipeId, recipe.photos);
  await store.replaceRecipeTags(
    recipeId,
    await resolveTagIds(store, userId, recipe.tagNames),
  );

  return recipeId;
};

/**
 * 既存レシピを更新する。
 *
 * 材料・手順・写真・タグ紐付けは delete → insert で丸ごと差し替える
 * （D1 にインタラクティブなトランザクションが無いため、差分更新はしない）。
 * 外された写真は R2 の実体も消す。
 */
export const editRecipe = async (
  store: RecipeStore,
  images: ImageStore,
  userId: string,
  recipeId: string,
  recipe: NormalizedRecipe,
): Promise<void> => {
  await requireOwnedRecipe(store, userId, recipeId);
  requireOwnedImageKeys(
    userId,
    recipe.photos.map((photo) => photo.storageKey),
  );

  const previousPhotos = await store.findPhotos(recipeId);

  await store.updateRecipe(recipeId, {
    title: recipe.title,
    memo: recipe.memo,
    url: recipe.url,
  });
  await store.replaceIngredients(recipeId, recipe.ingredients);
  await store.replaceSteps(recipeId, recipe.steps);
  await store.replacePhotos(recipeId, recipe.photos);
  await store.replaceRecipeTags(
    recipeId,
    await resolveTagIds(store, userId, recipe.tagNames),
  );

  // DB から外れた写真は、そのままだと R2 に残り続けるので消す
  const keptKeys = new Set(recipe.photos.map((photo) => photo.storageKey));

  await images.deleteMany(
    previousPhotos
      .map((photo) => photo.storageKey)
      .filter((key) => !keptKeys.has(key)),
  );
};

/** 詳細表示用に 1 件のレシピを材料・手順・タグごと取り出す */
export const getRecipeDetail = async (
  store: RecipeStore,
  userId: string,
  recipeId: string,
): Promise<RecipeDetail> => {
  const recipe = await requireOwnedRecipe(store, userId, recipeId);

  const [ingredients, steps, tagNames, photos] = await Promise.all([
    store.findIngredients(recipeId),
    store.findSteps(recipeId),
    store.findRecipeTagNames(recipeId),
    store.findPhotos(recipeId),
  ]);

  return {
    title: recipe.title,
    memo: recipe.memo,
    url: recipe.url,
    ingredients,
    steps,
    tagNames,
    photos,
  };
};

/** 編集フォームの初期値を取り出す */
export const getRecipeForEdit = async (
  store: RecipeStore,
  userId: string,
  recipeId: string,
): Promise<RecipeFormValues> => {
  const recipe = await getRecipeDetail(store, userId, recipeId);

  // フォームの入力欄は空文字を扱うため、未入力（NULL）はここで空文字に戻す
  return {
    title: recipe.title,
    memo: recipe.memo ?? '',
    url: recipe.url ?? '',
    ingredients: recipe.ingredients.map((row) => ({
      name: row.name,
      amount: row.amount ?? '',
    })),
    steps: recipe.steps,
    tagNames: recipe.tagNames,
    photos: recipe.photos,
  };
};

/**
 * 選んだ材料を買い物リストへ追加し、追加できた件数を返す（docs: requirements/functional.md §5）。
 *
 * 材料は「詳細画面に並んでいる順（`order` 昇順）の何番目か」で指定する。
 * ラベルはクライアントから受け取らず、ここで DB の行から組み立て直す。
 *
 * 同じ材料を何度追加してもよい（要らなくなったら買い物リスト側で消せる）。
 * 範囲外の添字は黙って捨てる。追加後にレシピを編集すると番号がずれるが、
 * 画面はローダーの値をそのまま見ているので、通常の操作でずれることはない。
 */
export const addIngredientsToShoppingList = async (
  store: RecipeStore,
  shoppingItemStore: ShoppingItemStore,
  userId: string,
  recipeId: string,
  ingredientIndexes: readonly number[],
): Promise<number> => {
  await requireOwnedRecipe(store, userId, recipeId);

  const ingredients = await store.findIngredients(recipeId);
  // 同じ行を 2 回選べないよう重ねて弾き、材料の並び順で追加する
  const rows = [...new Set(ingredientIndexes)]
    .sort((a, b) => a - b)
    .map((index) => ingredients[index])
    .filter((row) => row !== undefined)
    .map((row) => ({
      userId,
      label: truncateShoppingItemLabel(formatIngredientRowLabel(row)),
      recipeId,
    }));

  await shoppingItemStore.insertShoppingItems(rows);

  return rows.length;
};

/**
 * レシピを削除する。配下の行は FK のカスケードでまとめて消えるが、
 * R2 の写真だけはカスケードが効かないので、行が消える前にキーを控えて消す。
 */
export const removeRecipe = async (
  store: RecipeStore,
  images: ImageStore,
  userId: string,
  recipeId: string,
): Promise<void> => {
  await requireOwnedRecipe(store, userId, recipeId);

  const photos = await store.findPhotos(recipeId);

  await store.deleteRecipe(recipeId);
  await images.deleteMany(photos.map((photo) => photo.storageKey));
};
