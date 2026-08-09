import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '~/lib/auth.server';

/**
 * better-auth のハンドラ。`/api/auth/*` への GET / POST をすべてここで受ける
 * （サインイン開始・OAuth コールバック・セッション取得・サインアウトなど）。
 */
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => getAuth().handler(request),
      POST: ({ request }) => getAuth().handler(request),
    },
  },
});
