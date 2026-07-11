import { describe, expect, it } from "vitest";

// `domain/listFilters.ts` DOES NOT EXIST YET — this import fails to resolve
// until the implementer creates the module and its `filterByNameSubstring`
// export. This whole suite is intentionally RED. Do not "fix" it by
// loosening assertions; make it pass by implementing the module to this
// contract.
import { filterByNameSubstring } from "@/domain/listFilters";

// S-405 (docs/stories/S-405-recipe-tags.md) — `filterByTagsAll` DOES NOT
// EXIST YET either; this named import fails to resolve (or, if the module
// resolves but the export is missing, is `undefined` at call time) until
// the implementer adds it to `domain/listFilters.ts` alongside
// `filterByNameSubstring`. The `describe` blocks for it live at the bottom
// of this file, per the S-404 story's own Dev Notes ("S-405/S-406 extend
// it... with their own describe blocks below this one, in this same
// file") — the blocks above this point (S-404's own) are untouched.
import { filterByTagsAll } from "@/domain/listFilters";

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

/**
 * S-405: recipe tag filtering — pure tag-AND intersection predicate.
 *
 * Traces to docs/stories/S-405-recipe-tags.md AC2 ("Given the recipe list,
 * when one or more tags are selected in the tag filter, then only recipes
 * carrying ALL selected tags remain visible... composing with the FR-25
 * name search") and the story's own readiness-gate fix: the tag-AND
 * intersection predicate must live here as a framework-free, unit-tested
 * pure helper — `app/recipes`'s client list (and its e2e coverage in
 * tests/e2e/recipe-tags.spec.ts) merely WIRES this predicate to clickable
 * tag-filter chips; it does not re-implement the intersection logic.
 *
 * ============================ PINNED API SHAPE ============================
 * filterByTagsAll<T extends { tags: string[] }>(items: T[], selectedTags: string[]): T[]
 *
 * - Generic over any item shape carrying at least a `tags: string[]` field
 *   (recipe summaries/detail rows — the same "extend this module" pattern
 *   `filterByNameSubstring` established for S-404).
 * - Match rule: AND-intersection — an item matches iff its `tags` array
 *   contains EVERY string in `selectedTags` (story task: "item matches iff
 *   it carries ALL selected tags"). An item carrying tags BEYOND the
 *   selection still matches (extra tags never disqualify — story task:
 *   "item with extra tags still matches"). Missing even one selected tag
 *   excludes the item (story task: "missing any one selected tag fails").
 * - `selectedTags` empty (`[]`) matches EVERY item, in original order —
 *   never treated as "matches nothing" (story task: "empty selection
 *   matches all"), mirroring `filterByNameSubstring`'s empty-query rule.
 * - A `selectedTags` entry that no item's `tags` array contains anywhere
 *   returns an empty array (`[]`), never `undefined`/`null`, never throws.
 * - Matching is EXACT, case-sensitive string equality — tags are free text
 *   that this app deliberately never lowercase-folds when storing
 *   (docs/stories/S-405-recipe-tags.md Dev Notes: "do not lowercase-fold
 *   silently; store as typed"); a differently-cased selected tag (e.g.
 *   "quick" selected against a stored "Quick") does NOT match, since
 *   folding here would silently treat two distinct stored tag values as
 *   the same tag, contradicting that storage guarantee.
 * - Pure: never mutates `items`, any item, or any item's `tags` array —
 *   returns a NEW array, never the same reference as `items`.
 * ===========================================================================
 */
