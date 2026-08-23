/** openspec: sortable-columns — pure list-sort helpers for the
 * clickable column titles. Framework-free. */

export type SortDirection = "asc" | "desc";

export type SortValue = string | number | null;

/** Case-insensitive strings, numeric numbers, nulls always LAST
 * regardless of direction. */
export function compareSortValues(a: SortValue, b: SortValue, direction: SortDirection): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const base =
    typeof a === "string" || typeof b === "string"
      ? String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true })
      : a - b;
  return direction === "asc" ? base : -base;
}

/** Stable sort by the picked value. */
export function sortRows<T>(rows: T[], pick: (row: T) => SortValue, direction: SortDirection): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const compared = compareSortValues(pick(left.row), pick(right.row), direction);
      return compared !== 0 ? compared : left.index - right.index;
    })
    .map((entry) => entry.row);
}

export interface SortState {
  key: string;
  direction: SortDirection;
}

/** Click behavior: new column → ascending; same column → flip. */
export function nextSortState(current: SortState | null, key: string): SortState {
  if (current?.key === key) {
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key, direction: "asc" };
}
