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
import { MICRONUTRIENTS } from "../micronutrients";
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
    saturatedFatGPerRef: optionalNonNegative,
    transFatGPerRef: optionalNonNegative,
    cholesterolMgPerRef: optionalNonNegative,
    // openspec: drinks-and-abv
    category: z.enum(["FOOD", "DRINK", "SUPPLEMENT"]).default("FOOD"),
    // openspec: pantry-freshness
    shelfLifeDays: z.number().gt(0).nullish(),
    // openspec: generic-products — structural only; existence/level/class
    // checks live in the action.
    genericOfId: z.number().int().positive().nullish(),
    // openspec: inline-generic-create — create/reuse a generic by name
    // straight from the product form's menu.
    newGenericName: z.string().trim().min(1).max(120).nullish(),

    // openspec: pantry-quick-eat
    readyToEat: z.boolean().default(false),
    // openspec: batch-nutrition-and-abv-entry — % ABV entry for VOLUME
    // drinks; converted to alcoholGPerRef in the action, basis-exempt.
    alcoholAbvPercent: z.number().min(0).max(100).nullish(),
    // openspec: vitamin-tracking — sparse micronutrient rows (registry
    // keys, per-reference amounts, no duplicates).
    micronutrients: z
      .array(
        z.object({
          key: z.string().refine((key) => key in MICRONUTRIENTS, { message: "Unknown micronutrient." }),
          amountPerRef: z.number().gt(0),
        }),
      )
      .refine((entries) => new Set(entries.map((entry) => entry.key)).size === entries.length, {
        message: "Each micronutrient can only appear once.",
      })
      .nullish(),
    // openspec: ingredient-categories-auto-tags — user-defined category
    // labels; trimmed, empties dropped, deduped exact (recipe-tag posture).
    categories: z
      .array(z.string().trim().min(1, { message: "Categories cannot be blank." }))
      .transform((tags) => Array.from(new Set(tags)))
      .nullish(),
    // openspec: ratings-variants-links — local-merchant product URLs.
    merchantLinks: z
      .array(
        z
          .string()
          .trim()
          .url({ message: "Merchant links must be full URLs." })
          .refine((url) => /^https?:\/\//.test(url), { message: "Merchant links must be http(s) URLs." }),
      )
      .transform((urls) => Array.from(new Set(urls)))
      .nullish(),
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
    // openspec: pack-units — the INNER pre-portioned pack (61 g pack in a
    // 366 g box); expands `pack` mentions and portion sizing.
    packQuantity: z.number().gt(0).nullish(),
    packUnit: z
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
  .refine((value) => value.packQuantity == null || value.packUnit != null, {
    message: "A pack size needs a unit.",
    path: ["packUnit"],
  })
  .refine((value) => value.nutritionBasisQuantity == null || value.nutritionBasisUnit != null, {
    message: "A nutrition basis needs a unit.",
    path: ["nutritionBasisUnit"],
  });

export type IngredientSchemaInput = z.infer<typeof ingredientSchema>;
