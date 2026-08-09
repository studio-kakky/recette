import { describe, expect, it } from 'vitest';

import { formatIngredientLabel } from './ingredient';

describe('formatIngredientLabel', () => {
  it('数値と単位の分量を材料名の後ろに並べる', () => {
    expect(
      formatIngredientLabel('玉ねぎ', {
        type: 'quantity',
        value: 1,
        unit: '個',
      }),
    ).toBe('玉ねぎ 1個');
  });

  it('小数の分量は余分な 0 を落とす', () => {
    expect(
      formatIngredientLabel('しょうゆ', {
        type: 'quantity',
        value: 0.5,
        unit: '大さじ',
      }),
    ).toBe('しょうゆ 0.5大さじ');
    expect(
      formatIngredientLabel('水', {
        type: 'quantity',
        value: 200.0,
        unit: 'ml',
      }),
    ).toBe('水 200ml');
  });

  it('「少々」のような数値でない分量をそのまま並べる', () => {
    expect(formatIngredientLabel('塩', { type: 'note', text: '少々' })).toBe(
      '塩 少々',
    );
  });

  it('分量がなければ材料名だけを返す', () => {
    expect(formatIngredientLabel('こしょう')).toBe('こしょう');
  });

  it('分量が空文字なら材料名だけを返す', () => {
    expect(
      formatIngredientLabel('こしょう', { type: 'note', text: '  ' }),
    ).toBe('こしょう');
  });

  it('材料名の前後の空白を取り除く', () => {
    expect(
      formatIngredientLabel('  にんじん  ', {
        type: 'quantity',
        value: 2,
        unit: '本',
      }),
    ).toBe('にんじん 2本');
  });

  it('材料名が空なら例外を投げる', () => {
    expect(() => formatIngredientLabel('   ')).toThrow('材料名が空です');
  });
});
