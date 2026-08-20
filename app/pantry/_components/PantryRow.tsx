"use client";

/**
 * S-305 pantry row: row-scoped "Edit"/"Remove" affordances added to the
 * S-304 read-only row (docs/stories/S-305-pantry-edit-remove.md). A client
 * component (not the RSC list itself) so it can own the two dialogs' open
 * state; the list's data still comes entirely from the server (`/app/
 * pantry/page.tsx`) and is refreshed via `router.refresh()` after a
 * successful edit/remove, matching the add flow's existing pattern.
 */
import Link from "next/link";
import { useState } from "react";
import { EditPantryItemDialog } from "@/app/pantry/_components/EditPantryItemDialog";
import { RemovePantryItemDialog } from "@/app/pantry/_components/RemovePantryItemDialog";
import { Button } from "@/components/ui/button";
import type { PantryListRow } from "@/data/pantry";

export function PantryRow({ item }: { item: PantryListRow }) {
  const [editOpen, setEditOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  return (
    <li
      data-testid="pantry-row"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
    >
      {/* openspec: pantry-item-detail — the name links to the detail page;
          edit/remove affordances are untouched. */}
      <Link
        href={`/pantry/${item.id}`}
        className="min-w-0 break-words font-medium text-foreground hover:text-primary hover:underline"
      >
        {item.ingredientName}
      </Link>
      {/* openspec: custom-pantry-items — zero-quantity rows persist and
          render out-of-stock instead of a quantity. */}
      {item.displayQuantity === 0 ? (
        <span
          data-testid="out-of-stock"
          className="rounded-sm border border-destructive/40 px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-destructive"
        >
          Out of stock
        </span>
      ) : (
        <span className="text-sm text-muted-foreground font-mono tabular-nums">
          {item.displayQuantity} {item.displayUnit}
        </span>
      )}
      <div className="flex shrink-0 gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setEditOpen(true)}>
          Edit
        </Button>
        <Button type="button" size="sm" variant="destructive" onClick={() => setRemoveOpen(true)}>
          Remove
        </Button>
      </div>

      <EditPantryItemDialog item={item} open={editOpen} onOpenChange={setEditOpen} />
      <RemovePantryItemDialog item={item} open={removeOpen} onOpenChange={setRemoveOpen} />
    </li>
  );
}
