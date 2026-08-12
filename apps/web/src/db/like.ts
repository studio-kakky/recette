/**
 * SQL の `LIKE` に渡すパターンを組み立てるためのヘルパー。
 *
 * 検索語はユーザーが自由に打つため、`%`（0 文字以上の任意）や `_`（任意の 1 文字）が
 * そのまま入ってくる。素通しすると「100%」で全件が引っかかるような誤ヒットになるので、
 * メタ文字はエスケープし、クエリ側では必ず `ESCAPE` 句を添えて使う。
 */

/** `LIKE ... ESCAPE` に渡すエスケープ文字 */
export const LIKE_ESCAPE_CHARACTER = '\\';

/**
 * `LIKE` のメタ文字（`%` `_`）とエスケープ文字自身を打ち消す。
 *
 * @example
 * escapeLikePattern('100%'); // → '100\\%'
 * escapeLikePattern('a_b'); // → 'a\\_b'
 */
export const escapeLikePattern = (value: string): string =>
  // エスケープ文字自身を先に処理する必要があるため、まとめて 1 回で置換する
  value.replace(/[\\%_]/g, (character) => LIKE_ESCAPE_CHARACTER + character);

/**
 * 部分一致（前後どちらにも文字があってよい）のパターンを作る。
 *
 * @example
 * toLikeContainsPattern('カレー'); // → '%カレー%'
 * toLikeContainsPattern('50%'); // → '%50\\%%'
 */
export const toLikeContainsPattern = (keyword: string): string =>
  `%${escapeLikePattern(keyword)}%`;
