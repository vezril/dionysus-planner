"use server";

/**
 * S-302 ingredient create & nutrition override Server Actions
 * (docs/stories/S-302-ingredient-create-override.md, architecture.md §5
 * Server Actions colocated in `/app/actions/*`, §6 error-handling
 * discriminated union, ADR-005 shared Zod re-validation).
 *
 * Neither action imports drizzle-orm/better-sqlite3 directly — both
 * delegate persistence to the per-call `createDb()` entry points added to
 * `/data/ingredients.ts` (architecture.md §5 boundary rule: only `/data/**`
 * imports drizzle).
 */
import { revalidatePath } from "next/cache";
import { abvPercentToGramsPer100Ml } from "@/domain/abv";
import { scaleMicronutrients } from "@/domain/micronutrients";
import { getProductsOfGeneric } from "@/data/ingredients";
import { ingredientSchema } from "@/domain/validation/ingredient.schema";
import {
  nutritionScaleFactor,
  scaleNutritionFields,
  type NutritionFieldValues,
} from "@/domain/nutritionBasis";
import type { IngredientRecord } from "@/data/repositories/ingredientRepo";
import { setIngredientMicronutrients,
  createIngredientRecord,
  getIngredientRecordById,
  getIngredientReferences,
  removeIngredientRecord,
  updateIngredientNutritionRecord,
} from "@/data/ingredients";

export interface ActionError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

/**
 * openspec: nutrition-basis-and-edit — converts label-basis nutrition
 * ("per 355 mL") to per-reference values before persisting. Absent basis
 * = factor 1 (unchanged behavior). A basis unit outside the ingredient's
 * class is a field error, never a silent guess.
 */
function resolveNutrition(data: {
  unitClass: "MASS" | "VOLUME" | "COUNT";
  caloriesPerRef: number;
  proteinPerRef: number;
  carbsPerRef: number;
  fatPerRef: number;
  fiberPerRef?: number | null;
  sugarPerRef?: number | null;
  sodiumMgPerRef?: number | null;
  alcoholGPerRef?: number | null;
  saturatedFatGPerRef?: number | null;
  transFatGPerRef?: number | null;
  cholesterolMgPerRef?: number | null;
  nutritionBasisQuantity?: number | null;
  nutritionBasisUnit?: string | null;
}): { ok: true; values: NutritionFieldValues; factor: number } | { ok: false; error: ActionError } {
  const values: NutritionFieldValues = {
    caloriesPerRef: data.caloriesPerRef,
    proteinPerRef: data.proteinPerRef,
    carbsPerRef: data.carbsPerRef,
    fatPerRef: data.fatPerRef,
    fiberPerRef: data.fiberPerRef ?? null,
    sugarPerRef: data.sugarPerRef ?? null,
    sodiumMgPerRef: data.sodiumMgPerRef ?? null,
    alcoholGPerRef: data.alcoholGPerRef ?? null,
    saturatedFatGPerRef: data.saturatedFatGPerRef ?? null,
    transFatGPerRef: data.transFatGPerRef ?? null,
    cholesterolMgPerRef: data.cholesterolMgPerRef ?? null,
  };
  if (data.nutritionBasisQuantity == null || data.nutritionBasisUnit == null) {
    return { ok: true, values, factor: 1 };
  }
  const factor = nutritionScaleFactor(data.nutritionBasisQuantity, data.nutritionBasisUnit, data.unitClass);
  if (!factor.ok) {
    const message =
      factor.error === "CLASS_MISMATCH"
        ? `The basis unit must match the ingredient's unit class (${data.unitClass}).`
        : factor.error === "UNKNOWN_UNIT"
          ? "Unknown basis unit."
          : "Basis quantity must be positive.";
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Ingredient input failed validation.",
        fieldErrors: { nutritionBasisUnit: [message] },
      },
    };
  }
  return { ok: true, values: scaleNutritionFields(values, factor.factor), factor: factor.factor };
}

function validationError(fieldErrors: Record<string, string[]>): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Ingredient input failed validation.",
      fieldErrors,
    },
  };
}

/**
 * Re-parses `input` with `ingredientSchema` (ADR-005) and, if valid,
 * inserts a new `CUSTOM` ingredient with `overridden: false` — this action
 * never sets `overridden` true on create; that only ever happens through
 * `overrideIngredientNutrition` editing a SEEDED row. Optional fields not
 * supplied by the caller persist as `null` (A-1).
 */

