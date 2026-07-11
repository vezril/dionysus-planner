/**
 * S-401 New Recipe page (docs/stories/S-401-recipe-create.md), UJ-2. Thin
 * wrapper around the shared `RecipeEditor` client component (S-402 Dev
 * Notes: "do not fork a second editor" — `/app/recipes/[id]/edit/page.tsx`
 * reuses the same component in edit mode).
 */
import { RecipeEditor } from "@/app/recipes/_components/recipe-editor";

export default function NewRecipePage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <RecipeEditor mode="create" />
    </div>
  );
}
