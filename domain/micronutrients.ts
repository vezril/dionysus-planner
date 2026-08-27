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
  // openspec: nutrition-intake — B-vitamin labels lead with the common
  // names Calvin actually shops by.
  vitaminB1: { label: "Thiamine (B1)", unit: "mg" },
  vitaminB2: { label: "Riboflavin (B2)", unit: "mg" },
  vitaminB3: { label: "Niacin (B3)", unit: "mg" },
  vitaminB6: { label: "Vitamin B6", unit: "mg" },
  vitaminB9: { label: "Folate (B9)", unit: "µg" },
  vitaminB12: { label: "Vitamin B12", unit: "µg" },
  calcium: { label: "Calcium", unit: "mg" },
  iron: { label: "Iron", unit: "mg" },
  magnesium: { label: "Magnesium", unit: "mg" },
  potassium: { label: "Potassium", unit: "mg" },
  zinc: { label: "Zinc", unit: "mg" },
  // openspec: expanded-nutrients
  phosphorus: { label: "Phosphorus", unit: "mg" },
  // openspec: nutrition-intake — trace minerals + remaining B vitamins.
  pantothenate: { label: "Pantothenate (B5)", unit: "mg" },
  biotin: { label: "Biotin (B7)", unit: "µg" },
  iodine: { label: "Iodine", unit: "µg" },
  selenium: { label: "Selenium", unit: "µg" },
  copper: { label: "Copper", unit: "mg" },
  manganese: { label: "Manganese", unit: "mg" },
  chromium: { label: "Chromium", unit: "µg" },
  molybdenum: { label: "Molybdenum", unit: "µg" },
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

/**
 * openspec: expanded-nutrients — labels for keys the cook mirror sends
 * through the service's free-form micronutrient map that are NOT registry
 * micronutrients (they're first-class planner fields). Used only for
 * display on the Inventory day view.
 */
export const MIRROR_EXTRA_LABELS: Record<string, { label: string; unit: string }> = {
  alcoholG: { label: "Alcohol", unit: "g" },
  saturatedFatG: { label: "Saturated fat", unit: "g" },
  transFatG: { label: "Trans fat", unit: "g" },
  cholesterolMg: { label: "Cholesterol", unit: "mg" },
};
