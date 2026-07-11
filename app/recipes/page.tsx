import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

// S-105 placeholder — real recipe list/CRUD lands in S-40x. Static RSC
// per ADR-002; no data fetching yet (architecture.md §5).
export default function RecipesPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Recipes</h1>
      <EmptyState description="No recipes yet — add your first recipe to start tracking nutrition and cookability.">
        <Button>Add your first recipe</Button>
      </EmptyState>
    </div>
  );
}
