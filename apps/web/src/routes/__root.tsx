import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { fetchOptionalUser } from '~/lib/session';
import appCss from '~/styles/app.css?url';

const RootDocument = ({ children }: Readonly<{ children: ReactNode }>) => (
  <html lang="ja">
    <head>
      <HeadContent />
    </head>
    <body>
      {children}
      <Scripts />
    </body>
  </html>
);

const RootComponent = () => (
  <RootDocument>
    <Outlet />
  </RootDocument>
);

export const Route = createRootRoute({
  /**
   * セッションはここで 1 度だけ取得し、`context.user` として子ルートへ配る
   * （SSR でも クライアント遷移でも走るので、ページごとに get-session を叩かずに済む）。
   */
  beforeLoad: async () => ({ user: await fetchOptionalUser() }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Recette' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootComponent,
});
