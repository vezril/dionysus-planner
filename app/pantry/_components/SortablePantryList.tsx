"use client";

/** openspec: sortable-columns — a header row over the pantry's grid
 * tracks with clickable Name / Quantity / Stocked titles. Default order
 * is the server's (name); sorting is client-side over the loaded rows.
 * Quantity compares the displayed number (out-of-stock rows are 0). */
import { useMemo, useState } from "react";
import { SortButton } from "@/components/SortButton";
import type { PantryListRow } from "@/data/pantry";
import { nextSortState, sortRows, type SortState, type SortValue } from "@/domain/listSort";
import { PantryRow } from "./PantryRow";

const PICKERS: Record<string, (row: PantryListRow) => SortValue> = {
  name: (row) => row.ingredientName,
  quantity: (row) => row.displayQuantity,
  stocked: (row) => row.stockedAt ?? null,
};

export function SortablePantryList({ items }: { items: PantryListRow[] }) {
  const [sort, setSort] = useState<SortState | null>(null);

  const sorted = useMemo(() => {
    if (sort === null) return items;
    return sortRows(items, PICKERS[sort.key] ?? PICKERS.name, sort.direction);
  }, [items, sort]);

  const header = (key: string, label: string, className = "") => (
    <SortButton
      label={label}
      active={sort?.key === key}
      direction={sort?.key === key ? sort.direction : "asc"}
      onClick={() => setSort((current) => nextSortState(current, key))}
      className={className}
    />
  );

  return (
    <div className="flex flex-col">
      <div className="hidden items-center gap-x-4 border-b border-border pb-2 sm:grid sm:grid-cols-[minmax(0,1fr)_7rem_11rem_max-content]">
        {header("name", "Name")}
        {header("quantity", "Quantity", "justify-self-end")}
        {header("stocked", "Stocked")}
        <span aria-hidden />
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {sorted.map((item) => (
          <PantryRow key={item.id} item={item} />
        ))}
      </ul>
    </div>
  );
}
