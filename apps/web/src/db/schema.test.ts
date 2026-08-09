import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';

import * as schema from './schema';

// schema.ts はテーブルだけを値としてエクスポートしている（型は実行時には残らない）
const tableConfigs = Object.values(schema).map((table) =>
  getTableConfig(table),
);

/**
 * 「すべてのデータが userId に紐づき、他ユーザーからは見えない」という前提を、
 * 外部キーのカスケード削除で担保できているかを確認する。
 */
describe('schema', () => {
  it('users を含むすべてのテーブルを定義している', () => {
    expect(tableConfigs.map((config) => config.name).sort()).toEqual([
      'cook_log_photos',
      'cook_logs',
      'ingredients',
      'photos',
      'recipe_tags',
      'recipes',
      'shopping_items',
      'steps',
      'tags',
      'users',
    ]);
  });

  it('users 以外のテーブルはユーザーへ辿れる外部キーを持つ', () => {
    const orphans = tableConfigs
      .filter(
        (config) => config.name !== 'users' && config.foreignKeys.length === 0,
      )
      .map((config) => config.name);

    expect(orphans).toEqual([]);
  });

  it('親が消えたら子も消える（shopping_items.recipe_id のみ例外）', () => {
    const nonCascading = tableConfigs
      .flatMap((config) =>
        config.foreignKeys.map((foreignKey) => ({
          table: config.name,
          columns: foreignKey.reference().columns.map((column) => column.name),
          onDelete: foreignKey.onDelete,
        })),
      )
      .filter((foreignKey) => foreignKey.onDelete !== 'cascade');

    // 由来レシピが消えても買い物リストの項目自体は残す
    expect(nonCascading).toEqual([
      { table: 'shopping_items', columns: ['recipe_id'], onDelete: 'set null' },
    ]);
  });
});
