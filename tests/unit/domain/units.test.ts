import { describe, expect, it } from "vitest";
import { isKnownUnitClass, PLACEHOLDER_UNIT_CLASSES } from "@/domain/units";

/**
 * Tooling smoke spec (S-101): proves the Vitest `unit` project runs a
 * pure /domain export with no DB/Next.js runtime involved. Real
 * units.ts behavior (toCanonical, resolveQuantityForComparison) is
 * specified by later domain stories, not here.
 */
describe("domain/units placeholder", () => {
  it("recognizes the fixed unit-class set", () => {
    expect(PLACEHOLDER_UNIT_CLASSES).toEqual(["MASS", "VOLUME", "COUNT"]);
    expect(isKnownUnitClass("MASS")).toBe(true);
    expect(isKnownUnitClass("nope")).toBe(false);
  });
});
