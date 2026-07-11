import { describe, expect, it } from "vitest";
import { toCanonical, resolveQuantityForComparison } from "@/domain/units";
 
// not exist yet (S-104 is RED-by-design until the implementer builds it).
import { computeCookableAndNearMatch, type RankedRecipe, type UnsatisfiedLine } from "@/domain/matching";

/**
 * S-104: domain matching & near-match ranking.
 *
 * Traces to docs/stories/S-104-domain-matching.md AC1-AC8, prd.md
 * FR-20/FR-21/FR-22/FR-24 + Glossary (Cookable Now, Near-Match,
 * Unsatisfied line, Shortfall), architecture.md §4 ("Matching
 * algorithm's home", "Open-question defaults encoded") and §6 Flow C.
 *
 * `domain/matching.ts` DOES NOT EXIST YET — this whole suite is
 * intentionally RED: the import above fails to resolve until the
 * implementer creates the module and its
 * `computeCookableAndNearMatch(pantryIndex, recipes, threshold)` export.
 * Do not "fix" this suite by loosening assertions; make it pass by
 * implementing the module to this contract.
 *
 * ============================ PINNED API SHAPE ============================
 *
 * PantryIndex — architecture.md §6 Flow C: `Map<ingredientId, {qtyCanonical,
 * class}>`.
 *   type PantryIndex = Map<number, { qtyCanonical: number; class: UnitClass }>
 *
 * RecipeWithLines — architecture.md §4 density channel: each line carries
 * the joined ingredient's `{ unitClass, densityGPerMl }` inline, no third
 * query/parameter.
 *   interface RecipeLine {
 *     ingredientId: number;
 *     quantityCanonical: number;
 *     entryUnitClass: UnitClass;
 *     displayQuantity: number;
 *     displayUnit: string;
 *     ingredient: { unitClass: UnitClass; densityGPerMl: number | null };
 *   }
 *   interface RecipeWithLines {
 *     id: number;
 *     name: string;
 *     lines: RecipeLine[];
 *   }
 *
 * Comparison direction pinned by this suite (only one is arithmetically
 * consistent with "shortfall expressed in the recipe line's display unit"
 * with no second conversion step, FR-22): the PANTRY's available quantity
 * is resolved INTO each line's own `entryUnitClass` —
 *   resolveQuantityForComparison(pantryEntry.qtyCanonical, pantryEntry.class,
 *     line.entryUnitClass, line.ingredient.densityGPerMl)
 * — so required/available/shortfall for a line are always expressed in
 * that line's own canonical unit, directly convertible to its own
 * `displayUnit` via the existing `UNITS` factor table.
 *
 * computeCookableAndNearMatch(
 *   pantryIndex: PantryIndex,
 *   recipes: RecipeWithLines[],
 *   threshold: number,
 * ): {
 *   cookable: RecipeWithLines[];
 *   nearMatch: RankedRecipe[];   // ascending unsatisfied count, then
 *                                // ascending mean shortfall proportion,
 *                                // then alphabetical by name; unsatisfied
 *                                // count <= threshold only
 *   missingMoreCount: number;   // count of non-cookable recipes whose
 *                                // unsatisfied count > threshold (Flow C:
 *                                // "tail summarized by count, not rendered")
 * }
 *
 * RankedRecipe = RecipeWithLines & {
 *   unsatisfiedLines: UnsatisfiedLine[]; // ONE entry per distinct
 *                                         // ingredientId (AC-8 aggregation)
 *   meanShortfallProportion: number;     // mean over unsatisfiedLines
 * }
 *
 * UnsatisfiedLine = {
 *   ingredientId: number;
 *   status: "MISSING" | "INSUFFICIENT" | "UNRESOLVED";
 *   requiredCanonical: number;        // summed across duplicate lines for
 *                                      // this ingredient, in the FIRST such
 *                                      // line's entryUnitClass canonical unit
 *   availableCanonical: number;       // 0 for MISSING/UNRESOLVED; the
 *                                      // pantry qty resolved into that same
 *                                      // class for INSUFFICIENT
 *   shortfallDisplayQuantity: number; // required - available, converted to
 *                                      // displayUnit; full required amount
 *                                      // (in displayUnit) for MISSING/
 *                                      // UNRESOLVED
 *   displayUnit: string;              // the FIRST such line's displayUnit
 *   shortfallProportion: number;      // shortfall / required; 1.0 for
 *                                      // MISSING/UNRESOLVED (Glossary)
 * }
 * ===========================================================================
 */

