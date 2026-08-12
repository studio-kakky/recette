import type { ImageStore, StoredImage } from '~/db/image-store';

import { createImageKey, isOwnedImageKey } from './image-key';
import { validateImageUpload } from './image-input';

/**
 * 画像の保存と取り出しのユースケース。
 *
 * 認可はキーの `users/<userId>/` プレフィックスだけで決まるので、DB を引かずに
 * 済む。`ImageStore` 越しにしか R2 を触らないため、偽の store を渡せば
 * 「他人のキーを弾く」までユニットテストで確かめられる。
 */

/** 画像として受け付けられないファイルを渡されたときのエラー。理由をそのまま画面に出す */
export class InvalidImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidImageError';
  }
}

/** 他人の画像キーを保存・削除しようとしたときのエラー */
export class ImageAccessDeniedError extends Error {
  constructor() {
    super('画像が見つかりません');
    this.name = 'ImageAccessDeniedError';
  }
}

/** アップロードで受け取るファイル。`File` でも同じ形なら何でもよい（テスト用） */
export type UploadedFile = {
  readonly type: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

/**
 * アップロードされた画像を保存し、採番したキーを返す。
 *
 * クライアントが縮小してから送ってくるが、それは信用せずここでも形式と
 * サイズを検証する。
 */
export const saveUploadedImage = async (
  images: ImageStore,
  userId: string,
  file: UploadedFile,
): Promise<string> => {
  const rejection = validateImageUpload(file);

  if (rejection !== null) {
    throw new InvalidImageError(rejection);
  }

  const key = createImageKey(userId);

  await images.put(key, await file.arrayBuffer(), file.type);

  return key;
};

/**
 * 自分の画像を取り出す。
 *
 * 他人のキー・壊れたキーは「無い」と同じ扱い（`null`）にして、他ユーザーの
 * 画像の存在を推測させない。
 */
export const readOwnedImage = async (
  images: ImageStore,
  userId: string,
  storageKey: string,
): Promise<StoredImage | null> => {
  if (!isOwnedImageKey(storageKey, userId)) {
    return null;
  }

  return images.get(storageKey);
};

/** 保存しようとしているキーがすべて自分のものであることを確かめる */
export const requireOwnedImageKeys = (
  userId: string,
  storageKeys: readonly string[],
): void => {
  if (storageKeys.some((key) => !isOwnedImageKey(key, userId))) {
    throw new ImageAccessDeniedError();
  }
};
