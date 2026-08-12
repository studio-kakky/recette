import { describe, expect, it } from 'vitest';

import { createImageKey, isOwnedImageKey, toImageUrl } from './image-key';

describe('createImageKey', () => {
  it('users/<userId>/<uuid> の形のキーを採番する', () => {
    const key = createImageKey('user-1');

    expect(key).toMatch(
      /^users\/user-1\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('採番したキーは、そのユーザーのものと判定される', () => {
    expect(isOwnedImageKey(createImageKey('user-1'), 'user-1')).toBe(true);
  });

  it('毎回違うキーを返す（既存の画像を上書きしない）', () => {
    expect(createImageKey('user-1')).not.toBe(createImageKey('user-1'));
  });

  it('キーに使えないユーザー ID を弾く', () => {
    expect(() => createImageKey('user/1')).toThrow();
    expect(() => createImageKey('..')).toThrow();
    expect(() => createImageKey('')).toThrow();
  });
});

describe('isOwnedImageKey', () => {
  const key = createImageKey('user-1');

  it('他人のキーを拒否する', () => {
    expect(isOwnedImageKey(key, 'user-2')).toBe(false);
  });

  it('前方一致でごまかしたキーを拒否する', () => {
    expect(isOwnedImageKey(key, 'user-')).toBe(false);
    expect(isOwnedImageKey(createImageKey('user-12'), 'user-1')).toBe(false);
  });

  it('ディレクトリを遡るキーを拒否する', () => {
    expect(
      isOwnedImageKey(
        `users/user-1/../user-2/${crypto.randomUUID()}`,
        'user-1',
      ),
    ).toBe(false);
    expect(isOwnedImageKey('../../secret', 'user-1')).toBe(false);
  });

  it('形が違うキーを拒否する', () => {
    expect(isOwnedImageKey('', 'user-1')).toBe(false);
    expect(isOwnedImageKey('users/user-1', 'user-1')).toBe(false);
    expect(isOwnedImageKey('users/user-1/not-a-uuid', 'user-1')).toBe(false);
    expect(isOwnedImageKey(`${key}/extra`, 'user-1')).toBe(false);
    expect(
      isOwnedImageKey(`photos/user-1/${crypto.randomUUID()}`, 'user-1'),
    ).toBe(false);
  });
});

describe('toImageUrl', () => {
  it('配信ルートの URL を組み立てる', () => {
    expect(toImageUrl('users/user-1/abc')).toBe('/api/images/users/user-1/abc');
  });

  it('セグメントの区切りは残したままエスケープする', () => {
    expect(toImageUrl('users/user 1/a?b')).toBe(
      '/api/images/users/user%201/a%3Fb',
    );
  });
});
