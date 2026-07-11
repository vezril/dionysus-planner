import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

// S-105 placeholder — real ingredient catalog lands in S-30x. Static RSC
// per ADR-002; no data fetching yet (architecture.md §5).
export default function IngredientsPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Ingredients</h1>
      <EmptyState description="No custom ingredients yet — the seeded catalog will appear here once loaded, or add your own.">
        <Button>Add an ingredient</Button>
      </EmptyState>
    </div>
  );
}
