import { describe, expect, it } from "vitest";
import { resolveQuantityForComparison } from "@/domain/units";

/**
 * openspec: count-via-package-size — COUNT↔MASS/VOLUME resolution via the
 * ingredient's package size ("1 each = 355 mL"), the "can of Fanta in a
 * recipe" fix. Strictness scenarios pin that a bad package never guesses.
 */
describe("package-size bridge in resolveQuantityForComparison", () => {
  it("2 cans → 710 mL (COUNT entry, VOLUME target, 355 mL package)", () => {
    expect(resolveQuantityForComparison(2, "COUNT", "VOLUME", null, 355, "mL")).toBe(710);
  });

  it("100 g of a 200 g-packaged COUNT ingredient → 0.5 each", () => {
    expect(resolveQuantityForComparison(100, "MASS", "COUNT", null, 200, "g")).toBe(0.5);
  });

  it("pantry stock of 1 each covers a 300 mL requirement (COUNT → VOLUME)", () => {
    const available = resolveQuantityForComparison(1, "COUNT", "VOLUME", null, 355, "mL");
    expect(available).toBe(355);
    expect(available as number >= 300).toBe(true);
  });

  it("package in a non-canonical unit canonicalizes (1 each = 2 cup → 480 mL)", () => {
    expect(resolveQuantityForComparison(1, "COUNT", "VOLUME", null, 2, "cup")).toBe(480);
  });

  it("no package → UNRESOLVED, exactly as before", () => {
    expect(resolveQuantityForComparison(1, "COUNT", "VOLUME", null)).toBe("UNRESOLVED");
    expect(resolveQuantityForComparison(1, "COUNT", "VOLUME", null, null, null)).toBe("UNRESOLVED");
  });

  it("unknown package unit (legacy lowercase 'ml') → UNRESOLVED, never a guess", () => {
    expect(resolveQuantityForComparison(1, "COUNT", "VOLUME", null, 355, "ml")).toBe("UNRESOLVED");
  });

  it("package class matching neither side → UNRESOLVED (MASS package on a VOLUME comparison)", () => {
    expect(resolveQuantityForComparison(1, "COUNT", "VOLUME", null, 200, "g")).toBe("UNRESOLVED");
  });

  it("non-positive package quantity → UNRESOLVED", () => {
    expect(resolveQuantityForComparison(1, "COUNT", "VOLUME", null, 0, "mL")).toBe("UNRESOLVED");
    expect(resolveQuantityForComparison(1, "COUNT", "VOLUME", null, -355, "mL")).toBe("UNRESOLVED");
  });

  it("package never applies to MASS↔VOLUME (density's job)", () => {
    expect(resolveQuantityForComparison(100, "MASS", "VOLUME", null, 355, "mL")).toBe("UNRESOLVED");
  });

  it("density path is untouched and takes precedence over falling through", () => {
    expect(resolveQuantityForComparison(100, "MASS", "VOLUME", 0.5, 355, "mL")).toBe(200);
  });

  it("same-class identity still ignores the package entirely", () => {
    expect(resolveQuantityForComparison(42, "VOLUME", "VOLUME", null, 355, "mL")).toBe(42);
  });
});