type UnitClass = "MASS" | "VOLUME" | "COUNT";

interface PantryEntry {
  qtyCanonical: number;
  class: UnitClass;
}
type PantryIndex = Map<number, PantryEntry>;

interface RecipeLine {
  ingredientId: number;
  quantityCanonical: number;
  entryUnitClass: UnitClass;
  displayQuantity: number;
  displayUnit: string;
  ingredient: { unitClass: UnitClass; densityGPerMl: number | null };
}

interface RecipeWithLines {
  id: number;
  name: string;
  lines: RecipeLine[];
}

/** Builds a pantry index from `{ ingredientId, displayQuantity, displayUnit }` rows, mirroring pantryRepo.getAllAsIndex(). */
function pantryIndexOf(
  rows: Array<{ ingredientId: number; displayQuantity: number; displayUnit: string }>,
): PantryIndex {
  const map: PantryIndex = new Map();
  for (const row of rows) {
    const { quantityCanonical, entryUnitClass } = toCanonical(
      row.displayQuantity,
      row.displayUnit,
    );
    map.set(row.ingredientId, { qtyCanonical: quantityCanonical, class: entryUnitClass });
  }
  return map;
}

/** Builds a single recipe line, mirroring recipeRepo.getAllWithLines()'s ingredient-joined line shape. */
function recipeLine(options: {
  ingredientId: number;
  displayQuantity: number;
  displayUnit: string;
  ingredientUnitClass?: UnitClass;
  densityGPerMl?: number | null;
}): RecipeLine {
  const { quantityCanonical, entryUnitClass } = toCanonical(
    options.displayQuantity,
    options.displayUnit,
  );
  return {
    ingredientId: options.ingredientId,
    quantityCanonical,
    entryUnitClass,
    displayQuantity: options.displayQuantity,
    displayUnit: options.displayUnit,
    ingredient: {
      unitClass: options.ingredientUnitClass ?? entryUnitClass,
      densityGPerMl: options.densityGPerMl ?? null,
    },
  };
}

function recipe(id: number, name: string, lines: RecipeLine[]): RecipeWithLines {
  return { id, name, lines };
}

/** Finds an unsatisfied entry for a given recipe id + ingredient id inside a nearMatch result. */
function findUnsatisfied(
  nearMatch: RankedRecipe[],
  recipeId: number,
  ingredientId: number,
) {
  const entry = nearMatch.find((r) => r.id === recipeId);
  return entry?.unsatisfiedLines.find((l: UnsatisfiedLine) => l.ingredientId === ingredientId);
}

function idsOf(recipes: Array<{ id: number }>): number[] {
  return recipes.map((r) => r.id).sort((a, b) => a - b);
}

