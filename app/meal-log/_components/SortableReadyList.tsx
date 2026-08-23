"use client";

/** openspec: sortable-columns — Name / Portions column titles over the
 * Inventory ready-to-consume rows. */
import { useMemo, useState } from "react";
import { SortButton } from "@/components/SortButton";
import { nextSortState, sortRows, type SortState, type SortValue } from "@/domain/listSort";
import { LogPortionButton } from "../batches/_components/LogPortionButton";

export interface ReadyRow {
  recipeId: number;
  name: string;
  totalPortions: number;
  oldestBatchId: number | null;
}

const PICKERS: Record<string, (row: ReadyRow) => SortValue> = {
  name: (row) => row.name,
  portions: (row) => row.totalPortions,
};

export function SortableReadyList({ rows }: { rows: ReadyRow[] }) {
  const [sort, setSort] = useState<SortState | null>(null);

  const sorted = useMemo(() => {
    if (sort === null) return rows;
    return sortRows(rows, PICKERS[sort.key] ?? PICKERS.name, sort.direction);
  }, [rows, sort]);

  const header = (key: string, label: string) => (
    <SortButton
      label={label}
      active={sort?.key === key}
      direction={sort?.key === key ? sort.direction : "asc"}
      onClick={() => setSort((current) => nextSortState(current, key))}
    />
  );

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-4 border-b border-border pb-2">
        {header("name", "Name")}
        {header("portions", "Portions")}
      </div>
      <ul data-testid="ready-to-consume" className="flex flex-col divide-y divide-border">
        {sorted.map((row) => (
          <li
            key={row.recipeId}
            data-testid="ready-to-consume-row"
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2"
          >
            <span className="text-sm font-medium">{row.name}</span>
            <span className="text-sm text-muted-foreground">{row.totalPortions} portions</span>
            {row.oldestBatchId !== null ? <LogPortionButton batchId={row.oldestBatchId} /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
