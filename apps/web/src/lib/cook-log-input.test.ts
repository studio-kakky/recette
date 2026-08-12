import { describe, expect, it } from 'vitest';

import {
  COOK_LOG_PHOTO_LIMIT,
  cookLogInputSchema,
  normalizeCookLogInput,
  normalizedCookLogInputSchema,
} from './cook-log-input';

/** 通るはずの入力。テストごとに一部だけ差し替えて使う */
const input = (values: Record<string, unknown> = {}) => ({
  cookedAt: '2026-08-13',
  memo: '',
  photos: [{ storageKey: 'users/user-owner/photo-1' }],
  ...values,
});

describe('cookLogInputSchema', () => {
  it('写真 1 枚と作った日があれば通る', () => {
    expect(cookLogInputSchema.safeParse(input()).success).toBe(true);
  });

  it('写真が 0 枚なら弾く', () => {
    const parsed = cookLogInputSchema.safeParse(input({ photos: [] }));

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(
      '写真を 1 枚以上選んでください',
    );
  });

  it('写真は上限までしか受け付けない', () => {
    const photos = Array.from({ length: COOK_LOG_PHOTO_LIMIT + 1 }, (_, i) => ({
      storageKey: `users/user-owner/photo-${i}`,
    }));

    expect(cookLogInputSchema.safeParse(input({ photos })).success).toBe(false);
  });

  it('空のストレージキーを弾く（写真が実質 0 枚になるため）', () => {
    expect(
      cookLogInputSchema.safeParse(input({ photos: [{ storageKey: ' ' }] }))
        .success,
    ).toBe(false);
  });

  it('作った日は `YYYY-MM-DD` の実在する日付だけを通す', () => {
    expect(
      cookLogInputSchema.safeParse(input({ cookedAt: '2026-02-30' })).success,
    ).toBe(false);
    expect(
      cookLogInputSchema.safeParse(input({ cookedAt: '2026/08/13' })).success,
    ).toBe(false);
    expect(cookLogInputSchema.safeParse(input({ cookedAt: '' })).success).toBe(
      false,
    );
  });

  it('過去日も未来日も受け付ける（今日の判定はブラウザ側の役目）', () => {
    expect(
      cookLogInputSchema.safeParse(input({ cookedAt: '2020-01-01' })).success,
    ).toBe(true);
    expect(
      cookLogInputSchema.safeParse(input({ cookedAt: '2099-12-31' })).success,
    ).toBe(true);
  });

  it('長すぎるメモを弾く', () => {
    expect(
      cookLogInputSchema.safeParse(input({ memo: 'あ'.repeat(1001) })).success,
    ).toBe(false);
  });

  it('前後の空白は落とす', () => {
    const parsed = cookLogInputSchema.parse(
      input({ cookedAt: ' 2026-08-13 ', memo: '  よく出来た  ' }),
    );

    expect(parsed).toEqual({
      cookedAt: '2026-08-13',
      memo: 'よく出来た',
      photos: [{ storageKey: 'users/user-owner/photo-1' }],
    });
  });
});

describe('normalizeCookLogInput', () => {
  it('メモが空なら未入力（null）にする', () => {
    expect(normalizeCookLogInput(cookLogInputSchema.parse(input())).memo).toBe(
      null,
    );
  });

  it('写真に order を振り、同じキーの重複は 1 行にまとめる', () => {
    const normalized = normalizeCookLogInput(
      cookLogInputSchema.parse(
        input({
          photos: [
            { storageKey: 'users/user-owner/photo-1' },
            { storageKey: 'users/user-owner/photo-2' },
            { storageKey: 'users/user-owner/photo-1' },
          ],
        }),
      ),
    );

    expect(normalized.photos).toEqual([
      { storageKey: 'users/user-owner/photo-1', order: 0 },
      { storageKey: 'users/user-owner/photo-2', order: 1 },
    ]);
  });
});

describe('normalizedCookLogInputSchema', () => {
  it('検証と正規化をまとめて行う', () => {
    expect(
      normalizedCookLogInputSchema.parse(input({ memo: 'ほくほく' })),
    ).toEqual({
      cookedAt: '2026-08-13',
      memo: 'ほくほく',
      photos: [{ storageKey: 'users/user-owner/photo-1', order: 0 }],
    });
  });

  it('写真が無ければ正規化まで進まない', () => {
    expect(
      normalizedCookLogInputSchema.safeParse(input({ photos: [] })).success,
    ).toBe(false);
  });
});
