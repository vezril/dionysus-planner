"use client";

/** openspec: sortable-columns — a clickable column title. First click
 * sorts ascending, a second flips; the active column shows ▲/▼ and
 * carries aria-sort for assistive tech. */
import type { SortDirection } from "@/domain/listSort";

export function SortButton({
  label,
  active,
  direction,
  onClick,
  className = "",
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-testid={`sort-${label.toLowerCase().replace(/\s+/g, "-")}`}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : undefined}
      onClick={onClick}
      className={`flex items-center gap-1 text-xs font-medium uppercase tracking-wide transition-colors ${
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      } ${className}`}
    >
      {label}
      {active ? <span aria-hidden>{direction === "asc" ? "▲" : "▼"}</span> : null}
    </button>
  );
}
