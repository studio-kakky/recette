import { describe, expect, it } from 'vitest';

import { formatDateLabel, isDateString, toDateInputValue } from './date';

describe('isDateString', () => {
  it('`YYYY-MM-DD` の実在する日付を通す', () => {
    expect(isDateString('2026-08-13')).toBe(true);
    // 2026 年は閏年ではないが、2028 年の 2 月 29 日は実在する
    expect(isDateString('2028-02-29')).toBe(true);
  });

  it('実在しない日付を弾く', () => {
    expect(isDateString('2026-02-30')).toBe(false);
    expect(isDateString('2026-13-01')).toBe(false);
    expect(isDateString('2026-00-10')).toBe(false);
    // Date が繰り上げてしまう値も弾けている
    expect(isDateString('2026-04-31')).toBe(false);
  });

  it('形が違う値を弾く', () => {
    expect(isDateString('')).toBe(false);
    expect(isDateString('2026-8-13')).toBe(false);
    expect(isDateString('2026/08/13')).toBe(false);
    expect(isDateString('2026-08-13T00:00:00Z')).toBe(false);
    expect(isDateString('きょう')).toBe(false);
  });
});

describe('toDateInputValue', () => {
  it('ローカル時刻の年月日を 0 埋めして返す', () => {
    expect(toDateInputValue(new Date(2026, 7, 13, 23, 59))).toBe('2026-08-13');
    expect(toDateInputValue(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });
});

describe('formatDateLabel', () => {
  it('曜日付きの日本語表記にする', () => {
    expect(formatDateLabel('2026-08-13')).toBe('2026年8月13日（木）');
    expect(formatDateLabel('2026-01-04')).toBe('2026年1月4日（日）');
  });

  it('日付として読めない値はそのまま返す', () => {
    expect(formatDateLabel('2026-02-30')).toBe('2026-02-30');
    expect(formatDateLabel('')).toBe('');
  });
});