/**
 * openspec: generic-products — a product's generic must exist, be a
 * generic itself (one level), and share the unit class.
 */
async function validateGenericLink(
  genericOfId: number | null | undefined,
  unitClass: "MASS" | "VOLUME" | "COUNT",
): Promise<{ ok: true; value: number | null } | { ok: false; message: string }> {
  if (genericOfId == null) return { ok: true, value: null };
  const generic = await getIngredientRecordById(genericOfId);
  if (!generic) return { ok: false, message: "Generic ingredient not found." };
  if (generic.genericOfId !== null) return { ok: false, message: "That ingredient is itself a product — link to its generic instead." };
  if (generic.unitClass !== unitClass) return { ok: false, message: `The generic's unit class (${generic.unitClass}) must match.` };
  return { ok: true, value: genericOfId };
}


/** openspec: batch-nutrition-and-abv-entry — ABV is a ratio: applied AFTER
 * any basis scaling, VOLUME items only. */
function applyAbv(
  values: NutritionFieldValues,
  abvPercent: number | null | undefined,
  unitClass: "MASS" | "VOLUME" | "COUNT",
): { ok: true; values: NutritionFieldValues } | { ok: false } {
  if (abvPercent == null) return { ok: true, values };
  if (unitClass !== "VOLUME") return { ok: false };
  return { ok: true, values: { ...values, alcoholGPerRef: abvPercentToGramsPer100Ml(abvPercent) } };
}

export async function createIngredient(input: unknown): Promise<ActionResult<IngredientRecord>> {
  const parsed = ingredientSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.flatten().fieldErrors);
  }

  const data = parsed.data;
  const nutrition = resolveNutrition(data);
  if (!nutrition.ok) return nutrition;
  const withAbv = applyAbv(nutrition.values, data.alcoholAbvPercent, data.unitClass);
  if (!withAbv.ok) {
    return validationError({ alcoholAbvPercent: ["ABV entry needs a volume-class item."] });
  }
  nutrition.values = withAbv.values;
  const genericLink = await validateGenericLink(data.genericOfId, data.unitClass);
  if (!genericLink.ok) {
    return validationError({ genericOfId: [genericLink.message] });
  }
  const record = await createIngredientRecord({
    name: data.name,
    unitClass: data.unitClass,
    category: data.category,
    shelfLifeDays: data.shelfLifeDays ?? null,
    genericOfId: genericLink.value,
    readyToEat: data.readyToEat,
    ...nutrition.values,
    densityGPerMl: data.densityGPerMl ?? null,
    brand: data.brand ?? null,
    barcode: data.barcode ?? null,
    packageQuantity: data.packageQuantity ?? null,
    packageUnit: data.packageQuantity != null ? (data.packageUnit ?? null) : null,
  });
  // openspec: vitamin-tracking — basis-scaled sparse rows.
  await setIngredientMicronutrients(record.id, scaleMicronutrients(data.micronutrients ?? [], nutrition.factor));

  revalidatePath("/ingredients");
  return { ok: true, data: record };
}

/**
 * Re-parses `input` with the SAME `ingredientSchema` (ADR-005). Invalid
 * input leaves the target row untouched. Valid input updates nutrition
 * values; the `overridden` flag flips false -> true here (and only here,
 * per architecture.md §4) the first time a SEEDED row is edited, stays
 * true on every subsequent edit (AC-6), and is never semantically used for
 * CUSTOM rows (AC-5). `id`, `seedKey`, and `source` are never part of the
 * writable patch — identity is untouched regardless of `input`.
 */
export async function overrideIngredientNutrition(
  id: number,
  input: unknown,
): Promise<ActionResult<IngredientRecord>> {
  const parsed = ingredientSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.flatten().fieldErrors);
  }

  const existing = await getIngredientRecordById(id);
  if (!existing) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: `Ingredient ${id} was not found.` },
    };
  }

  const data = parsed.data;
  const overridden = existing.source === "SEEDED" ? true : existing.overridden;

  const nutrition = resolveNutrition(data);
  if (!nutrition.ok) return nutrition;
  const editWithAbv = applyAbv(nutrition.values, data.alcoholAbvPercent, data.unitClass);
  if (!editWithAbv.ok) {
    return validationError({ alcoholAbvPercent: ["ABV entry needs a volume-class item."] });
  }
  nutrition.values = editWithAbv.values;
  const editGenericLink = await validateGenericLink(data.genericOfId, data.unitClass);
  if (!editGenericLink.ok) {
    return validationError({ genericOfId: [editGenericLink.message] });
  }
  const record = await updateIngredientNutritionRecord(id, {
    name: data.name,
    unitClass: data.unitClass,
    category: data.category,
    shelfLifeDays: data.shelfLifeDays ?? null,
    genericOfId: editGenericLink.value,
    readyToEat: data.readyToEat,
    ...nutrition.values,
    densityGPerMl: data.densityGPerMl ?? null,
    brand: data.brand ?? null,
    barcode: data.barcode ?? null,
    packageQuantity: data.packageQuantity ?? null,
    packageUnit: data.packageQuantity != null ? (data.packageUnit ?? null) : null,
    overridden,
  });
  await setIngredientMicronutrients(id, scaleMicronutrients(data.micronutrients ?? [], nutrition.factor));

  revalidatePath("/ingredients");
  return { ok: true, data: record };
}

