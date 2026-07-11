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

// S-406 (docs/stories/S-406-recipe-list-sort-filter.md) — `sortRecipes` and
// `matchesStatus` DO NOT EXIST YET either; these named imports fail to
// resolve (or are `undefined` at call time) until the implementer adds them
// to `domain/listFilters.ts` per the story's own task list ("IMPL:
// `sortRecipes(items, key, direction)` comparator and `matchesStatus(item,
// status)` predicate in `domain/listFilters.ts`"). Their `describe` blocks
// live at the bottom of this file, extending the same module the same way
// S-405's `filterByTagsAll` blocks do above.
import { sortRecipes, matchesStatus } from "@/domain/listFilters";

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

/**
 * S-406: recipe list sort — pure tri-key comparator over server-annotated
 * list items.
 *
 * Traces to docs/stories/S-406-recipe-list-sort-filter.md AC2 ("Given the
 * sort control, when the user selects name, servings, or
 * calories-per-serving (asc/desc), then the list reorders accordingly,
 * client-side... recipes with incomplete calories sort to the end under
 * calorie sort (deterministic rule)") and the story's own readiness-gate
 * fix: the comparator must live here as a framework-free, unit-tested pure
 * helper — `app/recipes`'s client list (and its e2e coverage in
 * tests/e2e/recipe-list-controls.spec.ts) merely WIRES this comparator to a
 * sort `<Select>`; it does not re-implement ordering logic.
 *
 * ============================ PINNED API SHAPE ============================
 * sortRecipes<T extends { name: string; servings: number; caloriesPerServing: number | null }>(
 *   items: T[],
 *   key: "name" | "servings" | "caloriesPerServing",
 *   direction: "asc" | "desc",
 * ): T[]
 *
 * - Generic over any item shape carrying at least `name`, `servings`, and
 *   `caloriesPerServing` (`data/recipes.ts`'s `AnnotatedRecipeSummary` —
 *   tests/integration/recipe-list-data.test.ts pins that producer — but this
 *   comparator itself takes no dependency on that module).
 * - `key: "name"` — orders by `name`, CASE-INSENSITIVELY (mirrors
 *   `filterByNameSubstring`'s own case-insensitive posture for this same
 *   list), `"asc"` A→Z, `"desc"` Z→A.
 * - `key: "servings"` — orders by the numeric `servings` field, `"asc"`
 *   ascending, `"desc"` descending.
 * - `key: "caloriesPerServing"` — orders by the numeric
 *   `caloriesPerServing` field among items where it is a `number`, `"asc"`
 *   ascending / `"desc"` descending among those; but ANY item whose
 *   `caloriesPerServing` is `null` (nutrition-incomplete, FR-19) sorts to
 *   the very END of the result, in EITHER direction — the readiness-gate's
 *   deterministic rule ("recipes with incomplete calories sort to the end
 *   regardless of direction"). Incomplete items are never split to the
 *   front, never interleaved among the complete items.
 * - Ties (equal `servings`, or equal `caloriesPerServing`, under those two
 *   keys) break by `name` ascending (case-insensitive), REGARDLESS of the
 *   requested direction — a single deterministic secondary order, not
 *   direction-reversed. Multiple `null`-`caloriesPerServing` items among
 *   themselves are likewise ordered by `name` ascending (deterministic tie
 *   behavior within the trailing incomplete group).
 * - Pure: never mutates `items` or any item; returns a NEW array, never the
 *   same reference as `items`.
 * ===========================================================================
 */
