"use server";

/**
 * openspec: custom-pantry-items — the one-step "branded product into the
 * pantry" Server Action. App-wide `ActionResult`/`ActionError` contract,
 * shared-Zod re-validation (ADR-005), no drizzle imports (§5 boundary —
 * persistence via `data/customPantryItems.ts`, which owns the single
 * ingredient+pantry transaction).
 */
import { revalidatePath } from "next/cache";
import { abvPercentToGramsPer100Ml } from "@/domain/abv";
import { scaleMicronutrients } from "@/domain/micronutrients";
import { createIngredientRecord, findGenericByExactName, getIngredientRecordById, setIngredientCategories, setIngredientMicronutrients } from "@/data/ingredients";
import { customPantryItemSchema } from "@/domain/validation/customPantryItem.schema";
import { toCanonical } from "@/domain/units";
import { nutritionScaleFactor, scaleNutritionFields } from "@/domain/nutritionBasis";
import type { CustomPantryItemResult } from "@/data/customPantryItems";
import { createCustomPantryItemRecords, findIngredientByBarcode } from "@/data/customPantryItems";

export interface ActionError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

const DUPLICATE_BARCODE_ERROR: ActionResult<never> = {
  ok: false,
  error: {
    code: "VALIDATION_ERROR",
    message: "Custom item input failed validation.",
    fieldErrors: { barcode: ["An item with this barcode already exists."] },
  },
};

/**
 * Re-parses with `customPantryItemSchema` (zero initialQuantity is valid —
 * the row is born out-of-stock). A duplicate barcode is a friendly field
 * error via pre-check, with the DB's UNIQUE index as the race backstop
 * (same pre-check-then-catch pattern as deleteIngredient's REFERENCED
 * handling) — never a raw constraint message.
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

export async function createCustomPantryItem(
  input: unknown,
): Promise<ActionResult<CustomPantryItemResult>> {
  const parsed = customPantryItemSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Custom item input failed validation.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
    };
  }

  const data = parsed.data;

  if (data.barcode != null && (await findIngredientByBarcode(data.barcode)) !== null) {
    return DUPLICATE_BARCODE_ERROR;
  }

  // openspec: nutrition-basis-and-edit — convert label-basis nutrition
  // ("per 355 mL") to per-reference before persisting; absent basis is a
  // no-op. Cross-class basis is a field error, never a silent guess.
  let nutrition = {
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
  let basisFactor = 1;
  if (data.nutritionBasisQuantity != null && data.nutritionBasisUnit != null) {
    const factor = nutritionScaleFactor(data.nutritionBasisQuantity, data.nutritionBasisUnit, data.unitClass);
    if (!factor.ok) {
      const message =
        factor.error === "CLASS_MISMATCH"
          ? `The basis unit must match the item's unit class (${data.unitClass}).`
          : factor.error === "UNKNOWN_UNIT"
            ? "Unknown basis unit."
            : "Basis quantity must be positive.";
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Custom item input failed validation.",
          fieldErrors: { nutritionBasisUnit: [message] },
        },
      };
    }
    nutrition = scaleNutritionFields(nutrition, factor.factor);
    basisFactor = factor.factor;
  }

  // openspec: batch-nutrition-and-abv-entry — ratio, basis-exempt.
  if (data.alcoholAbvPercent != null) {
    if (data.unitClass !== "VOLUME") {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Custom item input failed validation.",
          fieldErrors: { alcoholAbvPercent: ["ABV entry needs a volume-class item."] },
        },
      };
    }
    nutrition = { ...nutrition, alcoholGPerRef: abvPercentToGramsPer100Ml(data.alcoholAbvPercent) };
  }

  // openspec: inline-generic-create — reuse-or-create a generic by name,
  // seeded with this item's resolved nutrition.
  let genericOfId = data.genericOfId;
  if (genericOfId == null && data.newGenericName) {
    const existingGeneric = await findGenericByExactName(data.newGenericName, data.unitClass);
    if (existingGeneric) {
      genericOfId = existingGeneric.id;
    } else {
      const generic = await createIngredientRecord({
        name: data.newGenericName,
        unitClass: data.unitClass,
        category: data.category,
        shelfLifeDays: null,
        genericOfId: null,
        readyToEat: false,
        ...nutrition,
        densityGPerMl: data.densityGPerMl ?? null,
        brand: null,
        barcode: null,
        packageQuantity: null,
        packageUnit: null,
      });
      genericOfId = generic.id;
    }
  }

  const genericLink = await validateGenericLink(genericOfId, data.unitClass);
  if (!genericLink.ok) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Custom item input failed validation.",
        fieldErrors: { genericOfId: [genericLink.message] },
      },
    };
  }

  const { quantityCanonical, entryUnitClass } = toCanonical(data.initialQuantity, data.unit);

  try {
    const result = await createCustomPantryItemRecords({
      name: data.name,
      unitClass: data.unitClass,
      category: data.category,
      shelfLifeDays: data.shelfLifeDays ?? null,
      genericOfId: genericLink.value,
      readyToEat: data.readyToEat,
      densityGPerMl: data.densityGPerMl ?? null,
      ...nutrition,
      brand: data.brand ?? null,
      barcode: data.barcode ?? null,
      packageQuantity: data.packageQuantity ?? null,
      packageUnit: data.packageQuantity != null ? (data.packageUnit ?? null) : null,
      packQuantity: data.packQuantity ?? null,
      packUnit: data.packQuantity != null ? (data.packUnit ?? null) : null,
      quantityCanonical,
      entryUnitClass,
      displayQuantity: data.initialQuantity,
      displayUnit: data.unit,
    });

    // openspec: vitamin-tracking — basis-scaled sparse rows.
    await setIngredientMicronutrients(
      result.ingredient.id,
      scaleMicronutrients(data.micronutrients ?? [], basisFactor),
    );
    await setIngredientCategories(result.ingredient.id, data.categories ?? []);

    revalidatePath("/pantry", "layout");
    revalidatePath("/ingredients");
    return { ok: true, data: result };
  } catch (error) {
    // Race backstop: a concurrent insert won the barcode between the
    // pre-check and this write.
    if (error instanceof Error && /UNIQUE.*barcode/i.test(error.message)) {
      return DUPLICATE_BARCODE_ERROR;
    }
    return {
      ok: false,
      error: {
        code: "PERSISTENCE_ERROR",
        message: error instanceof Error ? error.message : "Failed to save the custom item.",
      },
    };
  }
}
