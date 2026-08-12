import {
  createFileRoute,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';

import { RecipeForm } from '~/components/recipe-form';
import { RecipeNotFound } from '~/components/recipe-not-found';
import { fetchRecipeForEdit, fetchTagNames, updateRecipe } from '~/lib/recipe';

const EditRecipe = () => {
  const { recipe, tagOptions } = Route.useLoaderData();
  const { recipeId } = Route.useParams();
  const router = useRouter();
  const navigate = useNavigate();

  /** 編集の出入り口はどちらも詳細画面に揃える */
  const backToDetail = () =>
    navigate({ to: '/recipes/$recipeId', params: { recipeId } });

  // ヘッダー・ナビは共通シェル（`_authenticated.tsx`）が持つので、ここは本文だけを描く
  return (
    <RecipeForm
      initialValues={recipe}
      tagOptions={tagOptions}
      heading="レシピを編集"
      submitLabel="更新する"
      onSubmit={async (values) => {
        await updateRecipe({ data: { recipeId, recipe: values } });
        // 詳細のローダーが古い値を返さないよう、遷移前にキャッシュを捨てる
        await router.invalidate();
        await backToDetail();
      }}
      onCancel={() => void backToDetail()}
    />
  );
};

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
