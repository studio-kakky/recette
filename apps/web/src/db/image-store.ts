import { env } from 'cloudflare:workers';

/**
 * 画像の実体（R2）を読み書きする永続化層。
 *
 * `~/db/recipe-store` と同じ考え方で、認可などのロジックはユースケース側
 * （`~/lib/image-service`）に置き、ここは言われたキーを put / get / delete する
 * だけに留める。偽の実装を渡せば R2 なしでユースケースをテストできる。
 */

/** R2 から読み出した画像。本文はストリームのまま返し、Worker 上で溜め込まない */
export type StoredImage = {
  readonly body: ReadableStream;
  readonly contentType: string;
  /** 条件付きリクエスト用。R2 が返す引用符付きの値をそのまま使う */
  readonly etag: string;
};

export type ImageStore = {
  put(key: string, body: ArrayBuffer, contentType: string): Promise<void>;
  /** 見つからなければ `null` */
  get(key: string): Promise<StoredImage | null>;
  deleteMany(keys: readonly string[]): Promise<void>;
};

/** content-type が分からないオブジェクト向けの保険（ブラウザに解釈させない） */
const FALLBACK_CONTENT_TYPE = 'application/octet-stream';

export const createImageStore = (bucket: R2Bucket): ImageStore => ({
  put: async (key, body, contentType) => {
    await bucket.put(key, body, { httpMetadata: { contentType } });
  },

  get: async (key) => {
    const object = await bucket.get(key);

    if (!object) {
      return null;
    }

    return {
      body: object.body,
      contentType: object.httpMetadata?.contentType ?? FALLBACK_CONTENT_TYPE,
      etag: object.httpEtag,
    };
  },

  deleteMany: async (keys) => {
    if (keys.length === 0) {
      return;
    }

    // R2 の一括削除は 1 回 1000 件まで。写真の枚数は 1 レシピ数十枚なので分割しない
    await bucket.delete([...keys]);
  },
});

/**
 * Server Function / サーバールートから使う R2 接続。
 *
 * `~/db/client` の `getDatabase()` と同じく、`cloudflare:workers` の `env` は
 * 実行中のリクエストのバインディングに解決されるため引き回さなくてよい。
 */
export const getImageStore = (): ImageStore => createImageStore(env.IMAGES);
