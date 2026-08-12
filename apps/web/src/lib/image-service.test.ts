import { describe, expect, it } from 'vitest';

import type { ImageStore } from '~/db/image-store';

import { createImageKey, isOwnedImageKey } from './image-key';
import {
  ImageAccessDeniedError,
  InvalidImageError,
  readOwnedImage,
  requireOwnedImageKeys,
  saveUploadedImage,
} from './image-service';

/**
 * メモリ上の `ImageStore`。
 *
 * R2 を立てずに「他人のキーには一切触らない」ことまで確かめるため、
 * 呼ばれたキーを記録しておく。
 */
const createFakeImageStore = () => {
  const objects = new Map<string, { contentType: string; size: number }>();
  const readKeys: string[] = [];
  const deletedKeys: string[] = [];

  const store: ImageStore = {
    put: (key, body, contentType) => {
      objects.set(key, { contentType, size: body.byteLength });

      return Promise.resolve();
    },

    get: (key) => {
      readKeys.push(key);

      const object = objects.get(key);

      if (!object) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        body: new ReadableStream(),
        contentType: object.contentType,
        etag: `"${key}"`,
      });
    },

    deleteMany: (keys) => {
      deletedKeys.push(...keys);
      keys.forEach((key) => objects.delete(key));

      return Promise.resolve();
    },
  };

  return { store, objects, readKeys, deletedKeys };
};

/** アップロードされた画像 1 枚分のダミー */
const fakeFile = (type: string, size: number) => ({
  type,
  size,
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(size)),
});

describe('saveUploadedImage', () => {
  it('自分のキーで保存し、そのキーを返す', async () => {
    const { store, objects } = createFakeImageStore();

    const key = await saveUploadedImage(
      store,
      'user-1',
      fakeFile('image/jpeg', 128),
    );

    expect(isOwnedImageKey(key, 'user-1')).toBe(true);
    expect(objects.get(key)).toEqual({ contentType: 'image/jpeg', size: 128 });
  });

  it('画像以外は保存しない', async () => {
    const { store, objects } = createFakeImageStore();

    await expect(
      saveUploadedImage(store, 'user-1', fakeFile('application/pdf', 128)),
    ).rejects.toBeInstanceOf(InvalidImageError);
    expect(objects.size).toBe(0);
  });

  it('サイズ超過は保存しない', async () => {
    const { store, objects } = createFakeImageStore();

    await expect(
      saveUploadedImage(
        store,
        'user-1',
        fakeFile('image/jpeg', 10 * 1024 * 1024 + 1),
      ),
    ).rejects.toBeInstanceOf(InvalidImageError);
    expect(objects.size).toBe(0);
  });
});

describe('readOwnedImage', () => {
  it('自分の画像を返す', async () => {
    const { store } = createFakeImageStore();
    const key = await saveUploadedImage(
      store,
      'user-1',
      fakeFile('image/png', 64),
    );

    await expect(readOwnedImage(store, 'user-1', key)).resolves.toMatchObject({
      contentType: 'image/png',
    });
  });

  it('他人の画像は、存在してもストレージを引かずに null を返す', async () => {
    const { store, readKeys } = createFakeImageStore();
    const key = await saveUploadedImage(
      store,
      'user-1',
      fakeFile('image/png', 64),
    );

    await expect(readOwnedImage(store, 'user-2', key)).resolves.toBeNull();
    expect(readKeys).toEqual([]);
  });

  it('壊れたキー・遡るキーは null を返す', async () => {
    const { store, readKeys } = createFakeImageStore();

    await expect(readOwnedImage(store, 'user-1', '')).resolves.toBeNull();
    await expect(
      readOwnedImage(store, 'user-1', '../users/user-2/secret'),
    ).resolves.toBeNull();
    expect(readKeys).toEqual([]);
  });

  it('自分のキーでも実体が無ければ null を返す', async () => {
    const { store } = createFakeImageStore();

    await expect(
      readOwnedImage(store, 'user-1', createImageKey('user-1')),
    ).resolves.toBeNull();
  });
});

describe('requireOwnedImageKeys', () => {
  it('自分のキーだけなら何も起きない', () => {
    expect(() =>
      requireOwnedImageKeys('user-1', [
        createImageKey('user-1'),
        createImageKey('user-1'),
      ]),
    ).not.toThrow();
    expect(() => requireOwnedImageKeys('user-1', [])).not.toThrow();
  });

  it('他人のキーが 1 つでも混ざれば弾く', () => {
    expect(() =>
      requireOwnedImageKeys('user-1', [
        createImageKey('user-1'),
        createImageKey('user-2'),
      ]),
    ).toThrow(ImageAccessDeniedError);
  });
});
