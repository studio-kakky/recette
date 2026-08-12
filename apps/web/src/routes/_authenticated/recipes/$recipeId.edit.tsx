import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';

import { RecipeForm } from '~/components/recipe-form';
import { Button } from '~/components/ui/button';
import { fetchRecipeForEdit, fetchTagNames, updateRecipe } from '~/lib/recipe';

const EditRecipe = () => {
  const { recipe, tagOptions } = Route.useLoaderData();
  const { recipeId } = Route.useParams();
  const navigate = useNavigate();

  // ヘッダー・ナビは共通シェル（`_authenticated.tsx`）が持つので、ここは本文だけを描く
  return (
    <RecipeForm
      initialValues={recipe}
      tagOptions={tagOptions}
      heading="レシピを編集"
      submitLabel="更新する"
      onSubmit={async (values) => {
        await updateRecipe({ data: { recipeId, recipe: values } });
        // レシピ詳細は未実装のため、保存後は一覧へ戻す
        await navigate({ to: '/' });
      }}
      onCancel={() => void navigate({ to: '/' })}
    />
  );
};

/** 存在しないレシピ・他ユーザーのレシピはどちらもここに来る */
const RecipeNotFound = () => (
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

export const Route = createFileRoute('/_authenticated/recipes/$recipeId/edit')({
  loader: async ({ params }) => {
    const [recipe, tagOptions] = await Promise.all([
      fetchRecipeForEdit({ data: { recipeId: params.recipeId } }),
      fetchTagNames(),
    ]);

    return { recipe, tagOptions };
  },
  component: EditRecipe,
  notFoundComponent: RecipeNotFound,
});
