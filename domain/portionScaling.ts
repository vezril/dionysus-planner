/**
 * Portion-slider display math (openspec: qol-nav-scale-delete). Pure,
 * framework-free. Linear scaling only — a "1 each" onion at 1.5× is
 * honestly "1.5 each" (design D2: the exact value beats a guessed
 * rounding; per-ingredient scaling hints are a future concept).
 */

/** Display quantity × factor, rounded to at most 2 decimals (trailing
 * zeros drop via Number). Factor 1 returns the input unchanged. */
export function scaleDisplayQuantity(displayQuantity: number, factor: number): number {
  if (factor === 1) return displayQuantity;
  return Math.round(displayQuantity * factor * 100) / 100;
}

/** Nutrient total × factor; null (incomplete) passes through. */
export function scaleNutrientValue(value: number | null, factor: number): number | null {
  if (value === null) return null;
  return value * factor;
}
