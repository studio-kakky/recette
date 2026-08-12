import { createFileRoute } from '@tanstack/react-router';
import { ShoppingBasket } from 'lucide-react';

/**
 * 買い物リストのプレースホルダー。
 *
 * 中身は後続で実装するが、下部タブバーの行き先として先にルートだけ用意しておく。
 */
const ShoppingList = () => (
  <section className="flex flex-col gap-4">
    <h1 className="font-heading text-2xl font-bold tracking-tight">
      買い物リスト
    </h1>
    <div className="bg-card border-border flex flex-col items-center gap-3 rounded-2xl border px-6 py-12 text-center">
      <ShoppingBasket className="text-primary size-8" aria-hidden="true" />
      <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
        レシピの材料から買い物リストを作れるようになります。
        <br />
        もう少しお待ちください。
      </p>
    </div>
  </section>
);

export const Route = createFileRoute('/_authenticated/shopping-list')({
  component: ShoppingList,
});
