/**
 * 配列の要素を 1 つ隣へ動かした新しい配列を返す。
 *
 * 端を越える移動（先頭を上へ / 末尾を下へ）は何も起きず、元の配列をそのまま返す。
 * 材料・手順の行の並べ替えに使う。
 *
 * @example
 * moveItem(['a', 'b', 'c'], 2, 'up'); // ['a', 'c', 'b']
 */
export const moveItem = <T>(
  items: readonly T[],
  index: number,
  direction: 'up' | 'down',
): T[] => {
  const to = direction === 'up' ? index - 1 : index + 1;

  if (index < 0 || index >= items.length || to < 0 || to >= items.length) {
    return [...items];
  }

  // 2 要素を入れ替える。範囲は上で確認済みなので添字アクセスは必ず値を返す
  return items.map((item, currentIndex) => {
    if (currentIndex === index) {
      return items[to] as T;
    }
    if (currentIndex === to) {
      return items[index] as T;
    }

    return item;
  });
};