describe("computeCookableAndNearMatch — cookable classification (story AC-1, FR-20)", () => {
  it("a recipe with one fully-satisfied line is Cookable Now", () => {
    const pantry = pantryIndexOf([{ ingredientId: 1, displayQuantity: 3, displayUnit: "cup" }]);
    const soup = recipe(1, "Simple Soup", [
      recipeLine({ ingredientId: 1, displayQuantity: 2, displayUnit: "cup" }),
    ]);
    const result = computeCookableAndNearMatch(pantry, [soup], 3);
    expect(idsOf(result.cookable)).toEqual([1]);
    expect(idsOf(result.nearMatch)).toEqual([]);
  });

  it("a recipe with one insufficient line is NOT Cookable Now", () => {
    const pantry = pantryIndexOf([{ ingredientId: 1, displayQuantity: 1, displayUnit: "cup" }]);
    const soup = recipe(2, "Short Soup", [
      recipeLine({ ingredientId: 1, displayQuantity: 2, displayUnit: "cup" }),
    ]);
    const result = computeCookableAndNearMatch(pantry, [soup], 3);
    expect(idsOf(result.cookable)).toEqual([]);
  });

  it("false-cookable trap: two lines of the SAME ingredient must be SUMMED before comparison — pantry covering only the first line's amount is NOT cookable", () => {
    // Requires 200 g + 100 g = 300 g total; pantry holds 250 g, which
    // would look "enough" if only the first line were checked in
    // isolation, but the summed requirement is not met.
    const pantry = pantryIndexOf([{ ingredientId: 10, displayQuantity: 250, displayUnit: "g" }]);
    const doubleRice = recipe(3, "Double Rice", [
      recipeLine({ ingredientId: 10, displayQuantity: 200, displayUnit: "g" }),
      recipeLine({ ingredientId: 10, displayQuantity: 100, displayUnit: "g" }),
    ]);
    const result = computeCookableAndNearMatch(pantry, [doubleRice], 3);
    expect(idsOf(result.cookable)).toEqual([]);
  });

  it("satisfied case: pantry covering the SUM of two same-ingredient lines IS cookable", () => {
    const pantry = pantryIndexOf([{ ingredientId: 10, displayQuantity: 300, displayUnit: "g" }]);
    const doubleRice = recipe(4, "Double Rice Enough", [
      recipeLine({ ingredientId: 10, displayQuantity: 200, displayUnit: "g" }),
      recipeLine({ ingredientId: 10, displayQuantity: 100, displayUnit: "g" }),
    ]);
    const result = computeCookableAndNearMatch(pantry, [doubleRice], 3);
    expect(idsOf(result.cookable)).toEqual([4]);
  });

  it("EVERY referenced ingredient must be satisfied — one deficient ingredient among several blocks cookability even if others are satisfied", () => {
    const pantry = pantryIndexOf([
      { ingredientId: 10, displayQuantity: 200, displayUnit: "g" }, // rice: satisfied
      { ingredientId: 20, displayQuantity: 2, displayUnit: "each" }, // carrot: insufficient
    ]);
    const stew = recipe(5, "Stew", [
      recipeLine({ ingredientId: 10, displayQuantity: 200, displayUnit: "g" }),
      recipeLine({ ingredientId: 20, displayQuantity: 3, displayUnit: "each" }),
    ]);
    const result = computeCookableAndNearMatch(pantry, [stew], 3);
    expect(idsOf(result.cookable)).toEqual([]);
  });
});

describe("computeCookableAndNearMatch — FR-24: matching is by ingredient ID only", () => {
  it("distinct ingredient IDs with similar/related names never match, regardless of pantry quantity of the OTHER id", () => {
    const pantry = pantryIndexOf([{ ingredientId: 1, displayQuantity: 500, displayUnit: "g" }]); // "onion"
    const recipeNeedingYellowOnion = recipe(6, "Onion Soup", [
      recipeLine({ ingredientId: 2, displayQuantity: 200, displayUnit: "g" }), // "yellow onion" — distinct id
    ]);
    const result = computeCookableAndNearMatch(pantry, [recipeNeedingYellowOnion], 3);
    expect(idsOf(result.cookable)).toEqual([]);
    const unsatisfied = findUnsatisfied(result.nearMatch, 6, 2);
    expect(unsatisfied?.status).toBe("MISSING");
  });

  it("a matching ingredient ID with sufficient quantity DOES match", () => {
    const pantry = pantryIndexOf([{ ingredientId: 1, displayQuantity: 500, displayUnit: "g" }]);
    const recipeNeedingSameId = recipe(7, "Onion Soup Same Id", [
      recipeLine({ ingredientId: 1, displayQuantity: 200, displayUnit: "g" }),
    ]);
    const result = computeCookableAndNearMatch(pantry, [recipeNeedingSameId], 3);
    expect(idsOf(result.cookable)).toEqual([7]);
  });
});

