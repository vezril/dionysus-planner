/**
 * openspec: recipe-links-precision — the display-only rounding boundary
 * for quantities. Pure.
 *
 * Conversions, pack subtraction, and portion math all produce IEEE
 * artifacts (305.00000000000006, 0.30000000000000004) that overflow
 * their columns and read as noise. Every rendered quantity, portion
 * count, or on-hand amount goes through here.
 *
 * DISPLAY ONLY: never feed the result back into arithmetic that reaches
 * canonical storage or unit comparison — `resolveQuantityForComparison`
 * stays the single conversion choke point and works in full precision.
 * Nutrition values keep their own `formatNutritionForDisplay` rounding.
 */

/** At most 2 decimals, trailing zeros dropped: 305 · 1.5 · 0.33. */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Number(value.toFixed(2)).toString();
}
