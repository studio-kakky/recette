import { describe, expect, it } from 'vitest';

import {
  SHOPPING_ITEM_LABEL_MAX_LENGTH,
  SHOPPING_ITEM_NOT_FOUND_MESSAGE,
  ShoppingItemNotFoundError,
  addShoppingItemInputSchema,
  applyShoppingListAction,
  assertShoppingItemOwnedBy,
  groupShoppingItems,
  shoppingItemLabelSchema,
  toggleShoppingItemInputSchema,
  type ShoppingListItem,
} from './shopping-item';

const UUID = '0195f0e2-1f9c-7000-8000-000000000001';
const OTHER_UUID = '0195f0e2-1f9c-7000-8000-000000000002';

/** テスト用の項目を組み立てる */
const createItem = (
  overrides: Partial<ShoppingListItem> & Pick<ShoppingListItem, 'id'>,
): ShoppingListItem => ({
  label: '牛乳',
  checked: false,
  createdAt: new Date('2026-08-13T00:00:00Z'),
  ...overrides,
});

describe('shoppingItemLabelSchema', () => {
  it('前後の空白を落として受け取る', () => {
    expect(shoppingItemLabelSchema.parse('  豚肉 300g  ')).toBe('豚肉 300g');
  });

  it('空文字と空白だけの入力を弾く', () => {
    expect(shoppingItemLabelSchema.safeParse('').success).toBe(false);
    expect(shoppingItemLabelSchema.safeParse('   ').success).toBe(false);
    expect(shoppingItemLabelSchema.safeParse('\n\t').success).toBe(false);
  });

  it('上限ちょうどは通し、超えたら弾く', () => {
    const max = 'あ'.repeat(SHOPPING_ITEM_LABEL_MAX_LENGTH);

    expect(shoppingItemLabelSchema.parse(max)).toBe(max);
    expect(shoppingItemLabelSchema.safeParse(`${max}あ`).success).toBe(false);
  });
});

describe('addShoppingItemInputSchema', () => {
  it('UUID とラベルの組を受け取る', () => {
    expect(
      addShoppingItemInputSchema.parse({ id: UUID, label: ' 牛乳 ' }),
    ).toEqual({ id: UUID, label: '牛乳' });
  });

  it('UUID でない ID を弾く', () => {
    expect(
      addShoppingItemInputSchema.safeParse({ id: 'not-a-uuid', label: '牛乳' })
        .success,
    ).toBe(false);
  });

  it('ラベルのない入力を弾く', () => {
    expect(addShoppingItemInputSchema.safeParse({ id: UUID }).success).toBe(
      false,
    );
  });
});

describe('toggleShoppingItemInputSchema', () => {
  it('UUID と真偽値の組を受け取る', () => {
    expect(
      toggleShoppingItemInputSchema.parse({ id: UUID, checked: true }),
    ).toEqual({ id: UUID, checked: true });
  });

  it('UUID でない ID や真偽値でないチェック状態を弾く', () => {
    expect(
      toggleShoppingItemInputSchema.safeParse({ id: '1', checked: true })
        .success,
    ).toBe(false);
    expect(
      toggleShoppingItemInputSchema.safeParse({ id: UUID, checked: 'true' })
        .success,
    ).toBe(false);
  });
});

describe('assertShoppingItemOwnedBy', () => {
  it('自分の項目は通す', () => {
    expect(() =>
      assertShoppingItemOwnedBy({ userId: 'user-1' }, 'user-1'),
    ).not.toThrow();
  });

  it('他人の項目を弾く', () => {
    expect(() =>
      assertShoppingItemOwnedBy({ userId: 'user-2' }, 'user-1'),
    ).toThrow(ShoppingItemNotFoundError);
  });

  it('存在しない項目を弾く', () => {
    expect(() => assertShoppingItemOwnedBy(null, 'user-1')).toThrow(
      ShoppingItemNotFoundError,
    );
    expect(() => assertShoppingItemOwnedBy(undefined, 'user-1')).toThrow(
      ShoppingItemNotFoundError,
    );
  });

  it('他人の項目と存在しない項目で同じメッセージを返す（存在を漏らさない）', () => {
    const forOther = (): void =>
      assertShoppingItemOwnedBy({ userId: 'user-2' }, 'user-1');
    const forMissing = (): void => assertShoppingItemOwnedBy(null, 'user-1');

    expect(forOther).toThrow(SHOPPING_ITEM_NOT_FOUND_MESSAGE);
    expect(forMissing).toThrow(SHOPPING_ITEM_NOT_FOUND_MESSAGE);
  });
});

describe('groupShoppingItems', () => {
  it('未チェックとチェック済みに分ける', () => {
    const milk = createItem({ id: UUID, label: '牛乳' });
    const pork = createItem({ id: OTHER_UUID, label: '豚肉', checked: true });

    expect(groupShoppingItems([pork, milk])).toEqual({
      unchecked: [milk],
      checked: [pork],
    });
  });

  it('それぞれのグループを追加が古い順に並べる', () => {
    const older = createItem({
      id: UUID,
      createdAt: new Date('2026-08-13T00:00:00Z'),
    });
    const newer = createItem({
      id: OTHER_UUID,
      createdAt: new Date('2026-08-13T01:00:00Z'),
    });

    expect(groupShoppingItems([newer, older]).unchecked).toEqual([
      older,
      newer,
    ]);
  });

  it('追加日時が同じなら ID 順にして並びを安定させる', () => {
    const first = createItem({ id: UUID });
    const second = createItem({ id: OTHER_UUID });

    expect(groupShoppingItems([second, first]).unchecked).toEqual([
      first,
      second,
    ]);
  });

  it('空のリストは空のグループになる', () => {
    expect(groupShoppingItems([])).toEqual({ unchecked: [], checked: [] });
  });

  it('元の配列を並べ替えない', () => {
    const older = createItem({
      id: UUID,
      createdAt: new Date('2026-08-13T00:00:00Z'),
    });
    const newer = createItem({
      id: OTHER_UUID,
      createdAt: new Date('2026-08-13T01:00:00Z'),
    });
    const items = [newer, older];

    groupShoppingItems(items);

    expect(items).toEqual([newer, older]);
  });
});

describe('applyShoppingListAction', () => {
  const milk = createItem({ id: UUID, label: '牛乳' });
  const pork = createItem({ id: OTHER_UUID, label: '豚肉', checked: true });

  it('項目を末尾に追加する', () => {
    expect(
      applyShoppingListAction([milk], { type: 'add', item: pork }),
    ).toEqual([milk, pork]);
  });

  it('指定した項目のチェックだけを切り替える', () => {
    expect(
      applyShoppingListAction([milk, pork], {
        type: 'toggle',
        id: milk.id,
        checked: true,
      }),
    ).toEqual([{ ...milk, checked: true }, pork]);
  });

  it('知らない ID の切り替えは何も変えない', () => {
    const items = [milk, pork];

    expect(
      applyShoppingListAction(items, {
        type: 'toggle',
        id: 'unknown',
        checked: true,
      }),
    ).toEqual(items);
  });

  it('チェック済みだけをまとめて消す', () => {
    expect(
      applyShoppingListAction([milk, pork], { type: 'clearChecked' }),
    ).toEqual([milk]);
  });

  it('元の配列を変更しない', () => {
    const items = [milk, pork];

    applyShoppingListAction(items, {
      type: 'toggle',
      id: milk.id,
      checked: true,
    });
    applyShoppingListAction(items, { type: 'clearChecked' });

    expect(items).toEqual([milk, pork]);
    expect(milk.checked).toBe(false);
  });
});
