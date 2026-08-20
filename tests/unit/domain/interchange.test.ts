import { describe, expect, it } from "vitest";
import { mergeRowsByGroup, normalizeLineToRoot, rootOf, type GenericLinks } from "@/domain/interchange";

/** openspec: generic-products — group normalization primitives. */
const links: GenericLinks = new Map([
  [1, null], // Butter (generic)
  [2, 1], // Lactantia Butter
  [3, 1], // Kirkland Butter
  [4, null], // Flour, unrelated
]);

describe("rootOf", () => {
  it("products resolve to their generic; generics and unknowns to themselves", () => {
    expect(rootOf(2, links)).toBe(1);
    expect(rootOf(1, links)).toBe(1);
    expect(rootOf(99, links)).toBe(99);
  });
});

describe("mergeRowsByGroup", () => {
  it("sums group members into one virtual row keyed by the root", () => {
    const merged = mergeRowsByGroup(
      [
        { id: 10, ingredientId: 2, quantityCanonical: 150, entryUnitClass: "MASS" as const },
        { id: 11, ingredientId: 3, quantityCanonical: 150, entryUnitClass: "MASS" as const },
        { id: 12, ingredientId: 4, quantityCanonical: 500, entryUnitClass: "MASS" as const },
      ],
      links,
    );
    expect(merged.find((row) => row.ingredientId === 1)!.quantityCanonical).toBe(300);
    expect(merged.find((row) => row.ingredientId === 4)!.quantityCanonical).toBe(500);
    expect(merged).toHaveLength(2);
  });

  it("keeps a class-mismatched row separate rather than guessing", () => {
    const merged = mergeRowsByGroup(
      [
        { id: 10, ingredientId: 2, quantityCanonical: 150, entryUnitClass: "MASS" as const },
        { id: 11, ingredientId: 3, quantityCanonical: 500, entryUnitClass: "VOLUME" as const },
      ],
      links,
    );
    expect(merged).toHaveLength(2);
    expect(merged.find((row) => row.ingredientId === 1)!.quantityCanonical).toBe(150);
  });
});

describe("normalizeLineToRoot", () => {
  it("rewrites line and nested ingredient ids to the root, everything else intact", () => {
    const line = {
      ingredientId: 2,
      quantityCanonical: 200,
      ingredient: { id: 2, unitClass: "MASS" as const, densityGPerMl: null },
    };
    const normalized = normalizeLineToRoot(line, links);
    expect(normalized.ingredientId).toBe(1);
    expect(normalized.ingredient.id).toBe(1);
    expect(normalized.ingredient.unitClass).toBe("MASS");
    expect(line.ingredientId).toBe(2); // input untouched
  });
});