describe("filterByTagsAll — AND-intersection over selected tags (S-405 AC2, FR-16)", () => {
  interface TaggedItem {
    id: number;
    tags: string[];
  }

  function item(id: number, tags: string[]): TaggedItem {
    return { id, tags };
  }

  function idsOf(items: TaggedItem[]): number[] {
    return items.map((entry) => entry.id);
  }

  it("an item matches only when it carries EVERY selected tag (AND, not OR)", () => {
    const items = [item(1, ["quick", "vegetarian"]), item(2, ["quick"]), item(3, ["vegetarian"])];
    const result = filterByTagsAll(items, ["quick", "vegetarian"]);
    expect(idsOf(result)).toEqual([1]);
  });

  it("an item carrying tags BEYOND the selection still matches (extra tags never disqualify)", () => {
    const items = [item(1, ["quick", "vegetarian", "one-pot"])];
    const result = filterByTagsAll(items, ["quick", "vegetarian"]);
    expect(idsOf(result)).toEqual([1]);
  });

  it("missing even one selected tag excludes the item", () => {
    const items = [item(1, ["quick"]), item(2, ["quick", "vegetarian"])];
    const result = filterByTagsAll(items, ["quick", "vegetarian"]);
    expect(idsOf(result)).toEqual([2]);
  });

  it("an item with no tags at all never matches a non-empty selection", () => {
    const items = [item(1, [])];
    const result = filterByTagsAll(items, ["quick"]);
    expect(result).toEqual([]);
  });

  it("preserves the original relative order of matching items", () => {
    const items = [item(3, ["quick"]), item(1, ["quick", "vegetarian"]), item(2, ["quick"])];
    const result = filterByTagsAll(items, ["quick"]);
    expect(idsOf(result)).toEqual([3, 1, 2]);
  });
});

describe("filterByTagsAll — empty selection returns everything (story task: \"empty selection matches all\")", () => {
  it("an empty selectedTags array returns all items, unfiltered, in original order", () => {
    const items = [
      { id: 1, tags: ["quick"] },
      { id: 2, tags: [] },
      { id: 3, tags: ["vegetarian", "quick"] },
    ];
    const result = filterByTagsAll(items, []);
    expect(result.map((entry: { id: number }) => entry.id)).toEqual([1, 2, 3]);
  });
});

describe("filterByTagsAll — an unknown selected tag returns an empty array (story task: \"unknown tag → empty\")", () => {
  it("a selected tag no item carries returns [] even when other selected tags DO match something", () => {
    const items = [
      { id: 1, tags: ["quick", "vegetarian"] },
      { id: 2, tags: ["quick"] },
    ];
    const result = filterByTagsAll(items, ["quick", "no-such-tag"]);
    expect(result).toEqual([]);
  });

  it("a single unknown selected tag against a non-empty item list returns []", () => {
    const items = [{ id: 1, tags: ["quick"] }];
    const result = filterByTagsAll(items, ["no-such-tag"]);
    expect(result).toEqual([]);
  });
});

describe("filterByTagsAll — exact, case-sensitive match (tags are never silently case-folded — story Dev Notes)", () => {
  it("does NOT match a differently-cased stored tag against a selected tag of the same word", () => {
    const items = [{ id: 1, tags: ["Quick"] }];
    const result = filterByTagsAll(items, ["quick"]);
    expect(result).toEqual([]);
  });

  it("matches when the stored tag's case exactly matches the selected tag's case", () => {
    const items = [{ id: 1, tags: ["Quick"] }];
    const result = filterByTagsAll(items, ["Quick"]);
    expect(result.map((entry: { id: number }) => entry.id)).toEqual([1]);
  });
});

describe("filterByTagsAll — purity (no mutation of input)", () => {
  it("does not mutate the input items array or any item's tags array", () => {
    const original = [
      { id: 1, tags: ["quick", "vegetarian"] },
      { id: 2, tags: ["quick"] },
    ];
    const snapshot = original.map((entry) => ({ ...entry, tags: [...entry.tags] }));

    const result = filterByTagsAll(original, ["quick"]);

    expect(original).toEqual(snapshot);
    expect(original).toHaveLength(2);
    expect(result[0]).toBe(original[0]);
  });

  it("returns a NEW array instance, never the same reference as the input", () => {
    const original = [{ id: 1, tags: ["quick"] }];
    const result = filterByTagsAll(original, []);
    expect(result).not.toBe(original);
  });

  it("does not mutate the input array even when selectedTags matches nothing", () => {
    const original = [{ id: 1, tags: ["quick"] }];
    const snapshot = original.map((entry) => ({ ...entry, tags: [...entry.tags] }));
    filterByTagsAll(original, ["no-such-tag"]);
    expect(original).toEqual(snapshot);
  });
});