describe("computeCookableAndNearMatch — unresolved lines (FR-11/FR-12 within matching)", () => {
  it("cross-class comparison with NO density: line is unsatisfied with status UNRESOLVED, never guessed satisfied, shortfall proportion 1.0", () => {
    const pantry = pantryIndexOf([{ ingredientId: 30, displayQuantity: 500, displayUnit: "g" }]); // flour, MASS
    const flourSoup = recipe(8, "Flour Soup", [
      recipeLine({ ingredientId: 30, displayQuantity: 1, displayUnit: "cup", densityGPerMl: null }), // VOLUME, no density
    ]);
    const result = computeCookableAndNearMatch(pantry, [flourSoup], 3);
    expect(idsOf(result.cookable)).toEqual([]);
    const unsatisfied = findUnsatisfied(result.nearMatch, 8, 30);
    expect(unsatisfied?.status).toBe("UNRESOLVED");
    expect(unsatisfied?.shortfallProportion).toBe(1.0);
  });

  it("cross-class comparison WITH density: resolves via resolveQuantityForComparison and SATISFIES when sufficient", () => {
    // Same fixture as units.test.ts's density case: 127.2 g at 0.53 g/mL ~= 240 mL.
    const pantry = pantryIndexOf([{ ingredientId: 31, displayQuantity: 127.2, displayUnit: "g" }]);
    const flourSoup = recipe(9, "Flour Soup With Density", [
      recipeLine({
        ingredientId: 31,
        displayQuantity: 1,
        displayUnit: "cup", // 240 mL
        densityGPerMl: 0.53,
      }),
    ]);
    const result = computeCookableAndNearMatch(pantry, [flourSoup], 3);
    expect(idsOf(result.cookable)).toEqual([9]);
  });

  it("cross-class comparison WITH density but INSUFFICIENT quantity: status INSUFFICIENT with a correctly resolved shortfall", () => {
    // 106 g at density 0.53 g/mL resolves to 200 mL available; 1 cup (240 mL) required -> 40 mL short.
    const pantry = pantryIndexOf([{ ingredientId: 32, displayQuantity: 106, displayUnit: "g" }]);
    const flourSoup = recipe(10, "Flour Soup Short", [
      recipeLine({
        ingredientId: 32,
        displayQuantity: 1,
        displayUnit: "cup",
        densityGPerMl: 0.53,
      }),
    ]);
    const result = computeCookableAndNearMatch(pantry, [flourSoup], 3);
    const unsatisfied = findUnsatisfied(result.nearMatch, 10, 32);
    expect(unsatisfied?.status).toBe("INSUFFICIENT");
    const availableInMl = resolveQuantityForComparison(106, "MASS", "VOLUME", 0.53) as number;
    const requiredMl = 240;
    const expectedShortfallMl = requiredMl - availableInMl;
    expect(unsatisfied?.displayUnit).toBe("cup");
    expect(unsatisfied?.shortfallDisplayQuantity).toBeCloseTo(expectedShortfallMl / 240, 10);
    expect(unsatisfied?.shortfallProportion).toBeCloseTo(expectedShortfallMl / requiredMl, 10);
  });

  it("COUNT mismatched against MASS returns UNRESOLVED even when density is set — COUNT never converts cross-class (FR-11)", () => {
    const pantry = pantryIndexOf([{ ingredientId: 33, displayQuantity: 4, displayUnit: "each" }]);
    const eggDish = recipe(11, "Egg Dish", [
      recipeLine({
        ingredientId: 33,
        displayQuantity: 200,
        displayUnit: "g",
        densityGPerMl: 0.53,
      }),
    ]);
    const result = computeCookableAndNearMatch(pantry, [eggDish], 3);
    const unsatisfied = findUnsatisfied(result.nearMatch, 11, 33);
    expect(unsatisfied?.status).toBe("UNRESOLVED");
    expect(unsatisfied?.shortfallProportion).toBe(1.0);
  });

  it("an ingredient entirely absent from the pantry index is status MISSING, availableCanonical 0, shortfall proportion 1.0", () => {
    const pantry = pantryIndexOf([]); // ingredient 99 never appears
    const noPantryEntry = recipe(12, "No Pantry Entry", [
      recipeLine({ ingredientId: 99, displayQuantity: 150, displayUnit: "g" }),
    ]);
    const result = computeCookableAndNearMatch(pantry, [noPantryEntry], 3);
    const unsatisfied = findUnsatisfied(result.nearMatch, 12, 99);
    expect(unsatisfied?.status).toBe("MISSING");
    expect(unsatisfied?.availableCanonical).toBe(0);
    expect(unsatisfied?.shortfallProportion).toBe(1.0);
  });
});

