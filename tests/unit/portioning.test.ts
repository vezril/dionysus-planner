import { describe, expect, it } from "vitest";
import { defaultPortionQuantity } from "@/domain/portioning";

/** openspec: planner-consume — the portion-sizing ladder. */
describe("defaultPortionQuantity", () => {
  it("COUNT products portion as one each, even with package info", () => {
    expect(defaultPortionQuantity({ unitClass: "COUNT", packageQuantity: 12, packageUnit: "each" })).toEqual({
      quantity: 1,
      unit: "each",
    });
  });

  it("packaged MASS/VOLUME products portion as one package", () => {
    expect(defaultPortionQuantity({ unitClass: "VOLUME", packageQuantity: 355, packageUnit: "mL" })).toEqual({
      quantity: 355,
      unit: "mL",
    });
    expect(defaultPortionQuantity({ unitClass: "MASS", packageQuantity: 45, packageUnit: "g" })).toEqual({
      quantity: 45,
      unit: "g",
    });
  });

  it("falls back to the 100 g / 100 mL reference without a package", () => {
    expect(defaultPortionQuantity({ unitClass: "MASS", packageQuantity: null, packageUnit: null })).toEqual({
      quantity: 100,
      unit: "g",
    });
    expect(defaultPortionQuantity({ unitClass: "VOLUME", packageQuantity: 0, packageUnit: "mL" })).toEqual({
      quantity: 100,
      unit: "mL",
    });
  });
});
