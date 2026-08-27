import { describe, expect, it } from "vitest";
import { expandPackEntry, isPackUnit } from "@/domain/packs";
import { defaultPortionQuantity } from "@/domain/portioning";
import { parseRecipeBody } from "@/domain/cooklangParser";

/** openspec: pack-units — pack expansion, parser acceptance, ladder rung. */
describe("pack units", () => {
  it("recognizes pack/packs case-insensitively and nothing else", () => {
    expect(isPackUnit("pack")).toBe(true);
    expect(isPackUnit("Packs")).toBe(true);
    expect(isPackUnit("package")).toBe(false);
    expect(isPackUnit("g")).toBe(false);
  });

  it("expands packs through the product's pack size, passes real units through", () => {
    const oatmeal = { packQuantity: 61, packUnit: "g" };
    expect(expandPackEntry(1, "pack", oatmeal)).toEqual({ quantity: 61, unit: "g" });
    expect(expandPackEntry(2.5, "packs", oatmeal)).toEqual({ quantity: 152.5, unit: "g" });
    expect(expandPackEntry(40, "g", oatmeal)).toEqual({ quantity: 40, unit: "g" });
  });

  it("a product without a pack size can't expand", () => {
    expect(expandPackEntry(1, "pack", { packQuantity: null, packUnit: null })).toBe("NO_PACK");
    expect(expandPackEntry(1, "pack", { packQuantity: 0, packUnit: "g" })).toBe("NO_PACK");
  });

  it("the parser accepts pack mentions (catalog check deferred to line building)", () => {
    const parsed = parseRecipeBody("Stir in @Oatmeal(7){1%pack} and @Milk(8){250%mL}.");
    expect(parsed.errors).toEqual([]);
    expect(parsed.lines).toEqual([
      { ingredientId: 7, quantity: 1, unit: "pack" },
      { ingredientId: 8, quantity: 250, unit: "mL" },
    ]);
  });

  it("the portion ladder prefers the inner pack over the package", () => {
    expect(
      defaultPortionQuantity({ unitClass: "MASS", packageQuantity: 366, packageUnit: "g", packQuantity: 61, packUnit: "g" }),
    ).toEqual({ quantity: 61, unit: "g" });
    expect(
      defaultPortionQuantity({ unitClass: "MASS", packageQuantity: 366, packageUnit: "g", packQuantity: null, packUnit: null }),
    ).toEqual({ quantity: 366, unit: "g" });
  });
});
