import { describe, expect, it } from "vitest";

// `domain/listFilters.ts` DOES NOT EXIST YET — this import fails to resolve
// until the implementer creates the module and its `filterByNameSubstring`
// export. This whole suite is intentionally RED. Do not "fix" it by
// loosening assertions; make it pass by implementing the module to this
// contract.
import { filterByNameSubstring } from "@/domain/listFilters";

/**
 * S-404: recipe list search — pure substring-filter predicate.
 *
 * Traces to docs/stories/S-404-recipe-list-search.md AC2 ("Given the
 * search input, when the user types a substring, then the visible list
 * filters client-side, case-insensitive... FR-25") and the story's own
 * readiness-gate fix: the substring predicate must live here as a
 * framework-free, unit-tested pure helper — `app/recipes`'s client search
 * island (and its e2e coverage in tests/e2e/recipe-list.spec.ts) merely
 * WIRES this predicate to a controlled `<input>`; it does not re-implement
 * matching logic.
 *
 * `domain/listFilters.ts` is this story's own module (per the story's Dev
 * Notes: "this story creates the module; S-405/S-406 extend it" with their
 * own `describe` blocks below this one, in this same file, when their
 * turns come) — so this is a brand-new file, not an addition to an
 * existing suite.
 *
 * ============================ PINNED API SHAPE ============================
 * filterByNameSubstring<T extends { name: string }>(items: T[], query: string): T[]
 *
 * - Generic over any item shape carrying at least a `name: string` field
 *   (recipe rows, ingredient rows, etc. — the same predicate S-405/S-406
 *   extend for tags/sort/status, not a recipe-specific type).
 * - Match rule: case-insensitive substring of `item.name` against `query`
 *   (story: "chick" matches "Chicken Stir-Fry" and "Chickpea Soup", not
 *   "Pasta").
 * - `query` that is empty or whitespace-only (after trimming) returns ALL
 *   items, in original order — never treated as "matches nothing" (story
 *   task 21: "whitespace-only query treated as empty").
 * - No match anywhere returns an empty array (`[]`), never `undefined`/null
 *   and never throws.
 * - Pure: never mutates the input `items` array (or its elements) and
 *   returns a NEW array — callers (the client search island) rely on this
 *   for React state/memoization semantics.
 * ===========================================================================
 */

interface NamedItem {
  name: string;
}

function itemsOf(names: string[]): NamedItem[] {
  return names.map((name) => ({ name }));
}

function namesOf(items: NamedItem[]): string[] {
  return items.map((item) => item.name);
}

describe("filterByNameSubstring — case-insensitive substring match (story AC2, FR-25)", () => {
  it('"chick" matches both "Chicken Stir-Fry" and "Chickpea Soup", but not "Pasta"', () => {
    const items = itemsOf(["Chicken Stir-Fry", "Chickpea Soup", "Pasta"]);
    const result = filterByNameSubstring(items, "chick");
    expect(namesOf(result)).toEqual(["Chicken Stir-Fry", "Chickpea Soup"]);
  });

  it("matches regardless of the query's case (query uppercase, name lowercase-ish)", () => {
    const items = itemsOf(["Chicken Stir-Fry", "Pasta"]);
    const result = filterByNameSubstring(items, "CHICK");
    expect(namesOf(result)).toEqual(["Chicken Stir-Fry"]);
  });

  it("matches regardless of the item name's case (query lowercase, name uppercase-ish)", () => {
    const items = itemsOf(["CHICKEN STIR-FRY", "PASTA"]);
    const result = filterByNameSubstring(items, "chick");
    expect(namesOf(result)).toEqual(["CHICKEN STIR-FRY"]);
  });

  it("matches a substring anywhere within the name, not just a prefix", () => {
    const items = itemsOf(["Grilled Chicken Salad", "Pasta"]);
    const result = filterByNameSubstring(items, "chicken");
    expect(namesOf(result)).toEqual(["Grilled Chicken Salad"]);
  });

  it("preserves the original relative order of matching items", () => {
    const items = itemsOf(["Chickpea Soup", "Pasta", "Chicken Stir-Fry"]);
    const result = filterByNameSubstring(items, "chick");
    expect(namesOf(result)).toEqual(["Chickpea Soup", "Chicken Stir-Fry"]);
  });
});

describe("filterByNameSubstring — empty/whitespace query returns everything (story task 21)", () => {
  it("an empty string query returns all items, unfiltered", () => {
    const items = itemsOf(["Chicken Stir-Fry", "Chickpea Soup", "Pasta"]);
    const result = filterByNameSubstring(items, "");
    expect(namesOf(result)).toEqual(["Chicken Stir-Fry", "Chickpea Soup", "Pasta"]);
  });

  it("a whitespace-only query (spaces) is treated as empty and returns all items", () => {
    const items = itemsOf(["Chicken Stir-Fry", "Pasta"]);
    const result = filterByNameSubstring(items, "   ");
    expect(namesOf(result)).toEqual(["Chicken Stir-Fry", "Pasta"]);
  });

  it("a whitespace-only query (tabs/newlines) is treated as empty and returns all items", () => {
    const items = itemsOf(["Chicken Stir-Fry", "Pasta"]);
    const result = filterByNameSubstring(items, "\t\n  \t");
    expect(namesOf(result)).toEqual(["Chicken Stir-Fry", "Pasta"]);
  });

  it("an empty items array with an empty query returns an empty array, not an error", () => {
    const result = filterByNameSubstring([], "");
    expect(result).toEqual([]);
  });
});

describe("filterByNameSubstring — no-match query", () => {
  it("a query matching nothing returns an empty array", () => {
    const items = itemsOf(["Chicken Stir-Fry", "Chickpea Soup", "Pasta"]);
    const result = filterByNameSubstring(items, "zzz-no-such-recipe-zzz");
    expect(result).toEqual([]);
  });

  it("an empty items array with a non-empty query returns an empty array", () => {
    const result = filterByNameSubstring([], "chick");
    expect(result).toEqual([]);
  });
});

describe("filterByNameSubstring — leading/trailing whitespace on a real query is trimmed before matching", () => {
  it('"  chick  " matches the same items as "chick"', () => {
    const items = itemsOf(["Chicken Stir-Fry", "Pasta"]);
    const result = filterByNameSubstring(items, "  chick  ");
    expect(namesOf(result)).toEqual(["Chicken Stir-Fry"]);
  });
});

describe("filterByNameSubstring — purity (no mutation of input)", () => {
  it("does not mutate the input items array (length, order, or reference identity of elements)", () => {
    const original = itemsOf(["Chicken Stir-Fry", "Pasta"]);
    const snapshot = original.map((item) => ({ ...item }));

    const result = filterByNameSubstring(original, "chick");

    expect(original).toEqual(snapshot);
    expect(original).toHaveLength(2);
    // Filtering must not touch the caller's array elements: the matching
    // element returned should be reference-equal to the one still sitting
    // in the original input array.
    expect(result[0]).toBe(original[0]);
  });

  it("returns a NEW array instance, never the same array reference as the input", () => {
    const original = itemsOf(["Chicken Stir-Fry"]);
    const result = filterByNameSubstring(original, "");
    expect(result).not.toBe(original);
  });

  it("does not mutate the input array even when the query matches nothing", () => {
    const original = itemsOf(["Pasta"]);
    const snapshot = [...original];
    filterByNameSubstring(original, "chick");
    expect(original).toEqual(snapshot);
  });
});
