/**
 * R2 に置く画像のキーの組み立てと所有者判定。
 *
 * キーは `users/<userId>/<uuid>` の 3 セグメント固定。所有者をキー自身が持つので、
 * 配信時は DB を引かずにセッションのユーザー ID と突き合わせるだけで認可できる。
 */

/** キーに使えるユーザー ID。`/` や `.` を含まないことで、キーの偽装を防ぐ */
const USER_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** `users/<userId>/<uuid>` の形をしたキーだけを通す */
const IMAGE_KEY_PATTERN =
  /^users\/([A-Za-z0-9_-]+)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * 画像 1 枚分のキーを採番する。
 *
 * ファイル名は使わない（衝突・日本語・拡張子偽装をまとめて避けるため）。
 */
export const createImageKey = (userId: string): string => {
  if (!USER_ID_PATTERN.test(userId)) {
    throw new Error('画像キーに使えないユーザー ID です');
  }

  return `users/${userId}/${crypto.randomUUID()}`;
};

/**
 * キーがそのユーザーのものかを判定する。
 *
 * 形が合わないもの（セグメント数違い・`..` を含むもの・別ユーザーの ID を
 * 前方一致で被せたもの）はすべて false になる。
 */
export const isOwnedImageKey = (key: string, userId: string): boolean =>
  IMAGE_KEY_PATTERN.exec(key)?.[1] === userId;

/** 画像配信ルートの URL。`<img src>` にそのまま渡す */
export const toImageUrl = (storageKey: string): string =>
  `/api/images/${storageKey.split('/').map(encodeURIComponent).join('/')}`;
