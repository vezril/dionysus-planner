import { getPantryList } from "@/data/pantry";
import { EmptyState } from "@/components/empty-state";
import { PantryItemForm } from "@/app/pantry/_components/PantryItemForm";

/**
 * S-304: Pantry view (RSC list via `data/pantry.ts` -> `pantryRepo`,
 * ADR-002). No pagination at NFR-3 scale (architecture.md §6 "Lists render
 * in full").
 *
 * Forced dynamic for the same reason as `/ingredients` (S-301): the
 * migrate-then-seed hook (architecture.md §6 Flow A) runs from
 * `instrumentation.ts` at server *boot*, not at `next build` time, and the
 * pantry itself changes at runtime (never seeded) — a statically
 * prerendered page would never reflect a newly added item.
 */
export const dynamic = "force-dynamic";

export default async function PantryPage() {
  const items = await getPantryList();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      {items.length === 0 ? (
        <>
          <h1 className="text-2xl font-semibold">Pantry</h1>
          <EmptyState description="Your pantry is empty — add items to start tracking what you have on hand.">
            <PantryItemForm triggerLabel="Add your first pantry item" />
          </EmptyState>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold">Pantry</h1>
            <PantryItemForm triggerLabel="Add pantry item" />
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {items.map((item) => (
              <li
                key={item.id}
                data-testid="pantry-row"
                className="flex items-center justify-between gap-4 py-3"
              >
                <span className="font-medium text-foreground">{item.ingredientName}</span>
                <span className="text-sm text-muted-foreground">
                  {item.displayQuantity} {item.displayUnit}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
