import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

// S-105 placeholder — real pantry list/CRUD lands in S-304. Static RSC
// per ADR-002; no data fetching yet (architecture.md §5).
export default function PantryPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Pantry</h1>
      <EmptyState description="Your pantry is empty — add items to start tracking what you have on hand.">
        <Button>Add your first pantry item</Button>
      </EmptyState>
    </div>
  );
}