describe("sortRecipes — key: name (S-406 AC2, FR-27)", () => {
  interface Item {
    id: number;
    name: string;
    servings: number;
    caloriesPerServing: number | null;
  }

  function item(id: number, name: string, servings = 4, caloriesPerServing: number | null = 100): Item {
    return { id, name, servings, caloriesPerServing };
  }

  function namesOf(items: Item[]): string[] {
    return items.map((entry) => entry.name);
  }

  it('"asc" orders names A→Z', () => {
    const items = [item(1, "Pasta"), item(2, "Chicken Stir-Fry"), item(3, "Ants on a Log")];
    const result = sortRecipes(items, "name", "asc");
    expect(namesOf(result)).toEqual(["Ants on a Log", "Chicken Stir-Fry", "Pasta"]);
  });

  it('"desc" orders names Z→A', () => {
    const items = [item(1, "Pasta"), item(2, "Chicken Stir-Fry"), item(3, "Ants on a Log")];
    const result = sortRecipes(items, "name", "desc");
    expect(namesOf(result)).toEqual(["Pasta", "Chicken Stir-Fry", "Ants on a Log"]);
  });

  it("orders case-insensitively — a lowercase-leading name interleaves by letter, not banished by case", () => {
    const items = [item(1, "Zucchini Bread"), item(2, "apple Pie"), item(3, "Banana Bread")];
    const result = sortRecipes(items, "name", "asc");
    expect(namesOf(result)).toEqual(["apple Pie", "Banana Bread", "Zucchini Bread"]);
  });
});

describe("sortRecipes — key: servings", () => {
  interface Item {
    id: number;
    name: string;
    servings: number;
    caloriesPerServing: number | null;
  }

  function item(id: number, name: string, servings: number, caloriesPerServing: number | null = 100): Item {
    return { id, name, servings, caloriesPerServing };
  }

  it('"asc" orders by increasing servings', () => {
    const items = [item(1, "Big Batch", 12), item(2, "Solo Meal", 1), item(3, "Family Dinner", 4)];
    const result = sortRecipes(items, "servings", "asc");
    expect(result.map((entry) => entry.servings)).toEqual([1, 4, 12]);
  });

  it('"desc" orders by decreasing servings', () => {
    const items = [item(1, "Big Batch", 12), item(2, "Solo Meal", 1), item(3, "Family Dinner", 4)];
    const result = sortRecipes(items, "servings", "desc");
    expect(result.map((entry) => entry.servings)).toEqual([12, 4, 1]);
  });

  it("ties on equal servings break by name ascending, in EITHER direction (deterministic secondary order)", () => {
    const items = [item(1, "Zebra Stew", 4), item(2, "Apple Crisp", 4), item(3, "Mango Salad", 4)];

    const asc = sortRecipes(items, "servings", "asc");
    expect(asc.map((entry) => entry.name)).toEqual(["Apple Crisp", "Mango Salad", "Zebra Stew"]);

    const desc = sortRecipes(items, "servings", "desc");
    expect(desc.map((entry) => entry.name)).toEqual(["Apple Crisp", "Mango Salad", "Zebra Stew"]);
  });
});

describe(
  "sortRecipes — key: caloriesPerServing — incomplete (null) items ALWAYS sort last (readiness-gate rule)",
  () => {
    interface Item {
      id: number;
      name: string;
      servings: number;
      caloriesPerServing: number | null;
    }

    function item(id: number, name: string, caloriesPerServing: number | null): Item {
      return { id, name, servings: 4, caloriesPerServing };
    }

    it('"asc": numeric ascending among complete items, incomplete item trails at the end', () => {
      const items = [
        item(1, "High Cal", 800),
        item(2, "Incomplete", null),
        item(3, "Low Cal", 200),
        item(4, "Mid Cal", 500),
      ];
      const result = sortRecipes(items, "caloriesPerServing", "asc");
      expect(result.map((entry) => entry.name)).toEqual(["Low Cal", "Mid Cal", "High Cal", "Incomplete"]);
    });

    it('"desc": numeric descending among complete items, incomplete item STILL trails at the end (never the front)', () => {
      const items = [
        item(1, "High Cal", 800),
        item(2, "Incomplete", null),
        item(3, "Low Cal", 200),
        item(4, "Mid Cal", 500),
      ];
      const result = sortRecipes(items, "caloriesPerServing", "desc");
      expect(result.map((entry) => entry.name)).toEqual(["High Cal", "Mid Cal", "Low Cal", "Incomplete"]);
    });

    it("multiple incomplete items order by name ascending among themselves, trailing every complete item", () => {
      const items = [item(1, "Zeta Incomplete", null), item(2, "Complete", 300), item(3, "Alpha Incomplete", null)];

      const asc = sortRecipes(items, "caloriesPerServing", "asc");
      expect(asc.map((entry) => entry.name)).toEqual(["Complete", "Alpha Incomplete", "Zeta Incomplete"]);

      const desc = sortRecipes(items, "caloriesPerServing", "desc");
      expect(desc.map((entry) => entry.name)).toEqual(["Complete", "Alpha Incomplete", "Zeta Incomplete"]);
    });

    it("ties on equal caloriesPerServing values break by name ascending", () => {
      const items = [item(1, "Zebra Bowl", 400), item(2, "Apple Bowl", 400), item(3, "Mango Bowl", 400)];
      const result = sortRecipes(items, "caloriesPerServing", "asc");
      expect(result.map((entry) => entry.name)).toEqual(["Apple Bowl", "Mango Bowl", "Zebra Bowl"]);
    });

    it("all-null caloriesPerServing still produces a deterministic, name-ascending order (no crash)", () => {
      const items = [item(1, "Zebra", null), item(2, "Apple", null)];
      const result = sortRecipes(items, "caloriesPerServing", "desc");
      expect(result.map((entry) => entry.name)).toEqual(["Apple", "Zebra"]);
    });
  },
);

