import { describe, expect, it } from 'vitest';

import { fitWithin } from './image-resize';

describe('fitWithin', () => {
  it('長辺を上限に合わせ、縦横比を保つ', () => {
    expect(fitWithin({ width: 3200, height: 2400 }, 1600)).toEqual({
      width: 1600,
      height: 1200,
    });
  });

  it('縦長の写真も長辺で判定する', () => {
    expect(fitWithin({ width: 2400, height: 3200 }, 1600)).toEqual({
      width: 1200,
      height: 1600,
    });
  });

  it('上限に収まっている画像は拡大しない', () => {
    expect(fitWithin({ width: 800, height: 600 }, 1600)).toEqual({
      width: 800,
      height: 600,
    });
    expect(fitWithin({ width: 1600, height: 1600 }, 1600)).toEqual({
      width: 1600,
      height: 1600,
    });
  });

  it('極端に細長い画像でも 0px にしない', () => {
    expect(fitWithin({ width: 4000, height: 1 }, 1600)).toEqual({
      width: 1600,
      height: 1,
    });
  });

  it('大きさを取れなかった画像はそのまま返す', () => {
    expect(fitWithin({ width: 0, height: 0 }, 1600)).toEqual({
      width: 0,
      height: 0,
    });
  });
});
