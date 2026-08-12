/**
 * アップロードされたファイルの検証。
 *
 * クライアントは縮小してから送るが、それを信用せずサーバー側でも同じ判定を通す。
 */

/**
 * 受け付ける画像の MIME タイプ。
 *
 * `image/*` をまるごと通さないのは、SVG（`image/svg+xml`）が自オリジンから
 * 返るとスクリプト実行の口になるため。表示できるラスタ画像だけに絞る。
 */
export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/heic',
  'image/heif',
] as const;

/** 1 枚あたりの上限。無料枠での運用のため、これより大きいものは受け取らない */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** ファイル選択ダイアログに渡す accept 属性 */
export const IMAGE_ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_TYPES.join(',');

/** `image/jpeg; charset=binary` のようなパラメータ付きの値もあるので落とす */
const toMimeType = (contentType: string): string =>
  contentType.split(';')[0]?.trim().toLowerCase() ?? '';

/**
 * 保存してよいファイルかを判定する。問題があればその理由を、無ければ `null` を返す。
 *
 * メッセージはそのまま画面に出す前提で書く。
 */
export const validateImageUpload = (file: {
  readonly type: string;
  readonly size: number;
}): string | null => {
  if (
    !(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(toMimeType(file.type))
  ) {
    return '画像ファイル（JPEG / PNG / WebP / GIF / HEIC）を選んでください。';
  }

  if (file.size <= 0) {
    return '空のファイルは保存できません。';
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return `画像は ${MAX_IMAGE_BYTES / 1024 / 1024}MB 以内にしてください。`;
  }

  return null;
};
