import * as z from 'zod';

import { prepareImageForUpload } from './image-resize';

/**
 * ブラウザから画像をアップロードする。
 *
 * 保存そのものは `/api/images/upload`（`~/routes/api/images/upload`）が行う。
 * ここは縮小 → 送信 → キーの受け取りまでを 1 本にまとめる係。
 */

const IMAGE_UPLOAD_PATH = '/api/images/upload';

/** アップロードに失敗したときの汎用メッセージ（通信断など、理由が分からない場合） */
const FALLBACK_ERROR_MESSAGE =
  '画像を保存できませんでした。通信環境を確かめて、もう一度お試しください。';

const uploadedImageSchema = z.object({ storageKey: z.string().min(1) });
const errorResponseSchema = z.object({ message: z.string().min(1) });

/**
 * 画像 1 枚を保存し、DB に持たせるストレージキーを返す。
 *
 * 失敗時はそのまま画面に出せるメッセージを持つ `Error` を投げる。
 */
export const uploadImage = async (file: File): Promise<string> => {
  const body = new FormData();
  body.append('file', await prepareImageForUpload(file), file.name);

  const response = await fetch(IMAGE_UPLOAD_PATH, { method: 'POST', body });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    // サーバーが理由を返していれば（形式・サイズなど）それを見せる
    const parsed = errorResponseSchema.safeParse(payload);

    throw new Error(
      parsed.success ? parsed.data.message : FALLBACK_ERROR_MESSAGE,
    );
  }

  const parsed = uploadedImageSchema.safeParse(payload);

  if (!parsed.success) {
    throw new Error(FALLBACK_ERROR_MESSAGE);
  }

  return parsed.data.storageKey;
};
