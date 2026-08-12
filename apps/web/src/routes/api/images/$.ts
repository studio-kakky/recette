import { createFileRoute } from '@tanstack/react-router';

import { getImageStore } from '~/db/image-store';
import { getOptionalUserFromRequest } from '~/lib/auth.server';
import { readOwnedImage } from '~/lib/image-service';

/**
 * 画像の配信。`/api/images/users/<userId>/<uuid>` で 1 枚を返す。
 *
 * R2 のバケットは公開せず、必ずここを通す。キーの `users/<userId>/` が
 * セッションのユーザーと一致しない場合は、存在を伏せて 404 にする。
 */

/**
 * キーは実体ごとに採番し直す（上書きしない）ので、長期間キャッシュしてよい。
 * 他人に配られないよう `private` を付ける。
 */
const CACHE_CONTROL = 'private, max-age=31536000, immutable';

export const Route = createFileRoute('/api/images/$')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await getOptionalUserFromRequest(request);

        if (!user) {
          return new Response(null, { status: 401 });
        }

        const image = await readOwnedImage(
          getImageStore(),
          user.id,
          params._splat ?? '',
        );

        if (!image) {
          return new Response(null, { status: 404 });
        }

        return new Response(image.body, {
          headers: {
            'Content-Type': image.contentType,
            'Cache-Control': CACHE_CONTROL,
            ETag: image.etag,
          },
        });
      },
    },
  },
});