describe("computeCookableAndNearMatch — shortfall values (FR-22, Glossary)", () => {
  it('300 g required / 100 g held -> shortfall 200 in unit "g"; proportion 200/300 (the PRD\'s "need 200 g more rice" example)', () => {
    const pantry = pantryIndexOf([{ ingredientId: 50, displayQuantity: 100, displayUnit: "g" }]);
    const riceDish = recipe(13, "Rice Dish", [
      recipeLine({ ingredientId: 50, displayQuantity: 300, displayUnit: "g" }),
    ]);
    const result = computeCookableAndNearMatch(pantry, [riceDish], 3);
    const unsatisfied = findUnsatisfied(result.nearMatch, 13, 50);
    expect(unsatisfied?.status).toBe("INSUFFICIENT");
    expect(unsatisfied?.displayUnit).toBe("g");
    expect(unsatisfied?.shortfallDisplayQuantity).toBeCloseTo(200, 10);
    expect(unsatisfied?.shortfallProportion).toBeCloseTo(200 / 300, 10);
  });

  it("fully missing ingredient -> shortfall equals the FULL required quantity (in displayUnit), proportion 1.0", () => {
    const pantry = pantryIndexOf([]);
    const riceDish = recipe(14, "Rice Dish Missing", [
      recipeLine({ ingredientId: 51, displayQuantity: 150, displayUnit: "g" }),
    ]);
    const result = computeCookableAndNearMatch(pantry, [riceDish], 3);
    const unsatisfied = findUnsatisfied(result.nearMatch, 14, 51);
    expect(unsatisfied?.status).toBe("MISSING");
    expect(unsatisfied?.displayUnit).toBe("g");
    expect(unsatisfied?.shortfallDisplayQuantity).toBeCloseTo(150, 10);
    expect(unsatisfied?.shortfallProportion).toBe(1.0);
  });

  it("shortfall is reported in the recipe LINE's display unit even when that differs from the pantry's canonical unit (kg vs g)", () => {
    const pantry = pantryIndexOf([{ ingredientId: 60, displayQuantity: 150, displayUnit: "g" }]);
    const flourDish = recipe(15, "Flour Dish Kg", [
      recipeLine({ ingredientId: 60, displayQuantity: 1, displayUnit: "kg" }), // required 1000 g
    ]);
    const result = computeCookableAndNearMatch(pantry, [flourDish], 3);
    const unsatisfied = findUnsatisfied(result.nearMatch, 15, 60);
    expect(unsatisfied?.displayUnit).toBe("kg");
    // 1000 g required - 150 g held = 850 g short = 0.85 kg
    expect(unsatisfied?.shortfallDisplayQuantity).toBeCloseTo(0.85, 10);
    expect(unsatisfied?.shortfallProportion).toBeCloseTo(850 / 1000, 10);
  });
});