describe("sortRecipes — purity (no mutation of input)", () => {
  interface Item {
    id: number;
    name: string;
    servings: number;
    caloriesPerServing: number | null;
  }

  it("does not mutate the input items array or its element order", () => {
    const original: Item[] = [
      { id: 1, name: "Pasta", servings: 4, caloriesPerServing: 500 },
      { id: 2, name: "Ants on a Log", servings: 2, caloriesPerServing: 100 },
    ];
    const snapshot = original.map((entry) => ({ ...entry }));

    sortRecipes(original, "name", "asc");

    expect(original).toEqual(snapshot);
  });

  it("returns a NEW array instance, never the same reference as the input", () => {
    const original: Item[] = [{ id: 1, name: "Pasta", servings: 4, caloriesPerServing: 500 }];
    const result = sortRecipes(original, "name", "asc");
    expect(result).not.toBe(original);
  });
});

describe("sortRecipes — edge cases", () => {
  it("an empty array returns an empty array for any key/direction", () => {
    expect(sortRecipes([], "name", "asc")).toEqual([]);
    expect(sortRecipes([], "caloriesPerServing", "desc")).toEqual([]);
  });

  it("a single-item array returns an equivalent single-item array", () => {
    const items = [{ id: 1, name: "Solo", servings: 1, caloriesPerServing: 300 }];
    const result = sortRecipes(items, "servings", "desc");
    expect(result).toEqual(items);
  });
});

/**
 * S-406: recipe list cookability status filter — pure membership predicate
 * over the server-computed `cookability` annotation.
 *
 * Traces to docs/stories/S-406-recipe-list-sort-filter.md AC3 ("Given the
 * status filter, when 'Cookable Now' (or All / Near Match / Missing More)
 * is selected, then only that subset shows, consistent with FR-20's
 * classification at filter time... FR-26") — this predicate does NOT
 * reclassify anything itself (FR-20's cookable/near-match/missing-more
 * classification is `domain/matching.ts#computeCookableAndNearMatch`'s job,
 * wired server-side per Flow D and pinned at
 * tests/integration/recipe-list-data.test.ts); it only checks whether an
 * ALREADY-annotated item's `cookability` field matches a selected filter
 * value.
 *
 * ============================ PINNED API SHAPE ============================
 * matchesStatus<T extends { cookability: "COOKABLE" | "NEAR_MATCH" | "MISSING_MORE" }>(
 *   item: T,
 *   status: "ALL" | "COOKABLE" | "NEAR_MATCH" | "MISSING_MORE",
 * ): boolean
 *
 * - `status: "ALL"` — `true` for every item, regardless of `cookability`
 *   (mirrors `filterByNameSubstring`'s/`filterByTagsAll`'s own "empty
 *   selection matches everything" convention for this list).
 * - `status: "COOKABLE" | "NEAR_MATCH" | "MISSING_MORE"` — `true` iff
 *   `item.cookability` is EXACTLY that value, `false` otherwise. No partial
 *   or fuzzy matching.
 * - A single-item PREDICATE (not a list filter) — callers narrow a list via
 *   `items.filter((item) => matchesStatus(item, status))`, the same
 *   composition pattern `recipe-catalog.tsx` already uses for
 *   `filterByNameSubstring`/`filterByTagsAll` in sequence (story AC4:
 *   composes with search/tags/sort without a server round-trip).
 * - Pure: never mutates `item`.
 * ===========================================================================
 */
