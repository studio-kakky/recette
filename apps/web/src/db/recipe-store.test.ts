import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';

import type { RecipeSearchCriteria } from '~/lib/recipe-search';

import { buildRecipeSearchFilter } from './recipe-store';

/**
 * 一覧の絞り込み条件が意図した SQL になっているかを、D1 を立てずに確かめる。
 * 条件式を SQL 文字列とバインド値に落として読む。
 */
const dialect = new SQLiteSyncDialect();

const toQuery = (criteria: RecipeSearchCriteria) => {
  const filter = buildRecipeSearchFilter('user-1', criteria);

  if (filter === undefined) {
    throw new Error('絞り込み条件が組み立てられませんでした');
  }

  const query = dialect.sqlToQuery(filter);

  // 改行やインデントの差で落ちないよう、空白は 1 つに潰して比べる
  return { sql: query.sql.replace(/\s+/g, ' ').trim(), params: query.params };
};

describe('buildRecipeSearchFilter', () => {
  it('条件が空なら持ち主だけで絞る（＝全件）', () => {
    const { sql, params } = toQuery({ keyword: null, tagNames: [] });

    expect(sql).toBe('"recipes"."user_id" = ?');
    expect(params).toEqual(['user-1']);
  });

  it('キーワードはタイトル・メモ・材料名を横断して探す（OR）', () => {
    const { sql, params } = toQuery({ keyword: 'カレー', tagNames: [] });

    expect(sql).toContain('"recipes"."title" like ?');
    expect(sql).toContain('"recipes"."memo" like ?');
    // 材料は 1 レシピに複数行あるため、結合ではなく exists で見る（行の重複を作らない）
    expect(sql).toContain('exists (select 1 from "ingredients"');
    expect(sql).toContain('"ingredients"."name" like ?');
    expect(params).toEqual([
      'user-1',
      '%カレー%',
      '\\',
      '%カレー%',
      '\\',
      '%カレー%',
      '\\',
    ]);
  });

  it('LIKE には必ず ESCAPE 句を添える', () => {
    const { sql } = toQuery({ keyword: 'カレー', tagNames: [] });

    expect(sql.match(/like \?/g)).toHaveLength(3);
    expect(sql.match(/like \? escape \?/g)).toHaveLength(3);
  });

  it('キーワードの % と _ は打ち消してから渡す（誤ヒットしない）', () => {
    expect(toQuery({ keyword: '100%', tagNames: [] }).params).toContain(
      '%100\\%%',
    );
    expect(toQuery({ keyword: 'a_b', tagNames: [] }).params).toContain(
      '%a\\_b%',
    );
  });

  it('タグは選んだものをすべて持つレシピだけを残す（AND）', () => {
    const { sql, params } = toQuery({
      keyword: null,
      tagNames: ['和食', '作り置き'],
    });

    expect(sql).toContain('select count(distinct "tags"."name")');
    expect(sql).toContain('"tags"."name" in (?, ?)');
    // 一致したタグの種類数が選択数と等しいこと ＝ すべて持っていること
    expect(sql).toContain(') = ?');
    expect(params).toEqual(['user-1', '和食', '作り置き', 2]);
  });

  it('キーワードとタグは併用できる', () => {
    const { sql, params } = toQuery({
      keyword: 'カレー',
      tagNames: ['和食'],
    });

    expect(sql).toContain('"recipes"."user_id" = ?');
    expect(sql).toContain('like ? escape ?');
    expect(sql).toContain('count(distinct "tags"."name")');
    expect(params).toEqual([
      'user-1',
      '%カレー%',
      '\\',
      '%カレー%',
      '\\',
      '%カレー%',
      '\\',
      '和食',
      1,
    ]);
  });
});
