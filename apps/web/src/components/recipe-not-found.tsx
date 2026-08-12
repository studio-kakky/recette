import { Link } from '@tanstack/react-router';

import { Button } from '~/components/ui/button';

/**
 * レシピが引けなかったときの本文。
 *
 * 存在しないレシピと他ユーザーのレシピはどちらもここに来る
 * （「他人のレシピが存在すること」を知られないよう区別しない）。
 */
export const RecipeNotFound = () => (
  <section className="flex flex-col items-center gap-4 py-12 text-center">
    <h1 className="font-heading text-xl font-bold">
      レシピが見つかりませんでした
    </h1>
    <p className="text-muted-foreground text-sm">
      削除されたか、URL が間違っている可能性があります。
    </p>
    <Button render={<Link to="/" />} size="lg">
      レシピ一覧へ戻る
    </Button>
  </section>
);
