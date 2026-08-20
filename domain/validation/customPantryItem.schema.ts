/**
 * Custom pantry item schema (openspec: custom-pantry-items) — the one-step
 * "branded product into the pantry" form: the ingredient's fields
 * (nutrition + optional product identity, same rules as ingredientSchema)
 * plus an initial on-hand quantity, ZERO ALLOWED (an out-of-stock product
 * is still your product). Pure, framework-free; shared by the client form
 * and the Server Action's re-parse (ADR-005).
 */
import { z } from "zod";
import { UNITS } from "@/domain/units";

const unitKeys = Object.keys(UNITS) as [string, ...string[]];
const nonNegativeNumber = z.number().min(0);
const optionalNonNegative = z.number().min(0).nullish();

export const customPantryItemSchema = z
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
    densityGPerMl: z.number().gt(0).nullish(),
    brand: z.string().trim().min(1).nullish(),
    barcode: z.string().trim().min(1).nullish(),
    packageQuantity: z.number().gt(0).nullish(),
    // openspec: count-via-package-size — a real unit key, not free text:
    // the package size now drives COUNT↔MASS/VOLUME resolution.
    packageUnit: z
      .string()
      .refine((unit) => unit in UNITS, { message: "Pick a known unit." })
      .nullish(),
    initialQuantity: z
      .number({ error: "Quantity is required (0 is fine)." })
      .min(0, { message: "Quantity cannot be negative." }),
    unit: z.enum(unitKeys, { error: "Select a unit." }),
    // openspec: nutrition-basis-and-edit — optional entry basis ("per 355
    // mL"); class check + conversion live in the Server Action.
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

export type CustomPantryItemSchemaInput = z.infer<typeof customPantryItemSchema>;
