import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { EMPTY_RECIPE_FORM_VALUES, RecipeForm } from '~/components/recipe-form';
import { createRecipe, fetchTagNames } from '~/lib/recipe';

const NewRecipe = () => {
  const tagOptions = Route.useLoaderData();
  const navigate = useNavigate();

  // ヘッダー・ナビは共通シェル（`_authenticated.tsx`）が持つので、ここは本文だけを描く
  return (
    <RecipeForm
      initialValues={EMPTY_RECIPE_FORM_VALUES}
      tagOptions={tagOptions}
      heading="レシピを追加"
      submitLabel="保存する"
      onSubmit={async (values) => {
        const { recipeId } = await createRecipe({ data: values });
        // 保存できたことがそのまま見えるよう、作ったレシピの詳細へ送る
        await navigate({ to: '/recipes/$recipeId', params: { recipeId } });
      }}
      onCancel={() => void navigate({ to: '/' })}
    />
  );
};

export const Route = createFileRoute('/_authenticated/recipes/new')({
  loader: () => fetchTagNames(),
  component: NewRecipe,
});
