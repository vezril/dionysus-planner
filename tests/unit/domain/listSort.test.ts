import { describe, expect, it } from "vitest";
import { compareSortValues, nextSortState, sortRows } from "@/domain/listSort";

/** openspec: sortable-columns — pure sort semantics. */
describe("listSort", () => {
  it("strings compare case-insensitively and numerically", () => {
    expect(compareSortValues("apple", "Banana", "asc")).toBeLessThan(0);
    expect(compareSortValues("item 2", "item 10", "asc")).toBeLessThan(0);
    expect(compareSortValues("apple", "Banana", "desc")).toBeGreaterThan(0);
  });

  it("numbers compare numerically both directions", () => {
    expect(compareSortValues(2, 10, "asc")).toBeLessThan(0);
    expect(compareSortValues(2, 10, "desc")).toBeGreaterThan(0);
  });

  it("nulls sort last regardless of direction", () => {
    const rows = [{ v: null }, { v: 5 }, { v: 1 }];
    expect(sortRows(rows, (row) => row.v, "asc").map((row) => row.v)).toEqual([1, 5, null]);
    expect(sortRows(rows, (row) => row.v, "desc").map((row) => row.v)).toEqual([5, 1, null]);
  });

  it("sortRows is stable on ties", () => {
    const rows = [
      { v: 1, tag: "a" },
      { v: 1, tag: "b" },
      { v: 0, tag: "c" },
    ];
    expect(sortRows(rows, (row) => row.v, "asc").map((row) => row.tag)).toEqual(["c", "a", "b"]);
  });

  it("nextSortState: new column ascending, same column flips", () => {
    expect(nextSortState(null, "name")).toEqual({ key: "name", direction: "asc" });
    expect(nextSortState({ key: "name", direction: "asc" }, "name")).toEqual({ key: "name", direction: "desc" });
    expect(nextSortState({ key: "name", direction: "desc" }, "name")).toEqual({ key: "name", direction: "asc" });
    expect(nextSortState({ key: "name", direction: "desc" }, "quantity")).toEqual({ key: "quantity", direction: "asc" });
  });
});