describe("computeCookableAndNearMatch — per-ingredient aggregation for unsatisfied attribution (story AC-8)", () => {
  it("two short lines referencing the SAME ingredient ID aggregate into exactly ONE unsatisfied entry, with shortfall on the SUMMED requirement, displayed in the FIRST line's display unit", () => {
    const pantry = pantryIndexOf([{ ingredientId: 80, displayQuantity: 100, displayUnit: "g" }]);
    const twoLineRice = recipe(16, "Two Line Rice", [
      recipeLine({ ingredientId: 80, displayQuantity: 200, displayUnit: "g" }),
      recipeLine({ ingredientId: 80, displayQuantity: 100, displayUnit: "g" }),
    ]);
    const result = computeCookableAndNearMatch(pantry, [twoLineRice], 3);
    const entry = result.nearMatch.find((r) => r.id === 16);
    expect(entry).toBeDefined();
    if (!entry) throw new Error("expected recipe 16 in nearMatch");
    // Exactly one unsatisfied entry for ingredient 80, not two.
    const entriesForIngredient80 = entry.unsatisfiedLines.filter(
      (l: UnsatisfiedLine) => l.ingredientId === 80,
    );
    expect(entriesForIngredient80).toHaveLength(1);
    expect(entry.unsatisfiedLines).toHaveLength(1);
    const unsatisfied = entriesForIngredient80[0];
    expect(unsatisfied.status).toBe("INSUFFICIENT");
    expect(unsatisfied.displayUnit).toBe("g"); // the FIRST line's display unit
    // required 200 + 100 = 300 g; held 100 g; shortfall = 200 g.
    expect(unsatisfied.shortfallDisplayQuantity).toBeCloseTo(200, 10);
    expect(unsatisfied.shortfallProportion).toBeCloseTo(200 / 300, 10);
  });

  it("when the pantry covers the SUMMED requirement across duplicate lines, the recipe IS cookable (AC-8's satisfied branch)", () => {
    const pantry = pantryIndexOf([{ ingredientId: 80, displayQuantity: 350, displayUnit: "g" }]);
    const twoLineRice = recipe(17, "Two Line Rice Enough", [
      recipeLine({ ingredientId: 80, displayQuantity: 200, displayUnit: "g" }),
      recipeLine({ ingredientId: 80, displayQuantity: 100, displayUnit: "g" }),
    ]);
    const result = computeCookableAndNearMatch(pantry, [twoLineRice], 3);
    expect(idsOf(result.cookable)).toEqual([17]);
  });

  it("aggregation across lines with DIFFERING display units still reports the shortfall in the FIRST line's display unit", () => {
    const pantry = pantryIndexOf([{ ingredientId: 90, displayQuantity: 300, displayUnit: "g" }]);
    const mixedUnitsRecipe = recipe(18, "Mixed Units Flour", [
      recipeLine({ ingredientId: 90, displayQuantity: 1, displayUnit: "kg" }), // first: 1000 g
      recipeLine({ ingredientId: 90, displayQuantity: 500, displayUnit: "g" }), // second: 500 g
    ]);
    const result = computeCookableAndNearMatch(pantry, [mixedUnitsRecipe], 3);
    const entry = result.nearMatch.find((r) => r.id === 18);
    expect(entry).toBeDefined();
    if (!entry) throw new Error("expected recipe 18 in nearMatch");
    const unsatisfied = entry.unsatisfiedLines.find((l: UnsatisfiedLine) => l.ingredientId === 90);
    expect(unsatisfied).toBeDefined();
    if (!unsatisfied) throw new Error("expected an unsatisfied entry for ingredient 90");
    // required 1000 + 500 = 1500 g; held 300 g; shortfall = 1200 g = 1.2 kg.
    expect(unsatisfied.displayUnit).toBe("kg");
    expect(unsatisfied.shortfallDisplayQuantity).toBeCloseTo(1.2, 10);
    expect(unsatisfied.shortfallProportion).toBeCloseTo(1200 / 1500, 10);
  });

  it("cross-class duplicate lines that CANNOT resolve into the FIRST line's class force the WHOLE aggregate group to UNRESOLVED — never guessed, even with a huge pantry quantity", () => {
    // First line: 200 g (MASS, no density). Second line, same ingredient
    // ID: 1 cup (VOLUME, no density) — cannot be resolved into the first
    // line's MASS class, so the aggregate as a whole must be UNRESOLVED
    // rather than silently summing only the resolvable line(s).
    const pantry = pantryIndexOf([
      { ingredientId: 999, displayQuantity: 1_000_000, displayUnit: "g" },
    ]);
    const crossClassDuplicate = recipe(19, "Cross Class Duplicate", [
      recipeLine({ ingredientId: 999, displayQuantity: 200, displayUnit: "g" }),
      recipeLine({ ingredientId: 999, displayQuantity: 1, displayUnit: "cup" }),
    ]);
    const result = computeCookableAndNearMatch(pantry, [crossClassDuplicate], 3);
    expect(idsOf(result.cookable)).toEqual([]);
    const entry = result.nearMatch.find((r) => r.id === 19);
    expect(entry).toBeDefined();
    if (!entry) throw new Error("expected recipe 19 in nearMatch");
    expect(entry.unsatisfiedLines).toHaveLength(1);
    const unsatisfied = entry.unsatisfiedLines[0];
    expect(unsatisfied.ingredientId).toBe(999);
    expect(unsatisfied.status).toBe("UNRESOLVED");
    expect(unsatisfied.shortfallProportion).toBe(1.0);
  });
});

