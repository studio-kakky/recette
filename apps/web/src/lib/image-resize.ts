/**
 * アップロード前のクライアント側の縮小。
 *
 * R2 も D1 も無料枠での運用なので、端末で撮ったままの数 MB を送らずに
 * 「読める大きさ」まで落としてから送る。縮小に失敗した場合（対応していない
 * 形式の HEIC など）は元のファイルをそのまま返し、保存自体は諦めない。
 */

/** 縮小後の長辺の目安。本のページの文字が読める程度には残す */
export const RESIZE_MAX_EDGE = 1600;

/** JPEG の品質。写真としての見た目とサイズの折り合い */
export const RESIZE_QUALITY = 0.8;

export type ImageSize = {
  readonly width: number;
  readonly height: number;
};

/**
 * 長辺が `maxEdge` に収まるよう、縦横比を保った寸法を返す。
 *
 * すでに収まっている画像は拡大しない（元のまま返す）。
 *
 * @example
 * fitWithin({ width: 3200, height: 2400 }, 1600); // { width: 1600, height: 1200 }
 */
export const fitWithin = (size: ImageSize, maxEdge: number): ImageSize => {
  const longEdge = Math.max(size.width, size.height);

  if (longEdge <= maxEdge || longEdge === 0) {
    return { width: size.width, height: size.height };
  }

  const scale = maxEdge / longEdge;

  // 1px を下回らないように丸める（極端に細長い画像でも 0 にしない）
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
};

/** Canvas に描き直して JPEG の Blob にする */
const toResizedJpeg = async (file: File): Promise<Blob> => {
  // EXIF の向きを反映させてから描く（スマホの縦写真が寝ないようにする）
  const bitmap = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  });

  try {
    const size = fitWithin(bitmap, RESIZE_MAX_EDGE);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;

    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas の 2D コンテキストを取得できませんでした');
    }

    context.drawImage(bitmap, 0, 0, size.width, size.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', RESIZE_QUALITY),
    );

    if (!blob) {
      throw new Error('画像を JPEG に変換できませんでした');
    }

    return blob;
  } finally {
    bitmap.close();
  }
};

/**
 * アップロードする Blob を作る。
 *
 * 縮小できなければ元のファイルを返す（サーバー側の上限に引っかかれば、
 * そこで「大きすぎる」と案内される）。
 */
export const prepareImageForUpload = async (file: File): Promise<Blob> => {
  try {
    const resized = await toResizedJpeg(file);

    // 元のほうが小さいこともある（すでに圧縮済みの小さな PNG など）
    return resized.size < file.size ? resized : file;
  } catch {
    return file;
  }
};
