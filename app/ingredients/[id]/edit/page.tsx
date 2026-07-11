import { notFound } from "next/navigation";
import { DeleteIngredientButton } from "@/app/ingredients/_components/delete-ingredient-button";
import { IngredientForm } from "@/app/ingredients/_components/ingredient-form";
import { getIngredientRecordById } from "@/data/ingredients";

/**
 * S-302 edit/override form (FR-3). RSC wrapper (ADR-002) that fetches the
 * target ingredient directly through the data layer (never through
 * `/api/ingredients`, mirroring `/app/ingredients/page.tsx`'s own note) and
 * hands it to the shared client form pre-filled, per
 * tests/e2e/ingredient-edit.spec.ts's pinned contract. A bad/missing id
 * renders the app's `not-found.tsx` boundary (architecture.md §6).
 *
 * Forced dynamic so a save-then-revisit round trip (the e2e suite's
 * persistence assertion) always reads the current DB state, not a cached
 * render — same rationale as the catalog page.
 */
export const dynamic = "force-dynamic";

export default async function EditIngredientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ingredientId = Number(id);

  if (!Number.isInteger(ingredientId) || ingredientId <= 0) {
    notFound();
  }

  const ingredient = await getIngredientRecordById(ingredientId);
  if (!ingredient) {
    notFound();
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Edit ingredient</h1>
      <IngredientForm
        mode="edit"
        ingredientId={ingredient.id}
        initialValues={{
          name: ingredient.name,
          unitClass: ingredient.unitClass,
          caloriesPerRef: ingredient.caloriesPerRef,
          proteinPerRef: ingredient.proteinPerRef,
          carbsPerRef: ingredient.carbsPerRef,
          fatPerRef: ingredient.fatPerRef,
          fiberPerRef: ingredient.fiberPerRef,
          sugarPerRef: ingredient.sugarPerRef,
          sodiumMgPerRef: ingredient.sodiumMgPerRef,
          densityGPerMl: ingredient.densityGPerMl,
        }}
      />
      {ingredient.source === "CUSTOM" ? <DeleteIngredientButton ingredientId={ingredient.id} /> : null}
    </div>
  );
}
