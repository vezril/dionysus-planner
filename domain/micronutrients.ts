/**
 * Micronutrient registry (openspec: vitamin-tracking). A versioned code
 * constant like UNITS — extending it is a code change, never a schema
 * migration. Amounts are stored per the ingredient's reference quantity
 * in each nutrient's label unit below (IU entry deferred — design D1).
 */
export interface MicronutrientDef {
  label: string;
  unit: "µg" | "mg";
}

export const MICRONUTRIENTS: Record<string, MicronutrientDef> = {
  vitaminA: { label: "Vitamin A", unit: "µg" },
  vitaminC: { label: "Vitamin C", unit: "mg" },
  vitaminD: { label: "Vitamin D", unit: "µg" },
  vitaminE: { label: "Vitamin E", unit: "mg" },
  vitaminK: { label: "Vitamin K", unit: "µg" },
  vitaminB1: { label: "Vitamin B1 (thiamin)", unit: "mg" },
  vitaminB2: { label: "Vitamin B2 (riboflavin)", unit: "mg" },
  vitaminB3: { label: "Vitamin B3 (niacin)", unit: "mg" },
  vitaminB6: { label: "Vitamin B6", unit: "mg" },
  vitaminB9: { label: "Vitamin B9 (folate)", unit: "µg" },
  vitaminB12: { label: "Vitamin B12", unit: "µg" },
  calcium: { label: "Calcium", unit: "mg" },
  iron: { label: "Iron", unit: "mg" },
  magnesium: { label: "Magnesium", unit: "mg" },
  potassium: { label: "Potassium", unit: "mg" },
  zinc: { label: "Zinc", unit: "mg" },
};

export interface MicronutrientEntry {
  key: string;
  amountPerRef: number;
}

/** Scales entry amounts by a nutrition-basis factor (4-decimal rounding,
 * same posture as scaleNutritionFields). */
export function scaleMicronutrients(entries: MicronutrientEntry[], factor: number): MicronutrientEntry[] {
  return entries.map((entry) => ({
    key: entry.key,
    amountPerRef: Math.round(entry.amountPerRef * factor * 10_000) / 10_000,
  }));
}