describe("matchesStatus — \"ALL\" matches every cookability value (S-406 AC3)", () => {
  interface Item {
    id: number;
    cookability: "COOKABLE" | "NEAR_MATCH" | "MISSING_MORE";
  }

  it.each([
    ["COOKABLE", 1],
    ["NEAR_MATCH", 2],
    ["MISSING_MORE", 3],
  ] as const)("cookability=%s matches status \"ALL\"", (cookability, id) => {
    const item: Item = { id, cookability };
    expect(matchesStatus(item, "ALL")).toBe(true);
  });
});

describe("matchesStatus — \"COOKABLE\" narrows to only COOKABLE items", () => {
  interface Item {
    id: number;
    cookability: "COOKABLE" | "NEAR_MATCH" | "MISSING_MORE";
  }

  it("returns true for a COOKABLE item", () => {
    expect(matchesStatus<Item>({ id: 1, cookability: "COOKABLE" }, "COOKABLE")).toBe(true);
  });

  it("returns false for a NEAR_MATCH item", () => {
    expect(matchesStatus<Item>({ id: 2, cookability: "NEAR_MATCH" }, "COOKABLE")).toBe(false);
  });

  it("returns false for a MISSING_MORE item", () => {
    expect(matchesStatus<Item>({ id: 3, cookability: "MISSING_MORE" }, "COOKABLE")).toBe(false);
  });
});

describe("matchesStatus — \"NEAR_MATCH\" narrows to only NEAR_MATCH items", () => {
  interface Item {
    id: number;
    cookability: "COOKABLE" | "NEAR_MATCH" | "MISSING_MORE";
  }

  it("returns true for a NEAR_MATCH item", () => {
    expect(matchesStatus<Item>({ id: 1, cookability: "NEAR_MATCH" }, "NEAR_MATCH")).toBe(true);
  });

  it("returns false for a COOKABLE item", () => {
    expect(matchesStatus<Item>({ id: 2, cookability: "COOKABLE" }, "NEAR_MATCH")).toBe(false);
  });

  it("returns false for a MISSING_MORE item", () => {
    expect(matchesStatus<Item>({ id: 3, cookability: "MISSING_MORE" }, "NEAR_MATCH")).toBe(false);
  });
});

describe("matchesStatus — \"MISSING_MORE\" narrows to only MISSING_MORE items", () => {
  interface Item {
    id: number;
    cookability: "COOKABLE" | "NEAR_MATCH" | "MISSING_MORE";
  }

  it("returns true for a MISSING_MORE item", () => {
    expect(matchesStatus<Item>({ id: 1, cookability: "MISSING_MORE" }, "MISSING_MORE")).toBe(true);
  });

  it("returns false for a COOKABLE item", () => {
    expect(matchesStatus<Item>({ id: 2, cookability: "COOKABLE" }, "MISSING_MORE")).toBe(false);
  });

  it("returns false for a NEAR_MATCH item", () => {
    expect(matchesStatus<Item>({ id: 3, cookability: "NEAR_MATCH" }, "MISSING_MORE")).toBe(false);
  });
});

describe("matchesStatus — composes as a list-narrowing predicate via Array#filter (S-406 AC4)", () => {
  interface Item {
    id: number;
    name: string;
    cookability: "COOKABLE" | "NEAR_MATCH" | "MISSING_MORE";
  }

  it("filtering a mixed list down to COOKABLE only keeps the cookable items, in original order", () => {
    const items: Item[] = [
      { id: 1, name: "Chicken Bowl", cookability: "COOKABLE" },
      { id: 2, name: "Rice Soup", cookability: "NEAR_MATCH" },
      { id: 3, name: "Garlic Broth Feast", cookability: "MISSING_MORE" },
      { id: 4, name: "Salad", cookability: "COOKABLE" },
    ];
    const result = items.filter((item) => matchesStatus(item, "COOKABLE"));
    expect(result.map((entry) => entry.name)).toEqual(["Chicken Bowl", "Salad"]);
  });
});
