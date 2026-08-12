import { describe, expect, it } from 'vitest';

import {
  CLEARED_RECIPE_SEARCH,
  isRecipeSearchActive,
  normalizeRecipeSearch,
  recipeSearchSchema,
  toRecipeSearchParams,
  withKeyword,
  withToggledTagName,
} from './recipe-search';

describe('recipeSearchSchema', () => {
  it('キーワードとタグを読み取る', () => {
    expect(recipeSearchSchema.parse({ q: 'カレー', tags: ['和食'] })).toEqual({
      q: 'カレー',
      tags: ['和食'],
    });
  });

  it('未指定でも通る', () => {
    expect(recipeSearchSchema.parse({})).toEqual({
      q: undefined,
      tags: undefined,
    });
  });

  it('手で書き換えられた型違いの値は未指定に倒す（画面を落とさない）', () => {
    expect(recipeSearchSchema.parse({ q: 1, tags: 'カレー' })).toEqual({
      q: undefined,
      tags: undefined,
    });
  });
});

describe('normalizeRecipeSearch', () => {
  it('キーワードの前後の空白を落とす', () => {
    expect(normalizeRecipeSearch({ q: '  カレー ' }).keyword).toBe('カレー');
  });

  it('空・空白だけのキーワードは条件なし（null）にする', () => {
    expect(normalizeRecipeSearch({ q: '' }).keyword).toBeNull();
    expect(normalizeRecipeSearch({ q: '   ' }).keyword).toBeNull();
    expect(normalizeRecipeSearch({}).keyword).toBeNull();
  });

  it('タグは空白を落とし、空要素と重複を捨てる', () => {
    expect(
      normalizeRecipeSearch({ tags: [' 和食', '和食', '', '  ', '作り置き'] })
        .tagNames,
    ).toEqual(['和食', '作り置き']);
  });

  it('長すぎるキーワードは頭打ちにする', () => {
    expect(normalizeRecipeSearch({ q: 'あ'.repeat(200) }).keyword).toHaveLength(
      100,
    );
  });

  it('タグは件数と 1 件あたりの長さで頭打ちにする', () => {
    const criteria = normalizeRecipeSearch({
      tags: [
        ...Array.from({ length: 40 }, (_, index) => `タグ${index}`),
        'な'.repeat(51),
      ],
    });

    expect(criteria.tagNames).toHaveLength(30);
    expect(criteria.tagNames).not.toContain('な'.repeat(51));
  });

  it('正規化した条件はそのまま Server Function の入力として通る', () => {
    const criteria = normalizeRecipeSearch({ q: ' カレー ', tags: ['和食'] });

    expect(criteria).toEqual({ keyword: 'カレー', tagNames: ['和食'] });
  });
});

describe('isRecipeSearchActive', () => {
  it('キーワードかタグがあれば絞り込み中', () => {
    expect(isRecipeSearchActive({ keyword: 'カレー', tagNames: [] })).toBe(
      true,
    );
    expect(isRecipeSearchActive({ keyword: null, tagNames: ['和食'] })).toBe(
      true,
    );
  });

  it('どちらも無ければ絞り込みなし', () => {
    expect(isRecipeSearchActive({ keyword: null, tagNames: [] })).toBe(false);
  });
});

describe('toRecipeSearchParams', () => {
  it('条件をクエリに載せる', () => {
    expect(
      toRecipeSearchParams({ keyword: 'カレー', tagNames: ['和食', '時短'] }),
    ).toEqual({ q: 'カレー', tags: ['和食', '時短'] });
  });

  it('条件なしの項目は undefined にして URL から消す', () => {
    expect(toRecipeSearchParams({ keyword: null, tagNames: [] })).toEqual({
      q: undefined,
      tags: undefined,
    });
    expect(CLEARED_RECIPE_SEARCH).toEqual({ q: undefined, tags: undefined });
  });
});

describe('withKeyword', () => {
  it('タグを保ったままキーワードだけを差し替える', () => {
    expect(withKeyword({ q: 'カレー', tags: ['和食'] }, '肉じゃが')).toEqual({
      q: '肉じゃが',
      tags: ['和食'],
    });
  });

  it('空にするとキーワードだけが URL から消える', () => {
    expect(withKeyword({ q: 'カレー', tags: ['和食'] }, '  ')).toEqual({
      q: undefined,
      tags: ['和食'],
    });
  });
});

describe('withToggledTagName', () => {
  it('未選択のタグを足す', () => {
    expect(withToggledTagName({ q: 'カレー' }, '和食')).toEqual({
      q: 'カレー',
      tags: ['和食'],
    });
  });

  it('選択済みのタグを外す', () => {
    expect(withToggledTagName({ tags: ['和食', '時短'] }, '和食')).toEqual({
      q: undefined,
      tags: ['時短'],
    });
  });

  it('最後の 1 つを外すとタグのパラメータごと消える', () => {
    expect(withToggledTagName({ tags: ['和食'] }, '和食')).toEqual({
      q: undefined,
      tags: undefined,
    });
  });

  it('複数選択は積み上がる（AND 条件になる）', () => {
    const search = withToggledTagName(
      withToggledTagName({}, '和食'),
      '作り置き',
    );

    expect(search).toEqual({ q: undefined, tags: ['和食', '作り置き'] });
  });
});