describe("computeCookableAndNearMatch — near-match ranking (FR-21)", () => {
  it("orders ascending by unsatisfied-line count: a recipe missing 1 line ranks above one missing 2", () => {
    const pantry = pantryIndexOf([]);
    const missesOne = recipe(100, "Alpha Dish", [
      recipeLine({ ingredientId: 300, displayQuantity: 100, displayUnit: "g" }),
    ]);
    const missesTwo = recipe(101, "Beta Dish", [
      recipeLine({ ingredientId: 301, displayQuantity: 100, displayUnit: "g" }),
      recipeLine({ ingredientId: 302, displayQuantity: 100, displayUnit: "g" }),
    ]);
    // Deliberately passed out of "expected" order to prove sorting, not
    // fixture-array order, drives the result.
    const result = computeCookableAndNearMatch(pantry, [missesTwo, missesOne], 3);
    expect(result.nearMatch.map((r) => r.id)).toEqual([100, 101]);
  });

  it("ties on count broken by ascending MEAN shortfall proportion: a 20%-short recipe ranks above a fully-missing one (PRD FR-21 AC / story AC-7)", () => {
    // Gamma: one line, 20% short (required 100 g, held 80 g -> shortfall 20 g, proportion 0.2).
    // Delta: one line, fully missing (proportion 1.0). Alphabetically "Delta" < "Gamma",
    // so this also proves proportion outranks alphabetical ordering.
    const pantry = pantryIndexOf([{ ingredientId: 400, displayQuantity: 80, displayUnit: "g" }]);
    const gamma = recipe(102, "Gamma", [
      recipeLine({ ingredientId: 400, displayQuantity: 100, displayUnit: "g" }),
    ]);
    const delta = recipe(103, "Delta", [
      recipeLine({ ingredientId: 401, displayQuantity: 100, displayUnit: "g" }),
    ]);
    const result = computeCookableAndNearMatch(pantry, [delta, gamma], 3);
    expect(result.nearMatch.map((r) => r.id)).toEqual([102, 103]); // Gamma (0.2) before Delta (1.0)
  });

  it("ties on BOTH count and mean shortfall proportion broken alphabetically by recipe name", () => {
    const pantry = pantryIndexOf([]);
    const banana = recipe(104, "Banana Bread", [
      recipeLine({ ingredientId: 500, displayQuantity: 100, displayUnit: "g" }),
    ]);
    const apple = recipe(105, "Apple Pie", [
      recipeLine({ ingredientId: 501, displayQuantity: 100, displayUnit: "g" }),
    ]);
    const result = computeCookableAndNearMatch(pantry, [banana, apple], 3);
    expect(result.nearMatch.map((r) => r.name)).toEqual(["Apple Pie", "Banana Bread"]);
  });

  it("mean shortfall proportion is averaged across ALL unsatisfied lines of a recipe (one fully-missing + one 50% short -> mean 0.75)", () => {
    const pantry = pantryIndexOf([{ ingredientId: 601, displayQuantity: 50, displayUnit: "g" }]);
    const multiLine = recipe(106, "Multi Line", [
      recipeLine({ ingredientId: 600, displayQuantity: 100, displayUnit: "g" }), // missing entirely: proportion 1.0
      recipeLine({ ingredientId: 601, displayQuantity: 100, displayUnit: "g" }), // 50 g held of 100 g: proportion 0.5
    ]);
    const result = computeCookableAndNearMatch(pantry, [multiLine], 3);
    const entry = result.nearMatch.find((r) => r.id === 106);
    expect(entry).toBeDefined();
    if (!entry) throw new Error("expected recipe 106 in nearMatch");
    expect(entry.meanShortfallProportion).toBeCloseTo((1.0 + 0.5) / 2, 10);
  });
});

describe("computeCookableAndNearMatch — threshold filtering (FR-21 AC-5, story AC-5)", () => {
  // Five recipes with unsatisfied-line counts 1..5 (each line references a
  // distinct ingredient id absent from the pantry, so every line is MISSING).
  function buildCountFixtures(): RecipeWithLines[] {
    const makeLines = (count: number, base: number) =>
      Array.from({ length: count }, (_, i) =>
        recipeLine({ ingredientId: base + i, displayQuantity: 100, displayUnit: "g" }),
      );
    return [
      recipe(200, "Count1", makeLines(1, 300)),
      recipe(201, "Count2", makeLines(2, 310)),
      recipe(202, "Count3", makeLines(3, 320)),
      recipe(203, "Count4", makeLines(4, 330)),
      recipe(204, "Count5", makeLines(5, 340)),
    ];
  }

  it("threshold 3: includes recipes missing exactly 3 lines, excludes 4 (story AC-5 boundary)", () => {
    const pantry = pantryIndexOf([]);
    const result = computeCookableAndNearMatch(pantry, buildCountFixtures(), 3);
    expect(idsOf(result.nearMatch)).toEqual([200, 201, 202]);
    expect(result.missingMoreCount).toBe(2); // Count4, Count5
  });

  it("threshold 1: includes only the 1-missing recipe", () => {
    const pantry = pantryIndexOf([]);
    const result = computeCookableAndNearMatch(pantry, buildCountFixtures(), 1);
    expect(idsOf(result.nearMatch)).toEqual([200]);
    expect(result.missingMoreCount).toBe(4);
  });

  it("threshold 0: excludes every non-cookable recipe (unsatisfied count > 0 always exceeds 0)", () => {
    const pantry = pantryIndexOf([]);
    const result = computeCookableAndNearMatch(pantry, buildCountFixtures(), 0);
    expect(result.nearMatch).toEqual([]);
    expect(result.missingMoreCount).toBe(5);
  });

  it("threshold 4: includes up to 4-missing, excludes only the 5-missing recipe", () => {
    const pantry = pantryIndexOf([]);
    const result = computeCookableAndNearMatch(pantry, buildCountFixtures(), 4);
    expect(idsOf(result.nearMatch)).toEqual([200, 201, 202, 203]);
    expect(result.missingMoreCount).toBe(1);
  });
});

