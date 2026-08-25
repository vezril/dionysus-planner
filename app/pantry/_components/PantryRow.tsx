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
import { AdjustQuantityButton } from "./AdjustQuantityButton";
import { EatItemButton } from "./EatItemButton";
import { computeFreshness } from "@/domain/freshness";

export function PantryRow({ item }: { item: PantryListRow }) {
  const [editOpen, setEditOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  // openspec: pantry-freshness — age + shelf-life hint; hidden for
  // out-of-stock rows (nothing left to expire).
  const freshness = item.displayQuantity > 0 ? computeFreshness(item.stockedAt, item.shelfLifeDays, new Date()) : null;

  return (
    <li
      data-testid="pantry-row"
      // openspec: pantry-grid-watermark — fixed tracks on sm+ so the
      // quantity / freshness / action columns align across rows.
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 sm:grid sm:grid-cols-[minmax(0,1fr)_7rem_11rem_max-content]"
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
          className="rounded-sm border border-destructive/40 px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-destructive sm:justify-self-end"
        >
          Out of stock
        </span>
      ) : (
        <span className="text-sm text-muted-foreground font-mono tabular-nums sm:text-right">
          {item.displayQuantity} {item.displayUnit}
        </span>
      )}
      {freshness !== null ? (
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span data-testid="stocked-age">
            stocked {freshness.daysSinceStocked === 0 ? "today" : `${freshness.daysSinceStocked}d ago`}
          </span>
          {freshness.status === "expiring" ? (
            <span
              data-testid="freshness-expiring"
              className="rounded-sm border border-status-near/50 px-1.5 py-0.5 font-medium text-status-near"
            >
              ~{freshness.daysLeft}d left
            </span>
          ) : null}
          {freshness.status === "expired" ? (
            <span
              data-testid="freshness-expired"
              className="rounded-sm border border-destructive/50 px-1.5 py-0.5 font-medium text-destructive"
            >
              check it
            </span>
          ) : null}
        </span>
      ) : (
        // Empty cell keeps the grid tracks aligned for out-of-stock rows.
        <span aria-hidden className="hidden sm:block" />
      )}
      <div className="flex max-w-full flex-wrap justify-end gap-2 sm:justify-self-end">
        {/* openspec: pantry-quick-eat */}
        {item.readyToEat && item.displayQuantity > 0 ? <EatItemButton item={item} /> : null}
        {/* openspec: subrecipes-consume-qol */}
        {item.displayQuantity > 0 ? <AdjustQuantityButton item={item} /> : null}
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
