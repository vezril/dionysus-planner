/**
 * Nutrition-entry basis conversion (openspec: nutrition-basis-and-edit).
 * Labels declare values per container or per serving ("per 355 mL can");
 * storage is per reference quantity (REFERENCE_QUANTITY_BY_CLASS — 100 g /
 * 100 mL / 1). These pure helpers turn label-basis values into
 * per-reference values at save time; nothing downstream changes.
 * Cross-class bases are a typed error, never a density-guess (design.md
 * non-goal: entry-time conversion stays predictable, not clever).
 */
import { REFERENCE_QUANTITY_BY_CLASS, type UnitClass } from "@/domain/types";
import { toCanonical, UNITS } from "@/domain/units";

export type ScaleFactorResult =
  | { ok: true; factor: number }
  | { ok: false; error: "UNKNOWN_UNIT" | "CLASS_MISMATCH" | "NON_POSITIVE_QUANTITY" };

/** factor = referenceQuantity / canonical(basis) — multiply label values by
 * it to get per-reference values. Factor 1 ⇔ the basis IS the reference. */
export function nutritionScaleFactor(
  basisQuantity: number,
  basisUnit: string,
  unitClass: UnitClass,
): ScaleFactorResult {
  if (!(basisUnit in UNITS)) return { ok: false, error: "UNKNOWN_UNIT" };
  if (!(basisQuantity > 0)) return { ok: false, error: "NON_POSITIVE_QUANTITY" };

  const canonical = toCanonical(basisQuantity, basisUnit);
  if (canonical.entryUnitClass !== unitClass) return { ok: false, error: "CLASS_MISMATCH" };

  return { ok: true, factor: REFERENCE_QUANTITY_BY_CLASS[unitClass] / canonical.quantityCanonical };
}

/** The reference basis for a class — what an untouched form enters against. */
export function referenceBasisFor(unitClass: UnitClass): { quantity: number; unit: string } {
  switch (unitClass) {
    case "MASS":
      return { quantity: 100, unit: "g" };
    case "VOLUME":
      return { quantity: 100, unit: "mL" };
    case "COUNT":
      return { quantity: 1, unit: "each" };
  }
}

/** Unit keys belonging to a class — the basis unit picker's options. */
export function unitsForClass(unitClass: UnitClass): string[] {
  return Object.entries(UNITS)
    .filter(([, def]) => def.class === unitClass)
    .map(([key]) => key);
}

export interface NutritionFieldValues {
  caloriesPerRef: number;
  proteinPerRef: number;
  carbsPerRef: number;
  fatPerRef: number;
  fiberPerRef: number | null;
  sugarPerRef: number | null;
  sodiumMgPerRef: number | null;
  alcoholGPerRef: number | null;
}

/** Rounded to 4 decimals — far below nutritional significance, keeps
 * 150 kcal per 355 mL from persisting as 42.25352112676056. */
function scale(value: number, factor: number): number {
  return Math.round(value * factor * 10_000) / 10_000;
}

export function scaleNutritionFields(
  fields: NutritionFieldValues,
  factor: number,
): NutritionFieldValues {
  return {
    caloriesPerRef: scale(fields.caloriesPerRef, factor),
    proteinPerRef: scale(fields.proteinPerRef, factor),
    carbsPerRef: scale(fields.carbsPerRef, factor),
    fatPerRef: scale(fields.fatPerRef, factor),
    fiberPerRef: fields.fiberPerRef == null ? null : scale(fields.fiberPerRef, factor),
    sugarPerRef: fields.sugarPerRef == null ? null : scale(fields.sugarPerRef, factor),
    sodiumMgPerRef: fields.sodiumMgPerRef == null ? null : scale(fields.sodiumMgPerRef, factor),
    alcoholGPerRef: fields.alcoholGPerRef == null ? null : scale(fields.alcoholGPerRef, factor),
  };
}
