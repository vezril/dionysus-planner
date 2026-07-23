import { notFound } from "next/navigation";
import { DeleteRecipeButton } from "@/app/recipes/_components/delete-recipe-button";
import { RecipeEditor } from "@/app/recipes/_components/recipe-editor";
import { getRecipeDetail } from "@/data/recipes";

/**
 * S-402 pre-filled recipe editor (docs/stories/S-402-recipe-edit-delete.md,
 * FR-14/FR-15). RSC wrapper (ADR-002) that fetches the target recipe
 * directly through the data layer and hands it to the shared `RecipeEditor`
 * client component in edit mode, pre-filled, per
 * tests/e2e/recipe-edit.spec.ts's pinned contract (reuses S-401's editor —
 * do not fork a second editor). A bad/missing id renders the app's
 * `not-found.tsx` boundary (architecture.md §6), mirroring
 * `/app/ingredients/[id]/edit/page.tsx`.
 *
 * Forced dynamic so a save-then-revisit round trip always reads the
 * current DB state, not a cached render — same rationale as the
 * ingredient edit page and the recipe detail page.
 */
export const dynamic = "force-dynamic";

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipeId = Number(id);

  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    notFound();
  }

  const detail = await getRecipeDetail(recipeId);
  if (!detail) {
    notFound();
  }

  const { recipe, tags } = detail;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <RecipeEditor
        mode="edit"
        recipeId={recipe.id}
        initialValues={{
          name: recipe.name,
          servings: recipe.servings,
          // openspec: cooklang-recipe-editor (design.md Decision 6) — the
          // stored `instructions` column already IS the typed body text,
          // mentions and all; no reconstruction from `lines` needed.
          body: recipe.instructions,
          tags,
        }}
      />
      <DeleteRecipeButton recipeId={recipe.id} />
    </div>
  );
}
