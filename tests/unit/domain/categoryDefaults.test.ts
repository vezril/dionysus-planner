import { describe, expect, it } from "vitest";
import {
  normalizeCategoryPath,
  resolveCategoryDefaults,
  type CategoryDefaults,
} from "@/domain/categoryDefaults";

/** openspec: category-defaults — pure resolution semantics. */
function defaults(displayPath: string, kcal: number): CategoryDefaults {
  return { displayPath, caloriesPerRef: kcal, proteinPerRef: null, carbsPerRef: null, fatPerRef: null, alcoholAbvPercent: null };
}

const stored = new Map<string, CategoryDefaults>([
  ["rhum", defaults("Rhum", 231)],
  ["rhum/lightly aged pot rhum", defaults("Rhum/Lightly Aged Pot Rhum", 235)],
  ["seasoning", defaults("seasoning", 300)],
]);

describe("categoryDefaults", () => {
  it("normalizes paths case-insensitively with trimming", () => {
    expect(normalizeCategoryPath(" Rhum / Lightly Aged Pot Rhum ")).toBe("rhum/lightly aged pot rhum");
  });

  it("exact deepest path beats its ancestor", () => {
    expect(resolveCategoryDefaults(["Rhum/Lightly Aged Pot Rhum"], stored)!.caloriesPerRef).toBe(235);
  });

  it("falls back to the ancestor when the leaf has no defaults", () => {
    expect(resolveCategoryDefaults(["Rhum/Agricole"], stored)!.caloriesPerRef).toBe(231);
  });

  it("deepest match across categories wins regardless of order", () => {
    expect(resolveCategoryDefaults(["seasoning", "RHUM/lightly aged pot rhum"], stored)!.caloriesPerRef).toBe(235);
  });

  it("first-listed category breaks depth ties", () => {
    expect(resolveCategoryDefaults(["seasoning", "Rhum"], stored)!.caloriesPerRef).toBe(300);
  });

  it("no match yields null", () => {
    expect(resolveCategoryDefaults(["beer"], stored)).toBeNull();
    expect(resolveCategoryDefaults([], stored)).toBeNull();
  });
});
