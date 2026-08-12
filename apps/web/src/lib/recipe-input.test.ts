import { describe, expect, it } from 'vitest';

import {
  normalizeRecipeInput,
  normalizedRecipeInputSchema,
  recipeInputSchema,
} from './recipe-input';

/** 空のフォームに、テストで注目したい値だけを載せる */
const input = (values: Partial<Record<string, unknown>> = {}) => ({
  title: 'カレー',
  memo: '',
  url: '',
  ingredients: [],
  steps: [],
  tagNames: [],
  photos: [],
  ...values,
});

describe('recipeInputSchema', () => {
  it('タイトルだけでも保存できる', () => {
    expect(recipeInputSchema.safeParse(input()).success).toBe(true);
  });

  it('タイトルは前後の空白を落としてから必須判定する', () => {
    expect(recipeInputSchema.parse(input({ title: '  カレー  ' })).title).toBe(
      'カレー',
    );
    expect(recipeInputSchema.safeParse(input({ title: '   ' })).success).toBe(
      false,
    );
    expect(recipeInputSchema.safeParse(input({ title: '' })).success).toBe(
      false,
    );
  });

  it('URL + タイトルだけでも保存できる', () => {
    const result = recipeInputSchema.safeParse(
      input({ url: 'https://example.com/recipes/1' }),
    );

    expect(result.success).toBe(true);
  });

  it('URL は未入力を許し、http(s) 以外は弾く', () => {
    expect(recipeInputSchema.safeParse(input({ url: '' })).success).toBe(true);
    expect(
      recipeInputSchema.safeParse(input({ url: 'http://example.com' })).success,
    ).toBe(true);
    expect(
      recipeInputSchema.safeParse(input({ url: 'example.com' })).success,
    ).toBe(false);
    expect(
      recipeInputSchema.safeParse(input({ url: 'javascript:alert(1)' }))
        .success,
    ).toBe(false);
  });

  it('上限を超える入力を弾く', () => {
    expect(
      recipeInputSchema.safeParse(input({ title: 'あ'.repeat(201) })).success,
    ).toBe(false);
    expect(
      recipeInputSchema.safeParse(
        input({ tagNames: Array.from({ length: 31 }, (_, i) => `tag${i}`) }),
      ).success,
    ).toBe(false);
  });
});

describe('normalizeRecipeInput', () => {
  it('材料は入力順に order を振る', () => {
    const normalized = normalizeRecipeInput(
      recipeInputSchema.parse(
        input({
          ingredients: [
            { name: '玉ねぎ', amount: '1個' },
            { name: '豚肉', amount: '300g' },
            { name: '塩', amount: '' },
          ],
        }),
      ),
    );

    expect(normalized.ingredients).toEqual([
      { name: '玉ねぎ', amount: '1個', order: 0 },
      { name: '豚肉', amount: '300g', order: 1 },
      // 分量は任意。未入力なら NULL として保存する
      { name: '塩', amount: null, order: 2 },
    ]);
  });

  it('材料名が空の行は捨て、order を詰め直す', () => {
    const normalized = normalizeRecipeInput(
      recipeInputSchema.parse(
        input({
          ingredients: [
            { name: '玉ねぎ', amount: '1個' },
            // 分量だけ書かれた行は「まだ書いていない行」として捨てる
            { name: '  ', amount: '300g' },
            { name: '塩', amount: '少々' },
          ],
        }),
      ),
    );

    expect(normalized.ingredients).toEqual([
      { name: '玉ねぎ', amount: '1個', order: 0 },
      { name: '塩', amount: '少々', order: 1 },
    ]);
  });

  it('手順は入力順に order を振り、空行を捨てる', () => {
    const normalized = normalizeRecipeInput(
      recipeInputSchema.parse(
        input({
          steps: [
            { body: '玉ねぎを切る' },
            { body: '   ' },
            { body: '炒める' },
          ],
        }),
      ),
    );

    expect(normalized.steps).toEqual([
      { body: '玉ねぎを切る', order: 0 },
      { body: '炒める', order: 1 },
    ]);
  });

  it('タグ名は空を捨てて重複を除く', () => {
    const normalized = normalizeRecipeInput(
      recipeInputSchema.parse(
        input({ tagNames: ['和食', ' 和食 ', '', '作り置き'] }),
      ),
    );

    expect(normalized.tagNames).toEqual(['和食', '作り置き']);
  });

  it('写真は並び順に order を振り、同じキーの重複を捨てる', () => {
    const normalized = normalizeRecipeInput(
      recipeInputSchema.parse(
        input({
          photos: [
            { storageKey: 'users/user-1/photo-a' },
            { storageKey: 'users/user-1/photo-b' },
            { storageKey: 'users/user-1/photo-a' },
            { storageKey: '' },
          ],
        }),
      ),
    );

    expect(normalized.photos).toEqual([
      { storageKey: 'users/user-1/photo-a', order: 0 },
      { storageKey: 'users/user-1/photo-b', order: 1 },
    ]);
  });

  it('メモ・URL の未入力は NULL にする', () => {
    const normalized = normalizeRecipeInput(
      recipeInputSchema.parse(input({ memo: '  ', url: '' })),
    );

    expect(normalized.memo).toBeNull();
    expect(normalized.url).toBeNull();
  });
});

describe('normalizedRecipeInputSchema', () => {
  it('検証と正規化を一度に行う', () => {
    const parsed = normalizedRecipeInputSchema.parse(
      input({
        title: ' 肉じゃが ',
        memo: 'ほくほく',
        steps: [{ body: '煮る' }],
      }),
    );

    expect(parsed).toEqual({
      title: '肉じゃが',
      memo: 'ほくほく',
      url: null,
      ingredients: [],
      steps: [{ body: '煮る', order: 0 }],
      tagNames: [],
      photos: [],
    });
  });
});