/**
 * Builds the friendly, FR-4-mandated referencing-records listing — every
 * referencing recipe named by `name`, plus a mention of "pantry" whenever
 * `inPantry` is true. Never a raw FK error (architecture.md §6).
 */
function referencedMessage(references: { recipes: Array<{ id: number; name: string }>; inPantry: boolean }): string {
  const reasons: string[] = [];
  if (references.recipes.length > 0) {
    const names = references.recipes.map((recipe) => recipe.name).join(", ");
    reasons.push(`recipe(s) ${names}`);
  }
  if (references.inPantry) {
    reasons.push("your pantry");
  }
  const listing = reasons.length > 0 ? reasons.join(" and ") : "other records";
  return `Cannot delete this ingredient — it is referenced by ${listing}.`;
}

/**
 * S-303 deletion rules (docs/stories/S-303, FR-4, architecture.md §4/§6):
 *   - Unresolvable `id` => `NOT_FOUND`, no write, no revalidate.
 *   - `source === "SEEDED"` => ALWAYS `SEEDED_NOT_DELETABLE`, regardless of
 *     references — seeded ingredients are never deletable, override-only
 *     (FR-3/FR-4/AC-3).
 *   - `source === "CUSTOM"` and referenced by >=1 recipe line and/or a
 *     pantry item => `REFERENCED`, with a friendly listing naming every
 *     referencing recipe and mentioning pantry presence — never a raw FK
 *     error.
 *   - `source === "CUSTOM"` and unreferenced => deletes the row,
 *     revalidates `/ingredients`, returns `{ id }`.
 *   - Race backstop (AC-4): the referencing pre-check runs first so the
 *     friendly path is normal, but if a reference is inserted concurrently
 *     (between the check and the delete) the DB's `ON DELETE RESTRICT`
 *     constraint still fires on the delete itself — that violation is
 *     caught here and mapped to the same `REFERENCED` shape rather than
 *     surfacing as an unhandled exception.
 */
export async function deleteIngredient(id: number): Promise<ActionResult<{ id: number }>> {
  const existing = await getIngredientRecordById(id);
  if (!existing) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: `Ingredient ${id} was not found.` },
    };
  }

  if (existing.source === "SEEDED") {
    return {
      ok: false,
      error: {
        code: "SEEDED_NOT_DELETABLE",
        message: "Seeded ingredients cannot be deleted. Edit its nutrition to override it instead.",
      },
    };
  }

  // openspec: generic-products — a generic with linked products is load-
  // bearing for interchangeable stock; refuse with names.
  const linkedProducts = await getProductsOfGeneric(id);
  if (linkedProducts.length > 0) {
    return {
      ok: false,
      error: {
        code: "REFERENCED",
        message: `Cannot delete this ingredient — it is the generic for product(s) ${linkedProducts
          .map((product) => product.name)
          .join(", ")}.`,
      },
    };
  }
  const references = await getIngredientReferences(id);
  if (references.recipes.length > 0 || references.inPantry) {
    return { ok: false, error: { code: "REFERENCED", message: referencedMessage(references) } };
  }

  try {
    await removeIngredientRecord(id);
  } catch {
    // Race backstop: the pre-check above reported no references, but the
    // DB's ON DELETE RESTRICT constraint fired anyway — a reference was
    // inserted concurrently, between the check and this delete.
    return {
      ok: false,
      error: {
        code: "REFERENCED",
        message: "Cannot delete this ingredient — it is referenced by other records.",
      },
    };
  }

  revalidatePath("/ingredients");
  return { ok: true, data: { id } };
}
