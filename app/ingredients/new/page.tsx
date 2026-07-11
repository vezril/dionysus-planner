import { IngredientForm } from "@/app/ingredients/_components/ingredient-form";

/**
 * S-302 create form (FR-2). Client component (ADR-002 — forms with local
 * state) rendered from a thin server page shell, per
 * tests/e2e/ingredient-edit.spec.ts's pinned contract: `<h1>` "Add
 * ingredient", then the shared field set + "Save" button.
 */
export default function NewIngredientPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Add ingredient</h1>
      <IngredientForm mode="create" />
    </div>
  );
}
