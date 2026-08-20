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
import { UNITS } from "../units";

const nonNegativeNumber = z.number().min(0);
const optionalNonNegative = z.number().min(0).nullish();

export const ingredientSchema = z
  .object({
    name: z.string().trim().min(1),
    unitClass: z.enum(["MASS", "VOLUME", "COUNT"]),
    caloriesPerRef: nonNegativeNumber,
    proteinPerRef: nonNegativeNumber,
    carbsPerRef: nonNegativeNumber,
    fatPerRef: nonNegativeNumber,
    fiberPerRef: optionalNonNegative,
    sugarPerRef: optionalNonNegative,
    sodiumMgPerRef: optionalNonNegative,
    // openspec: alcohol-tracking — same optional-nutrient semantics.
    alcoholGPerRef: optionalNonNegative,
    densityGPerMl: z.number().gt(0).nullish(),
    // openspec: custom-pantry-items — optional product identity. Barcode is
    // free text (trimmed, non-empty when present): format normalization is
    // the future scanner app's concern (design.md risk note).
    brand: z.string().trim().min(1).nullish(),
    barcode: z.string().trim().min(1).nullish(),
    packageQuantity: z.number().gt(0).nullish(),
    // openspec: count-via-package-size — a real unit key, not free text:
    // the package size now drives COUNT↔MASS/VOLUME resolution.
    packageUnit: z
      .string()
      .refine((unit) => unit in UNITS, { message: "Pick a known unit." })
      .nullish(),
    // openspec: nutrition-basis-and-edit — optional entry basis ("per 355
    // mL"). Structural checks only here; the class-consistency rule and the
    // actual conversion live in the Server Action (design.md Decision 2).
    nutritionBasisQuantity: z.number().gt(0).nullish(),
    nutritionBasisUnit: z.string().trim().min(1).nullish(),
  })
  .refine((value) => value.packageQuantity == null || value.packageUnit != null, {
    message: "A package size needs a unit.",
    path: ["packageUnit"],
  })
  .refine((value) => value.nutritionBasisQuantity == null || value.nutritionBasisUnit != null, {
    message: "A nutrition basis needs a unit.",
    path: ["nutritionBasisUnit"],
  });

export type IngredientSchemaInput = z.infer<typeof ingredientSchema>;
