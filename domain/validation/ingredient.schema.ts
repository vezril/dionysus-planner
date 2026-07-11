/**
 * Ingredient Zod schema (architecture.md §3 ADR-005 — one schema shared
 * verbatim by the client form (`react-hook-form` + `@hookform/resolvers/zod`)
 * and the Server Action's independent re-parse, per docs/stories/S-302).
 * Pure, framework-free.
 *
 * Field semantics per architecture.md §4 Ingredient: name/unitClass and the
 * four macro fields (calories/protein/carbs/fat) are required and
 * non-negative; fiber/sugar/sodium are optional/nullable and non-negative
 * when present (A-1); density is optional/nullable and strictly positive
 * when present (FR-12).
 */
import { z } from "zod";

const nonNegativeNumber = z.number().min(0);
const optionalNonNegative = z.number().min(0).nullish();

export const ingredientSchema = z.object({
  name: z.string().trim().min(1),
  unitClass: z.enum(["MASS", "VOLUME", "COUNT"]),
  caloriesPerRef: nonNegativeNumber,
  proteinPerRef: nonNegativeNumber,
  carbsPerRef: nonNegativeNumber,
  fatPerRef: nonNegativeNumber,
  fiberPerRef: optionalNonNegative,
  sugarPerRef: optionalNonNegative,
  sodiumMgPerRef: optionalNonNegative,
  densityGPerMl: z.number().gt(0).nullish(),
});

export type IngredientSchemaInput = z.infer<typeof ingredientSchema>;
