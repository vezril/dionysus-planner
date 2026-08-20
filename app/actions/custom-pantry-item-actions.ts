"use server";

/**
 * openspec: custom-pantry-items — the one-step "branded product into the
 * pantry" Server Action. App-wide `ActionResult`/`ActionError` contract,
 * shared-Zod re-validation (ADR-005), no drizzle imports (§5 boundary —
 * persistence via `data/customPantryItems.ts`, which owns the single
 * ingredient+pantry transaction).
 */
import { revalidatePath } from "next/cache";
import { customPantryItemSchema } from "@/domain/validation/customPantryItem.schema";
import { toCanonical } from "@/domain/units";
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

  const { quantityCanonical, entryUnitClass } = toCanonical(data.initialQuantity, data.unit);

  try {
    const result = await createCustomPantryItemRecords({
      name: data.name,
      unitClass: data.unitClass,
      densityGPerMl: data.densityGPerMl ?? null,
      caloriesPerRef: data.caloriesPerRef,
      proteinPerRef: data.proteinPerRef,
      carbsPerRef: data.carbsPerRef,
      fatPerRef: data.fatPerRef,
      fiberPerRef: data.fiberPerRef ?? null,
      sugarPerRef: data.sugarPerRef ?? null,
      sodiumMgPerRef: data.sodiumMgPerRef ?? null,
      brand: data.brand ?? null,
      barcode: data.barcode ?? null,
      packageQuantity: data.packageQuantity ?? null,
      packageUnit: data.packageQuantity != null ? (data.packageUnit ?? null) : null,
      quantityCanonical,
      entryUnitClass,
      displayQuantity: data.initialQuantity,
      displayUnit: data.unit,
    });

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