describe("computeCookableAndNearMatch — return shape pinning", () => {
  it("returns exactly { cookable, nearMatch, missingMoreCount } — no extra or missing top-level fields", () => {
    const pantry = pantryIndexOf([]);
    const result = computeCookableAndNearMatch(pantry, [], 3);
    expect(Object.keys(result).sort()).toEqual(["cookable", "missingMoreCount", "nearMatch"]);
  });

  it("each nearMatch entry is the recipe plus exactly { unsatisfiedLines, meanShortfallProportion }", () => {
    const pantry = pantryIndexOf([]);
    const dish = recipe(700, "Shape Dish", [
      recipeLine({ ingredientId: 900, displayQuantity: 100, displayUnit: "g" }),
    ]);
    const result = computeCookableAndNearMatch(pantry, [dish], 3);
    const entry = result.nearMatch[0];
    expect(Object.keys(entry).sort()).toEqual(
      ["id", "lines", "meanShortfallProportion", "name", "unsatisfiedLines"].sort(),
    );
  });

  it("each unsatisfiedLine entry carries exactly the fields needed to render 'need N <unit> more <ingredient>'", () => {
    const pantry = pantryIndexOf([{ ingredientId: 900, displayQuantity: 50, displayUnit: "g" }]);
    const dish = recipe(701, "Shape Dish Partial", [
      recipeLine({ ingredientId: 900, displayQuantity: 100, displayUnit: "g" }),
    ]);
    const result = computeCookableAndNearMatch(pantry, [dish], 3);
    const unsatisfied = result.nearMatch[0].unsatisfiedLines[0];
    expect(Object.keys(unsatisfied).sort()).toEqual(
      [
        "availableCanonical",
        "displayUnit",
        "ingredientId",
        "requiredCanonical",
        "shortfallDisplayQuantity",
        "shortfallProportion",
        "status",
      ].sort(),
    );
  });
});

describe("computeCookableAndNearMatch — empty pantry / empty recipes edge cases", () => {
  it("empty pantry with non-empty recipes: nothing is cookable, every referenced line is MISSING", () => {
    const pantry = pantryIndexOf([]);
    const dish = recipe(800, "Any Dish", [
      recipeLine({ ingredientId: 950, displayQuantity: 100, displayUnit: "g" }),
    ]);
    const result = computeCookableAndNearMatch(pantry, [dish], 3);
    expect(result.cookable).toEqual([]);
    expect(idsOf(result.nearMatch)).toEqual([800]);
    const unsatisfied = findUnsatisfied(result.nearMatch, 800, 950);
    expect(unsatisfied?.status).toBe("MISSING");
  });

  it("non-empty pantry with empty recipes: all result buckets are empty/zero", () => {
    const pantry = pantryIndexOf([{ ingredientId: 1, displayQuantity: 500, displayUnit: "g" }]);
    const result = computeCookableAndNearMatch(pantry, [], 3);
    expect(result.cookable).toEqual([]);
    expect(result.nearMatch).toEqual([]);
    expect(result.missingMoreCount).toBe(0);
  });

  it("empty pantry and empty recipes: all result buckets are empty/zero", () => {
    const pantry = pantryIndexOf([]);
    const result = computeCookableAndNearMatch(pantry, [], 3);
    expect(result.cookable).toEqual([]);
    expect(result.nearMatch).toEqual([]);
    expect(result.missingMoreCount).toBe(0);
  });
});
