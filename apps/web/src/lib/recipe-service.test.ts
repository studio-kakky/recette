import { beforeEach, describe, expect, it } from 'vitest';

import type { RecipeStore } from '~/db/recipe-store';

import type { NormalizedRecipe } from './recipe-input';
import {
  RecipeNotFoundError,
  addRecipe,
  editRecipe,
  getRecipeDetail,
  getRecipeForEdit,
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

  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}-${++sequence}`;

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

    insertRecipe: (recipe) => {
      const id = nextId('recipe');
      recipes.push({ id, ...recipe });

      return Promise.resolve(id);
    },

    updateRecipe: (recipeId, values) => {
      const recipe = recipes.find((row) => row.id === recipeId);

      if (recipe) {
        Object.assign(recipe, values);
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

  return { store, recipes, ingredients, steps, tags, recipeTags };
};

const recipe = (values: Partial<NormalizedRecipe> = {}): NormalizedRecipe => ({
  title: 'カレー',
  memo: null,
  url: null,
  ingredients: [],
  steps: [],
  tagNames: [],
  ...values,
});

const OWNER = 'user-owner';
const OTHER = 'user-other';

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
});

describe('editRecipe', () => {
  const fake = createFakeStore();
  let ownedRecipeId = '';

  beforeEach(async () => {
    fake.recipes.length = 0;
    fake.ingredients.clear();
    fake.steps.clear();
    fake.recipeTags.clear();
    fake.tags.length = 0;

    ownedRecipeId = await addRecipe(
      fake.store,
      OWNER,
      recipe({
        ingredients: [
          { name: '玉ねぎ', amount: '1個', order: 0 },
          { name: '豚肉', amount: '300g', order: 1 },
        ],
        tagNames: ['和食'],
      }),
    );
  });

  it('他ユーザーのレシピ ID を指定した更新を拒否する', async () => {
    await expect(
      editRecipe(
        fake.store,
        OTHER,
        ownedRecipeId,
        recipe({ title: '乗っ取り' }),
      ),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);

    // 拒否されたので中身は 1 文字も変わらない
    expect(fake.recipes[0]?.title).toBe('カレー');
    expect(fake.ingredients.get(ownedRecipeId)).toHaveLength(2);
  });

  it('存在しないレシピ ID を指定した更新を拒否する', async () => {
    await expect(
      editRecipe(fake.store, OWNER, 'recipe-unknown', recipe()),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);
  });

  it('持ち主なら本文を更新できる', async () => {
    await editRecipe(
      fake.store,
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
      OWNER,
      ownedRecipeId,
      recipe({ tagNames: [] }),
    );

    expect(fake.recipeTags.get(ownedRecipeId)).toEqual([]);
    expect(fake.tags.map((tag) => tag.name)).toEqual(['和食']);
  });
});

describe('getRecipeDetail', () => {
  it('材料・手順・タグを order 順のまま返す', async () => {
    const fake = createFakeStore();
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
  it('持ち主なら削除できる', async () => {
    const fake = createFakeStore();
    const recipeId = await addRecipe(
      fake.store,
      OWNER,
      recipe({
        ingredients: [{ name: '豚肉', amount: '300g', order: 0 }],
        steps: [{ body: '煮る', order: 0 }],
        tagNames: ['和食'],
      }),
    );

    await removeRecipe(fake.store, OWNER, recipeId);

    expect(fake.recipes).toEqual([]);
    expect(fake.ingredients.has(recipeId)).toBe(false);
    expect(fake.steps.has(recipeId)).toBe(false);
    expect(fake.recipeTags.has(recipeId)).toBe(false);
    // タグ自体はユーザーの持ち物なので、レシピを消しても残る
    expect(fake.tags.map((tag) => tag.name)).toEqual(['和食']);
  });

  it('他ユーザーのレシピは削除できない', async () => {
    const fake = createFakeStore();
    const recipeId = await addRecipe(fake.store, OWNER, recipe());

    await expect(
      removeRecipe(fake.store, OTHER, recipeId),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);

    expect(fake.recipes).toHaveLength(1);
  });

  it('存在しないレシピの削除を拒否する', async () => {
    const fake = createFakeStore();

    await expect(
      removeRecipe(fake.store, OWNER, 'recipe-unknown'),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);
  });
});

describe('getRecipeForEdit', () => {
  it('保存済みの値をフォームの形で返す', async () => {
    const fake = createFakeStore();
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
