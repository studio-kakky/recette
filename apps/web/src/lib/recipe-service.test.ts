import { beforeEach, describe, expect, it } from 'vitest';

import type { ImageStore } from '~/db/image-store';
import type { RecipeStore } from '~/db/recipe-store';
import type { ShoppingItemStore } from '~/db/shopping-item-store';

import { createImageKey } from './image-key';
import { ImageAccessDeniedError } from './image-service';
import type { NormalizedRecipe } from './recipe-input';
import { EMPTY_RECIPE_SEARCH_CRITERIA } from './recipe-search';
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

type RecipeRow = {
  id: string;
  userId: string;
  title: string;
  memo: string | null;
  url: string | null;
};

/**
 * メモリ上の `RecipeStore`。
 *
 * D1 を立てずに、認可・行の並び・タグの作り分けを確かめるために使う。
 * 保存された生の行をそのまま覗けるようにしてある。
 */
const createFakeStore = () => {
  const recipes: RecipeRow[] = [];
  const ingredients = new Map<
    string,
    Array<{ name: string; amount: string | null; order: number }>
  >();
  const steps = new Map<string, Array<{ body: string; order: number }>>();
  const tags: Array<{ id: string; userId: string; name: string }> = [];
  const recipeTags = new Map<string, string[]>();
  const cookLogs: Array<{ recipeId: string }> = [];
  const photos: Array<{ recipeId: string; storageKey: string; order: number }> =
    [];
  const updatedAtById = new Map<string, Date>();

  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}-${++sequence}`;

  // 実時刻に依らず「あとで書いたものほど新しい」を作るための論理時計
  let clock = 0;
  const touch = (recipeId: string) => {
    updatedAtById.set(recipeId, new Date(++clock * 1000));
  };

  /** userId が持つレシピの ID 集合（子テーブルの絞り込みに使う） */
  const recipeIdsOf = (userId: string) =>
    new Set(
      recipes.filter((recipe) => recipe.userId === userId).map(({ id }) => id),
    );

  const store: RecipeStore = {
    findRecipe: (recipeId) =>
      Promise.resolve(recipes.find((recipe) => recipe.id === recipeId)),

    findIngredients: (recipeId) =>
      Promise.resolve(
        [...(ingredients.get(recipeId) ?? [])]
          .sort((a, b) => a.order - b.order)
          .map(({ name, amount }) => ({ name, amount })),
      ),

    findSteps: (recipeId) =>
      Promise.resolve(
        [...(steps.get(recipeId) ?? [])]
          .sort((a, b) => a.order - b.order)
          .map(({ body }) => ({ body })),
      ),

    findPhotos: (recipeId) =>
      Promise.resolve(
        photos
          .filter((photo) => photo.recipeId === recipeId)
          .sort((a, b) => a.order - b.order)
          .map(({ storageKey }) => ({ storageKey })),
      ),

    findRecipeTagNames: (recipeId) =>
      Promise.resolve(
        (recipeTags.get(recipeId) ?? [])
          .map((tagId) => tags.find((tag) => tag.id === tagId)?.name)
          .filter((name) => name !== undefined)
          .sort(),
      ),

    listTags: (userId) =>
      Promise.resolve(
        tags
          .filter((tag) => tag.userId === userId)
          .map(({ id, name }) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),

    listRecipes: (userId, criteria) => {
      // 実装（SQL）と同じ意味になるように書く。
      // キーワードはタイトル・メモ・材料名のどれかに含まれれば一致（OR）、
      // タグは選んだものをすべて持っていれば一致（AND）
      const { keyword } = criteria;
      const matchesKeyword = (recipe: RecipeRow) =>
        keyword === null ||
        [
          recipe.title,
          recipe.memo ?? '',
          ...(ingredients.get(recipe.id) ?? []).map((row) => row.name),
        ].some((value) => value.includes(keyword));

      const matchesTags = (recipe: RecipeRow) => {
        const names = new Set(
          (recipeTags.get(recipe.id) ?? []).map(
            (tagId) => tags.find((tag) => tag.id === tagId)?.name,
          ),
        );

        return criteria.tagNames.every((name) => names.has(name));
      };

      return Promise.resolve(
        recipes
          .filter(
            (recipe) =>
              recipe.userId === userId &&
              matchesKeyword(recipe) &&
              matchesTags(recipe),
          )
          // 並び順はユースケース側の責務なので、ここでは作成順のまま返す
          .map(({ id, title, url }) => ({
            id,
            title,
            url,
            updatedAt: updatedAtById.get(id) ?? new Date(0),
          })),
      );
    },

    listTagNamesByRecipe: (userId) => {
      const ids = recipeIdsOf(userId);

      return Promise.resolve(
        [...recipeTags.entries()]
          .filter(([recipeId]) => ids.has(recipeId))
          .flatMap(([recipeId, tagIds]) =>
            tagIds
              .map((tagId) => tags.find((tag) => tag.id === tagId)?.name)
              .filter((name) => name !== undefined)
              .sort()
              .map((name) => ({ recipeId, name })),
          ),
      );
    },

    countCookLogsByRecipe: (userId) => {
      const ids = recipeIdsOf(userId);
      const counts = cookLogs
        .filter((log) => ids.has(log.recipeId))
        .reduce(
          (acc, log) => acc.set(log.recipeId, (acc.get(log.recipeId) ?? 0) + 1),
          new Map<string, number>(),
        );

      // 0 件のレシピは行自体が返らない（実装の GROUP BY と同じ挙動）
      return Promise.resolve(
        [...counts].map(([recipeId, cookCount]) => ({ recipeId, cookCount })),
      );
    },

    listFirstPhotoKeysByRecipe: (userId) => {
      const ids = recipeIdsOf(userId);
      const firstByRecipe = photos
        .filter((photo) => ids.has(photo.recipeId))
        .reduce((acc, photo) => {
          const current = acc.get(photo.recipeId);

          return current && current.order <= photo.order
            ? acc
            : acc.set(photo.recipeId, photo);
        }, new Map<string, { storageKey: string; order: number }>());

      return Promise.resolve(
        [...firstByRecipe].map(([recipeId, photo]) => ({
          recipeId,
          storageKey: photo.storageKey,
        })),
      );
    },

    insertRecipe: (recipe) => {
      const id = nextId('recipe');
      recipes.push({ id, ...recipe });
      touch(id);

      return Promise.resolve(id);
    },

    updateRecipe: (recipeId, values) => {
      const recipe = recipes.find((row) => row.id === recipeId);

      if (recipe) {
        Object.assign(recipe, values);
        touch(recipeId);
      }

      return Promise.resolve();
    },

    deleteRecipe: (recipeId) => {
      const index = recipes.findIndex((recipe) => recipe.id === recipeId);

      if (index !== -1) {
        recipes.splice(index, 1);
      }

      // 実 DB では FK のカスケードで消える配下の行を、ここでも同じように落とす
      ingredients.delete(recipeId);
      steps.delete(recipeId);
      recipeTags.delete(recipeId);
      updatedAtById.delete(recipeId);

      const dropRowsOfRecipe = <T extends { recipeId: string }>(rows: T[]) => {
        const kept = rows.filter((row) => row.recipeId !== recipeId);
        rows.splice(0, rows.length, ...kept);
      };

      dropRowsOfRecipe(cookLogs);
      dropRowsOfRecipe(photos);

      return Promise.resolve();
    },

    replaceIngredients: (recipeId, rows) => {
      ingredients.set(
        recipeId,
        rows.map((row) => ({ ...row })),
      );

      return Promise.resolve();
    },

    replaceSteps: (recipeId, rows) => {
      steps.set(
        recipeId,
        rows.map((row) => ({ ...row })),
      );

      return Promise.resolve();
    },

    replacePhotos: (recipeId, rows) => {
      photos.splice(
        0,
        photos.length,
        ...photos.filter((photo) => photo.recipeId !== recipeId),
        ...rows.map((row) => ({ ...row, recipeId })),
      );

      return Promise.resolve();
    },

    insertTags: (rows) => {
      rows.forEach(({ userId, name }) => {
        // ユーザー内で name ユニーク。既にあれば何もしない
        if (!tags.some((tag) => tag.userId === userId && tag.name === name)) {
          tags.push({ id: nextId('tag'), userId, name });
        }
      });

      return Promise.resolve();
    },

    replaceRecipeTags: (recipeId, tagIds) => {
      recipeTags.set(recipeId, [...tagIds]);

      return Promise.resolve();
    },
  };

  return {
    store,
    recipes,
    ingredients,
    steps,
    tags,
    recipeTags,
    cookLogs,
    photos,
  };
};

/** メモリ上の `ShoppingItemStore`。追加された行をそのまま覗ける */
const createFakeShoppingItemStore = () => {
  const rows: Array<{
    userId: string;
    label: string;
    recipeId: string | null;
  }> = [];

  const store: ShoppingItemStore = {
    insertShoppingItems: (inserted) => {
      rows.push(...inserted.map((row) => ({ ...row })));

      return Promise.resolve();
    },
  };

  return { store, rows };
};

/**
 * メモリ上の `ImageStore`。
 *
 * ここで確かめたいのは「R2 の実体をいつ消すか」だけなので、消されたキーを
 * 記録するだけの最小限にしてある。
 */
const createFakeImageStore = () => {
  const deletedKeys: string[] = [];

  const store: ImageStore = {
    put: () => Promise.resolve(),
    get: () => Promise.resolve(null),
    deleteMany: (keys) => {
      deletedKeys.push(...keys);

      return Promise.resolve();
    },
  };

  return { store, deletedKeys };
};

const recipe = (values: Partial<NormalizedRecipe> = {}): NormalizedRecipe => ({
  title: 'カレー',
  memo: null,
  url: null,
  ingredients: [],
  steps: [],
  tagNames: [],
  photos: [],
  ...values,
});

const OWNER = 'user-owner';
const OTHER = 'user-other';

/** 絞り込みなし（＝全件） */
const NO_CRITERIA = EMPTY_RECIPE_SEARCH_CRITERIA;

/** 添付済みの写真 1 枚分。キーの持ち主で認可されるので、採番も本物と同じ形で行う */
const photo = (userId: string, order: number) => ({
  storageKey: createImageKey(userId),
  order,
});

describe('addRecipe', () => {
  it('タイトルだけのレシピを保存できる', async () => {
    const fake = createFakeStore();

    const recipeId = await addRecipe(fake.store, OWNER, recipe());

    expect(fake.recipes).toEqual([
      { id: recipeId, userId: OWNER, title: 'カレー', memo: null, url: null },
    ]);
  });

  it('材料と手順を order 付きで保存する', async () => {
    const fake = createFakeStore();

    const recipeId = await addRecipe(
      fake.store,
      OWNER,
      recipe({
        ingredients: [
          { name: '玉ねぎ', amount: '1個', order: 0 },
          { name: '豚肉', amount: null, order: 1 },
        ],
        steps: [
          { body: '切る', order: 0 },
          { body: '煮る', order: 1 },
        ],
      }),
    );

    expect(fake.ingredients.get(recipeId)).toEqual([
      { name: '玉ねぎ', amount: '1個', order: 0 },
      { name: '豚肉', amount: null, order: 1 },
    ]);
    expect(fake.steps.get(recipeId)).toEqual([
      { body: '切る', order: 0 },
      { body: '煮る', order: 1 },
    ]);
  });

  it('既存タグは使い回し、無いタグだけを新しく作る', async () => {
    const fake = createFakeStore();
    await fake.store.insertTags([{ userId: OWNER, name: '和食' }]);
    const existingTagId = fake.tags[0]?.id;

    const recipeId = await addRecipe(
      fake.store,
      OWNER,
      recipe({ tagNames: ['和食', '作り置き'] }),
    );

    expect(fake.tags).toHaveLength(2);
    expect(fake.tags.map((tag) => tag.name).sort()).toEqual([
      '作り置き',
      '和食',
    ]);
    expect(fake.recipeTags.get(recipeId)).toContain(existingTagId);
    expect(fake.recipeTags.get(recipeId)).toHaveLength(2);
  });

  it('同名タグでもユーザーが違えば別のタグを作る', async () => {
    const fake = createFakeStore();
    await fake.store.insertTags([{ userId: OTHER, name: '和食' }]);

    await addRecipe(fake.store, OWNER, recipe({ tagNames: ['和食'] }));

    expect(fake.tags).toHaveLength(2);
    expect(fake.tags.map((tag) => tag.userId).sort()).toEqual([OTHER, OWNER]);
  });

  it('写真を order 付きで保存する', async () => {
    const fake = createFakeStore();
    const photos = [photo(OWNER, 0), photo(OWNER, 1)];

    const recipeId = await addRecipe(fake.store, OWNER, recipe({ photos }));

    expect(fake.photos).toEqual(photos.map((row) => ({ ...row, recipeId })));
  });

  it('他ユーザーの画像キーを添えた作成を拒否する', async () => {
    const fake = createFakeStore();

    await expect(
      addRecipe(fake.store, OWNER, recipe({ photos: [photo(OTHER, 0)] })),
    ).rejects.toBeInstanceOf(ImageAccessDeniedError);

    // 1 枚でも他人のものが混ざっていればレシピごと保存しない
    expect(fake.recipes).toEqual([]);
  });
});

describe('editRecipe', () => {
  const fake = createFakeStore();
  const images = createFakeImageStore();
  let ownedRecipeId = '';
  let savedPhoto = photo(OWNER, 0);

  beforeEach(async () => {
    fake.recipes.length = 0;
    fake.ingredients.clear();
    fake.steps.clear();
    fake.photos.length = 0;
    fake.recipeTags.clear();
    fake.tags.length = 0;
    images.deletedKeys.length = 0;
    savedPhoto = photo(OWNER, 0);

    ownedRecipeId = await addRecipe(
      fake.store,
      OWNER,
      recipe({
        ingredients: [
          { name: '玉ねぎ', amount: '1個', order: 0 },
          { name: '豚肉', amount: '300g', order: 1 },
        ],
        tagNames: ['和食'],
        photos: [savedPhoto],
      }),
    );
  });

  it('他ユーザーのレシピ ID を指定した更新を拒否する', async () => {
    await expect(
      editRecipe(
        fake.store,
        images.store,
        OTHER,
        ownedRecipeId,
        recipe({ title: '乗っ取り' }),
      ),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);

    // 拒否されたので中身は 1 文字も変わらない
    expect(fake.recipes[0]?.title).toBe('カレー');
    expect(fake.ingredients.get(ownedRecipeId)).toHaveLength(2);
    // 他人のレシピの写真を R2 から消させない
    expect(images.deletedKeys).toEqual([]);
  });

  it('存在しないレシピ ID を指定した更新を拒否する', async () => {
    await expect(
      editRecipe(fake.store, images.store, OWNER, 'recipe-unknown', recipe()),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);
  });

  it('持ち主なら本文を更新できる', async () => {
    await editRecipe(
      fake.store,
      images.store,
      OWNER,
      ownedRecipeId,
      recipe({
        title: '肉じゃが',
        memo: 'ほくほく',
        url: 'https://example.com',
      }),
    );

    expect(fake.recipes[0]).toEqual({
      id: ownedRecipeId,
      userId: OWNER,
      title: '肉じゃが',
      memo: 'ほくほく',
      url: 'https://example.com',
    });
  });

  it('材料は差し替えとなり、並べ替え後の order がそのまま保存される', async () => {
    await editRecipe(
      fake.store,
      images.store,
      OWNER,
      ownedRecipeId,
      recipe({
        // 元の 2 行を入れ替え、3 行目を足した状態
        ingredients: [
          { name: '豚肉', amount: '300g', order: 0 },
          { name: '玉ねぎ', amount: '1個', order: 1 },
          { name: '塩', amount: null, order: 2 },
        ],
      }),
    );

    expect(fake.ingredients.get(ownedRecipeId)).toEqual([
      { name: '豚肉', amount: '300g', order: 0 },
      { name: '玉ねぎ', amount: '1個', order: 1 },
      { name: '塩', amount: null, order: 2 },
    ]);
  });

  it('タグを外すと紐付けだけが消える（タグ自体は残る）', async () => {
    await editRecipe(
      fake.store,
      images.store,
      OWNER,
      ownedRecipeId,
      recipe({ tagNames: [] }),
    );

    expect(fake.recipeTags.get(ownedRecipeId)).toEqual([]);
    expect(fake.tags.map((tag) => tag.name)).toEqual(['和食']);
  });

  it('写真を足すと、既存の写真は R2 に残ったまま行が増える', async () => {
    const added = photo(OWNER, 1);

    await editRecipe(
      fake.store,
      images.store,
      OWNER,
      ownedRecipeId,
      recipe({ photos: [{ ...savedPhoto, order: 0 }, added] }),
    );

    expect(fake.photos).toEqual([
      { ...savedPhoto, order: 0, recipeId: ownedRecipeId },
      { ...added, recipeId: ownedRecipeId },
    ]);
    expect(images.deletedKeys).toEqual([]);
  });

  it('写真を外すと R2 の実体も消える', async () => {
    await editRecipe(
      fake.store,
      images.store,
      OWNER,
      ownedRecipeId,
      recipe({ photos: [] }),
    );

    expect(fake.photos).toEqual([]);
    expect(images.deletedKeys).toEqual([savedPhoto.storageKey]);
  });

  it('他ユーザーの画像キーを添えた更新を拒否する', async () => {
    await expect(
      editRecipe(
        fake.store,
        images.store,
        OWNER,
        ownedRecipeId,
        recipe({ photos: [photo(OTHER, 0)] }),
      ),
    ).rejects.toBeInstanceOf(ImageAccessDeniedError);

    // 元の写真は行も実体も残る
    expect(fake.photos).toEqual([{ ...savedPhoto, recipeId: ownedRecipeId }]);
    expect(images.deletedKeys).toEqual([]);
  });
});

describe('getRecipeDetail', () => {
  it('材料・手順・タグ・写真を order 順のまま返す', async () => {
    const fake = createFakeStore();
    const photos = [photo(OWNER, 0), photo(OWNER, 1)];
    const recipeId = await addRecipe(
      fake.store,
      OWNER,
      recipe({
        memo: 'ほくほく',
        url: 'https://example.com',
        ingredients: [
          { name: '豚肉', amount: '300g', order: 0 },
          { name: '塩', amount: null, order: 1 },
        ],
        steps: [
          { body: '切る', order: 0 },
          { body: '煮る', order: 1 },
        ],
        tagNames: ['和食'],
        photos,
      }),
    );

    await expect(getRecipeDetail(fake.store, OWNER, recipeId)).resolves.toEqual(
      {
        title: 'カレー',
        memo: 'ほくほく',
        url: 'https://example.com',
        // 表示するかどうかを画面が選べるよう、未入力は空文字に丸めず null のまま返す
        ingredients: [
          { name: '豚肉', amount: '300g' },
          { name: '塩', amount: null },
        ],
        steps: [{ body: '切る' }, { body: '煮る' }],
        tagNames: ['和食'],
        photos: photos.map(({ storageKey }) => ({ storageKey })),
      },
    );
  });

  it('他ユーザーのレシピは取得できない', async () => {
    const fake = createFakeStore();
    const recipeId = await addRecipe(fake.store, OWNER, recipe());

    await expect(
      getRecipeDetail(fake.store, OTHER, recipeId),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);
  });

  it('存在しないレシピは取得できない', async () => {
    const fake = createFakeStore();

    await expect(
      getRecipeDetail(fake.store, OWNER, 'recipe-unknown'),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);
  });
});

describe('removeRecipe', () => {
  it('持ち主なら削除でき、写真の実体も R2 から消える', async () => {
    const fake = createFakeStore();
    const images = createFakeImageStore();
    const photos = [photo(OWNER, 0), photo(OWNER, 1)];
    const recipeId = await addRecipe(
      fake.store,
      OWNER,
      recipe({
        ingredients: [{ name: '豚肉', amount: '300g', order: 0 }],
        steps: [{ body: '煮る', order: 0 }],
        tagNames: ['和食'],
        photos,
      }),
    );

    await removeRecipe(fake.store, images.store, OWNER, recipeId);

    expect(fake.recipes).toEqual([]);
    expect(fake.ingredients.has(recipeId)).toBe(false);
    expect(fake.steps.has(recipeId)).toBe(false);
    expect(fake.photos).toEqual([]);
    expect(fake.recipeTags.has(recipeId)).toBe(false);
    // 写真の行は FK のカスケードで消えるが、R2 の実体は明示的に消す必要がある
    expect(images.deletedKeys).toEqual(photos.map((row) => row.storageKey));
    // タグ自体はユーザーの持ち物なので、レシピを消しても残る
    expect(fake.tags.map((tag) => tag.name)).toEqual(['和食']);
  });

  it('他ユーザーのレシピは削除できない', async () => {
    const fake = createFakeStore();
    const images = createFakeImageStore();
    const recipeId = await addRecipe(
      fake.store,
      OWNER,
      recipe({ photos: [photo(OWNER, 0)] }),
    );

    await expect(
      removeRecipe(fake.store, images.store, OTHER, recipeId),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);

    expect(fake.recipes).toHaveLength(1);
    expect(images.deletedKeys).toEqual([]);
  });

  it('存在しないレシピの削除を拒否する', async () => {
    const fake = createFakeStore();
    const images = createFakeImageStore();

    await expect(
      removeRecipe(fake.store, images.store, OWNER, 'recipe-unknown'),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);
  });
});

describe('listRecipeSummaries', () => {
  it('レシピが 1 件も無ければ空になる', async () => {
    const fake = createFakeStore();

    await expect(
      listRecipeSummaries(fake.store, OWNER, NO_CRITERIA),
    ).resolves.toEqual([]);
  });

  it('自分のレシピだけを更新の新しい順に返す', async () => {
    const fake = createFakeStore();
    const images = createFakeImageStore();
    const first = await addRecipe(
      fake.store,
      OWNER,
      recipe({ title: '味噌汁' }),
    );
    await addRecipe(fake.store, OWNER, recipe({ title: '肉じゃが' }));
    await addRecipe(fake.store, OTHER, recipe({ title: '他人のレシピ' }));

    // 先に作ったレシピを更新すると、最後に触ったものとして先頭に来る
    await editRecipe(
      fake.store,
      images.store,
      OWNER,
      first,
      recipe({ title: '味噌汁' }),
    );

    await expect(
      listRecipeSummaries(fake.store, OWNER, NO_CRITERIA).then((rows) =>
        rows.map((row) => row.title),
      ),
    ).resolves.toEqual(['味噌汁', '肉じゃが']);
  });

  it('タグ・作った回数・URL の有無・先頭写真をカードの形にまとめる', async () => {
    const fake = createFakeStore();
    const recipeId = await addRecipe(
      fake.store,
      OWNER,
      recipe({ url: 'https://example.com', tagNames: ['和食', 'あっさり'] }),
    );
    fake.cookLogs.push({ recipeId }, { recipeId });
    // 先頭写真は order が最小のもの。登録順に依らず選ばれる
    fake.photos.push(
      { recipeId, storageKey: 'photos/second', order: 1 },
      { recipeId, storageKey: 'photos/first', order: 0 },
    );

    await expect(
      listRecipeSummaries(fake.store, OWNER, NO_CRITERIA),
    ).resolves.toEqual([
      {
        id: recipeId,
        title: 'カレー',
        tagNames: ['あっさり', '和食'],
        cookCount: 2,
        hasUrl: true,
        photoStorageKey: 'photos/first',
      },
    ]);
  });

  it('作った記録・タグ・写真・URL が無くても破綻しない', async () => {
    const fake = createFakeStore();
    const recipeId = await addRecipe(fake.store, OWNER, recipe());

    await expect(
      listRecipeSummaries(fake.store, OWNER, NO_CRITERIA),
    ).resolves.toEqual([
      {
        id: recipeId,
        title: 'カレー',
        tagNames: [],
        cookCount: 0,
        hasUrl: false,
        photoStorageKey: null,
      },
    ]);
  });

  it('他レシピの作った記録やタグを取り違えない', async () => {
    const fake = createFakeStore();
    const cooked = await addRecipe(
      fake.store,
      OWNER,
      recipe({ title: 'よく作る', tagNames: ['定番'] }),
    );
    const untouched = await addRecipe(
      fake.store,
      OWNER,
      recipe({ title: 'まだ作っていない' }),
    );
    fake.cookLogs.push({ recipeId: cooked });

    const summaries = await listRecipeSummaries(fake.store, OWNER, NO_CRITERIA);

    expect(
      summaries.map(({ id, cookCount, tagNames }) => ({
        id,
        cookCount,
        tagNames,
      })),
    ).toEqual([
      { id: untouched, cookCount: 0, tagNames: [] },
      { id: cooked, cookCount: 1, tagNames: ['定番'] },
    ]);
  });

  it('絞り込み条件をそのまま store に渡す（絞り込みは SQL に任せる）', async () => {
    const fake = createFakeStore();
    const criteria = { keyword: 'カレー', tagNames: ['和食'] };
    const received: unknown[] = [];
    const spied: RecipeStore = {
      ...fake.store,
      listRecipes: (userId, passed) => {
        received.push(passed);

        return fake.store.listRecipes(userId, passed);
      },
    };

    await listRecipeSummaries(spied, OWNER, criteria);

    expect(received).toEqual([criteria]);
  });

  it('キーワードで絞り込んでも、カードに出す情報は欠けない', async () => {
    const fake = createFakeStore();
    const target = await addRecipe(
      fake.store,
      OWNER,
      recipe({
        title: 'カレー',
        url: 'https://example.com',
        tagNames: ['和食'],
      }),
    );
    await addRecipe(fake.store, OWNER, recipe({ title: '味噌汁' }));
    fake.cookLogs.push({ recipeId: target }, { recipeId: target });
    fake.photos.push({ recipeId: target, storageKey: 'photos/1', order: 0 });

    await expect(
      listRecipeSummaries(fake.store, OWNER, {
        keyword: 'カレー',
        tagNames: [],
      }),
    ).resolves.toEqual([
      {
        id: target,
        title: 'カレー',
        tagNames: ['和食'],
        cookCount: 2,
        hasUrl: true,
        photoStorageKey: 'photos/1',
      },
    ]);
  });

  it('該当が無ければ空になる', async () => {
    const fake = createFakeStore();
    await addRecipe(fake.store, OWNER, recipe({ title: 'カレー' }));

    await expect(
      listRecipeSummaries(fake.store, OWNER, {
        keyword: 'みつからない',
        tagNames: [],
      }),
    ).resolves.toEqual([]);
  });

  it('絞り込んだ結果も更新の新しい順に並ぶ', async () => {
    const fake = createFakeStore();
    const images = createFakeImageStore();
    const first = await addRecipe(
      fake.store,
      OWNER,
      recipe({ title: 'カレーうどん', tagNames: ['和食'] }),
    );
    await addRecipe(
      fake.store,
      OWNER,
      recipe({ title: 'カレーライス', tagNames: ['和食'] }),
    );
    await editRecipe(
      fake.store,
      images.store,
      OWNER,
      first,
      recipe({ title: 'カレーうどん', tagNames: ['和食'] }),
    );

    await expect(
      listRecipeSummaries(fake.store, OWNER, {
        keyword: 'カレー',
        tagNames: ['和食'],
      }).then((rows) => rows.map((row) => row.title)),
    ).resolves.toEqual(['カレーうどん', 'カレーライス']);
  });
});

describe('addIngredientsToShoppingList', () => {
  /** 材料入りのレシピを 1 件持った状態を作る */
  const setup = async () => {
    const fake = createFakeStore();
    const shopping = createFakeShoppingItemStore();
    const recipeId = await addRecipe(
      fake.store,
      OWNER,
      recipe({
        ingredients: [
          { name: '豚肉', amount: '300g', order: 0 },
          { name: '玉ねぎ', amount: '1個', order: 1 },
          { name: 'こしょう', amount: null, order: 2 },
        ],
      }),
    );

    return { fake, shopping, recipeId };
  };

  it('選んだ材料を name + amount のラベルで追加する', async () => {
    const { fake, shopping, recipeId } = await setup();

    await expect(
      addIngredientsToShoppingList(
        fake.store,
        shopping.store,
        OWNER,
        recipeId,
        [0, 2],
      ),
    ).resolves.toBe(2);

    expect(shopping.rows).toEqual([
      { userId: OWNER, label: '豚肉 300g', recipeId },
      // 分量が未入力なら材料名だけ
      { userId: OWNER, label: 'こしょう', recipeId },
    ]);
  });

  it('選んだ順ではなく材料の並び順で追加し、同じ行の重複指定は 1 件にまとめる', async () => {
    const { fake, shopping, recipeId } = await setup();

    await expect(
      addIngredientsToShoppingList(
        fake.store,
        shopping.store,
        OWNER,
        recipeId,
        [2, 0, 0],
      ),
    ).resolves.toBe(2);

    expect(shopping.rows.map((row) => row.label)).toEqual([
      '豚肉 300g',
      'こしょう',
    ]);
  });

  it('同じ材料を続けて追加できる（重複は許容する）', async () => {
    const { fake, shopping, recipeId } = await setup();

    await addIngredientsToShoppingList(
      fake.store,
      shopping.store,
      OWNER,
      recipeId,
      [0],
    );
    await addIngredientsToShoppingList(
      fake.store,
      shopping.store,
      OWNER,
      recipeId,
      [0],
    );

    expect(shopping.rows.map((row) => row.label)).toEqual([
      '豚肉 300g',
      '豚肉 300g',
    ]);
  });

  it('材料の数を超えた指定は無視する', async () => {
    const { fake, shopping, recipeId } = await setup();

    await expect(
      addIngredientsToShoppingList(
        fake.store,
        shopping.store,
        OWNER,
        recipeId,
        [1, 99],
      ),
    ).resolves.toBe(1);

    expect(shopping.rows.map((row) => row.label)).toEqual(['玉ねぎ 1個']);
  });

  it('他ユーザーのレシピの材料は追加できない', async () => {
    const { fake, shopping, recipeId } = await setup();

    await expect(
      addIngredientsToShoppingList(
        fake.store,
        shopping.store,
        OTHER,
        recipeId,
        [0, 1, 2],
      ),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);

    expect(shopping.rows).toEqual([]);
  });

  it('存在しないレシピの材料は追加できない', async () => {
    const { fake, shopping } = await setup();

    await expect(
      addIngredientsToShoppingList(
        fake.store,
        shopping.store,
        OWNER,
        'recipe-unknown',
        [0],
      ),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);

    expect(shopping.rows).toEqual([]);
  });
});

describe('getRecipeForEdit', () => {
  it('保存済みの値をフォームの形で返す', async () => {
    const fake = createFakeStore();
    const savedPhoto = photo(OWNER, 0);
    const recipeId = await addRecipe(
      fake.store,
      OWNER,
      recipe({
        memo: 'ほくほく',
        ingredients: [
          { name: '豚肉', amount: '300g', order: 0 },
          { name: '塩', amount: null, order: 1 },
        ],
        steps: [{ body: '煮る', order: 0 }],
        tagNames: ['和食'],
        photos: [savedPhoto],
      }),
    );

    await expect(
      getRecipeForEdit(fake.store, OWNER, recipeId),
    ).resolves.toEqual({
      title: 'カレー',
      memo: 'ほくほく',
      // 未入力（NULL）はフォーム上は空文字に戻す
      url: '',
      ingredients: [
        { name: '豚肉', amount: '300g' },
        { name: '塩', amount: '' },
      ],
      steps: [{ body: '煮る' }],
      tagNames: ['和食'],
      photos: [{ storageKey: savedPhoto.storageKey }],
    });
  });

  it('他ユーザーのレシピは取得できない', async () => {
    const fake = createFakeStore();
    const recipeId = await addRecipe(fake.store, OWNER, recipe());

    await expect(
      getRecipeForEdit(fake.store, OTHER, recipeId),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);
  });
});
