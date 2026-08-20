/**
 * Estimated recipe ABV (openspec: drinks-and-abv). Pure, framework-free.
 *
 * ABV% = (total alcohol grams ÷ ETHANOL_DENSITY) ÷ total resolvable
 * volume mL × 100. Deliberately an ESTIMATE (design: honest approximation
 * over blocking): lines with no recorded alcohol contribute 0 g, lines
 * that cannot resolve to a volume contribute no volume, and mixing
 * contraction is ignored.
 */
import { REFERENCE_QUANTITY_BY_CLASS, type UnitClass } from "@/domain/types";
import { resolveQuantityForComparison } from "@/domain/units";

export const ETHANOL_DENSITY_G_PER_ML = 0.789;

export interface AbvLine {
  quantityCanonical: number;
  entryUnitClass: UnitClass;
  ingredient: {
    unitClass: UnitClass;
    densityGPerMl: number | null;
    packageQuantity?: number | null;
    packageUnit?: string | null;
    alcoholGPerRef: number | null;
  };
}

export interface AbvResult {
  abvPercent: number;
  totalAlcoholG: number;
  totalVolumeMl: number;
}

/** Null when the recipe has no recorded alcohol or no line resolves to a
 * volume — callers render nothing in that case. */
export function computeRecipeAbv(lines: AbvLine[]): AbvResult | null {
  let totalAlcoholG = 0;
  let totalVolumeMl = 0;

  for (const line of lines) {
    const { ingredient } = line;

    // Alcohol: line quantity resolved into the ingredient's own class,
    // scaled over its per-reference value.
    if (ingredient.alcoholGPerRef !== null) {
      const inIngredientClass = resolveQuantityForComparison(
        line.quantityCanonical,
        line.entryUnitClass,
        ingredient.unitClass,
        ingredient.densityGPerMl,
        ingredient.packageQuantity ?? null,
        ingredient.packageUnit ?? null,
      );
      if (inIngredientClass !== "UNRESOLVED") {
        totalAlcoholG +=
          (inIngredientClass / REFERENCE_QUANTITY_BY_CLASS[ingredient.unitClass]) * ingredient.alcoholGPerRef;
      }
    }

    // Volume: line quantity resolved into VOLUME canonical (mL).
    const inMl = resolveQuantityForComparison(
      line.quantityCanonical,
      line.entryUnitClass,
      "VOLUME",
      ingredient.densityGPerMl,
      ingredient.packageQuantity ?? null,
      ingredient.packageUnit ?? null,
    );
    if (inMl !== "UNRESOLVED") {
      totalVolumeMl += inMl;
    }
  }

  if (totalAlcoholG <= 0 || totalVolumeMl <= 0) return null;
  return {
    abvPercent: (totalAlcoholG / ETHANOL_DENSITY_G_PER_ML / totalVolumeMl) * 100,
    totalAlcoholG,
    totalVolumeMl,
  };
}

/** openspec: batch-nutrition-and-abv-entry — label ABV% ↔ stored grams per
 * 100 mL (VOLUME reference). A ratio: basis-independent by definition. */
export function abvPercentToGramsPer100Ml(abvPercent: number): number {
  return Math.round(abvPercent * ETHANOL_DENSITY_G_PER_ML * 10_000) / 10_000;
}

export function gramsPer100MlToAbvPercent(gramsPer100Ml: number): number {
  return Math.round((gramsPer100Ml / ETHANOL_DENSITY_G_PER_ML) * 10) / 10;
}

/** openspec: consumption-dashboard — CRDM standard drink: 17 mL of
 * ethanol. units = mL ethanol / 17 = grams / density / 17. */
export const CRDM_UNIT_ETHANOL_ML = 17;

export function alcoholUnitsFromGrams(grams: number): number {
  return Math.round((grams / ETHANOL_DENSITY_G_PER_ML / CRDM_UNIT_ETHANOL_ML) * 100) / 100;
}
