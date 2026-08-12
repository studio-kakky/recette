import { describe, expect, it } from 'vitest';

import {
  LIKE_ESCAPE_CHARACTER,
  escapeLikePattern,
  toLikeContainsPattern,
} from './like';

describe('escapeLikePattern', () => {
  it('メタ文字を含まない語はそのまま返す', () => {
    expect(escapeLikePattern('カレー')).toBe('カレー');
    expect(escapeLikePattern('rice & beans')).toBe('rice & beans');
  });

  it('% を打ち消す（「100%」で全件ヒットしない）', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%');
    expect(escapeLikePattern('%%')).toBe('\\%\\%');
  });

  it('_ を打ち消す（任意の 1 文字として解釈させない）', () => {
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
  });

  it('エスケープ文字そのものも打ち消す', () => {
    expect(escapeLikePattern('\\')).toBe('\\\\');
    // `\%` は「バックスラッシュ + %」を探す意図なので、両方を打ち消す
    expect(escapeLikePattern('\\%')).toBe('\\\\\\%');
  });

  it('打ち消した結果にはメタ文字が素のままでは残らない', () => {
    const escaped = escapeLikePattern('_50%_off\\');

    // エスケープ文字が直前に付いていない `%` `_` が無いことを確かめる
    expect(/(^|[^\\])(\\\\)*[%_]/.test(escaped)).toBe(false);
    expect(LIKE_ESCAPE_CHARACTER).toBe('\\');
  });
});

describe('toLikeContainsPattern', () => {
  it('前後にワイルドカードを足した部分一致パターンを作る', () => {
    expect(toLikeContainsPattern('カレー')).toBe('%カレー%');
  });

  it('語に含まれるメタ文字だけを打ち消す', () => {
    expect(toLikeContainsPattern('50%')).toBe('%50\\%%');
    expect(toLikeContainsPattern('a_b')).toBe('%a\\_b%');
  });

  it('空文字は全件一致のパターンになる', () => {
    expect(toLikeContainsPattern('')).toBe('%%');
  });
});
