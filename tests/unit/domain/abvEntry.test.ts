import { describe, expect, it } from "vitest";
import { abvPercentToGramsPer100Ml, gramsPer100MlToAbvPercent } from "@/domain/abv";

/** openspec: batch-nutrition-and-abv-entry — label ABV ↔ stored grams. */
describe("ABV conversion", () => {
  it("5% beer is 3.945 g per 100 mL", () => {
    expect(abvPercentToGramsPer100Ml(5)).toBe(3.945);
  });

  it("round-trips to one decimal", () => {
    expect(gramsPer100MlToAbvPercent(abvPercentToGramsPer100Ml(40))).toBe(40);
    expect(gramsPer100MlToAbvPercent(3.945)).toBe(5);
  });

  it("zero stays zero", () => {
    expect(abvPercentToGramsPer100Ml(0)).toBe(0);
  });
});
