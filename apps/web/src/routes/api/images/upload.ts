import { createFileRoute } from '@tanstack/react-router';

import { getImageStore } from '~/db/image-store';
import { getOptionalUserFromRequest } from '~/lib/auth.server';
import { InvalidImageError, saveUploadedImage } from '~/lib/image-service';

/**
 * 画像のアップロード。`multipart/form-data` の `file` を 1 枚受け取り、
 * R2 に保存して採番したキーを返す。
 *
 * レシピ本体より先に画像だけを保存する形にしているのは、フォームで
 * 「添付した順に並べ替える」操作をするのに実体の URL が要るため。
 * 保存されなかった（フォームを破棄した）画像は R2 に残るが、MVP では許容する。
 */

const json = (body: unknown, status: number): Response =>
  Response.json(body, { status });

export const Route = createFileRoute('/api/images/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await getOptionalUserFromRequest(request);

        if (!user) {
          return json({ message: 'ログインしてください。' }, 401);
        }

        const form = await request.formData().catch(() => null);
        const file = form?.get('file');

        if (!(file instanceof File)) {
          return json({ message: '画像ファイルを選んでください。' }, 400);
        }

        try {
          const storageKey = await saveUploadedImage(
            getImageStore(),
            user.id,
            file,
          );

          return json({ storageKey }, 201);
        } catch (error) {
          // 形式・サイズの不備は理由をそのまま返す（画面でそのまま出せる文言）
          if (error instanceof InvalidImageError) {
            return json({ message: error.message }, 400);
          }

          throw error;
        }
      },
    },
  },
});
