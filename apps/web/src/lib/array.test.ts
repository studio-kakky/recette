import { describe, expect, it } from 'vitest';

import { moveItem } from './array';

describe('moveItem', () => {
  it('要素を 1 つ上へ動かす', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 'up')).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 1, 'up')).toEqual(['b', 'a', 'c']);
  });

  it('要素を 1 つ下へ動かす', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 'down')).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 'down')).toEqual(['a', 'c', 'b']);
  });

  it('端を越える移動は何も起きない', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 'up')).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 'down')).toEqual(['a', 'b', 'c']);
  });

  it('範囲外の添字を渡しても壊れない', () => {
    expect(moveItem(['a', 'b'], -1, 'down')).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 5, 'up')).toEqual(['a', 'b']);
    expect(moveItem([], 0, 'up')).toEqual([]);
  });

  it('元の配列を書き換えない', () => {
    const items = ['a', 'b'];

    expect(moveItem(items, 0, 'down')).not.toBe(items);
    expect(items).toEqual(['a', 'b']);
  });
});
