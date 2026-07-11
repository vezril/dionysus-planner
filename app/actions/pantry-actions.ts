"use server";

/**
 * S-304 pantry add/upsert & delete Server Actions
 * (docs/stories/S-304-pantry-add-upsert.md, architecture.md §4 PantryItem's
 * increment semantics + §6 error-handling discriminated union, ADR-005
 * shared Zod re-validation).
 *
 * Neither action imports drizzle-orm/better-sqlite3 directly — both
 * delegate persistence to the per-call `createDb()` entry points in
 * `/data/pantry.ts` (architecture.md §5 boundary rule: only `/data/**`
 * imports drizzle).
 *
 * Increment rule (human-confirmed, architecture.md §4): the incoming
 * quantity is converted onto the EXISTING row's canonical basis via
 * `resolveQuantityForComparison` — same class converts directly, cross-class
 * converts via the ingredient's density when present, and cross-class with
 * no density is REJECTED (never a silent guess) with `replace` offered as
 * the alternative.
 */
import { revalidatePath } from "next/cache";
import { pantryItemSchema, pantryItemUpdateSchema } from "@/domain/validation/pantryItem.schema";
import { resolveQuantityForComparison, toCanonical } from "@/domain/units";
import type { PantryItemRecord } from "@/data/repositories/pantryRepo";
import {
  getIngredientRecordById,
  getPantryItemByIngredientId,
  insertPantryItem,
  removePantryItem,
  updatePantryItemQuantity,
} from "@/data/pantry";

/**
 * Flat error shape (mirrors `app/actions/ingredient-actions.ts`'s
 * `ActionError` convention) rather than a strict per-`code` discriminated
 * union: `fieldErrors`/`existing` are optional and populated only for the
 * codes that carry them (`VALIDATION_ERROR` / `NEEDS_CHOICE` +
 * `INCREMENT_REJECTED_NO_DENSITY` respectively).
 */
export interface PantryActionError {
  code: "VALIDATION_ERROR" | "NEEDS_CHOICE" | "INCREMENT_REJECTED_NO_DENSITY";
  message: string;
  fieldErrors?: Record<string, string[]>;
  existing?: PantryItemRecord;
}

export type PantryActionResult =
  | { ok: true; data: PantryItemRecord }
  | { ok: false; error: PantryActionError };

export interface PantryDeleteError {
  code: string;
  message: string;
}

export type PantryDeleteResult = { ok: true } | { ok: false; error: PantryDeleteError };

export interface AddOrUpdatePantryItemInput {
  ingredientId: number;
  quantity: number;
  unit: string;
  mode?: "new" | "increment" | "replace";
}

function validationError(fieldErrors: Record<string, string[]>): PantryActionResult {
  return {
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Pantry item input failed validation.",
      fieldErrors,
    },
  };
}

/**
 * Re-parses `input` with `pantryItemSchema` (ADR-005), then applies the
 * upsert rule pinned by architecture.md §4:
 *  - No existing row => insert (canonical via `toCanonical`, display fields
 *    verbatim), regardless of `mode`.
 *  - Existing row + no `mode` => `NEEDS_CHOICE`, no mutation.
 *  - Existing row + `mode: "increment"` => convert the incoming quantity
 *    onto the EXISTING row's canonical basis (same class: direct; cross-
 *    class: via density if present) and sum; `entryUnitClass` stays the
 *    existing row's class. No density for a cross-class pair =>
 *    `INCREMENT_REJECTED_NO_DENSITY`, no mutation.
 *  - Existing row + `mode: "replace"` => unconditional overwrite of
 *    canonical + display + entryUnitClass (never rejects).
 * Display fields (`displayQuantity`/`displayUnit`) always reflect the
 * just-submitted entry after any successful write.
 */
export async function addOrUpdatePantryItem(input: unknown): Promise<PantryActionResult> {
  const parsed = pantryItemSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.flatten().fieldErrors);
  }

  const { ingredientId, quantity, unit, mode } = parsed.data;
  const incoming = toCanonical(quantity, unit);

  const existing = await getPantryItemByIngredientId(ingredientId);

  if (!existing) {
    const record = await insertPantryItem({
      ingredientId,
      quantityCanonical: incoming.quantityCanonical,
      entryUnitClass: incoming.entryUnitClass,
      displayQuantity: quantity,
      displayUnit: unit,
    });
    revalidatePath("/pantry");
    return { ok: true, data: record };
  }

  if (!mode || mode === "new") {
    return {
      ok: false,
      error: {
        code: "NEEDS_CHOICE",
        message:
          "This ingredient is already in your pantry. Choose Increment to add to the existing amount, or Replace to overwrite it.",
        existing,
      },
    };
  }

  if (mode === "replace") {
    const record = await updatePantryItemQuantity(existing.id, {
      quantityCanonical: incoming.quantityCanonical,
      entryUnitClass: incoming.entryUnitClass,
      displayQuantity: quantity,
      displayUnit: unit,
    });
    revalidatePath("/pantry");
    return { ok: true, data: record };
  }

  // mode === "increment"
  const ingredientRecord = await getIngredientRecordById(ingredientId);
  const densityGPerMl = ingredientRecord?.densityGPerMl ?? null;

  const convertedOntoExistingBasis = resolveQuantityForComparison(
    incoming.quantityCanonical,
    incoming.entryUnitClass,
    existing.entryUnitClass,
    densityGPerMl,
  );

  if (convertedOntoExistingBasis === "UNRESOLVED") {
    return {
      ok: false,
      error: {
        code: "INCREMENT_REJECTED_NO_DENSITY",
        message:
          "Cannot convert to this pantry item's existing unit — no density is set for this ingredient. Choose Replace instead.",
        existing,
      },
    };
  }

  const record = await updatePantryItemQuantity(existing.id, {
    quantityCanonical: existing.quantityCanonical + convertedOntoExistingBasis,
    entryUnitClass: existing.entryUnitClass,
    displayQuantity: quantity,
    displayUnit: unit,
  });
  revalidatePath("/pantry");
  return { ok: true, data: record };
}

/**
 * S-305: rewrites an EXISTING pantry row's quantity/unit by `id` (edit flow,
 * FR-7/FR-9). Unlike `addOrUpdatePantryItem`'s increment path, editing to a
 * unit in a different class than the row's current class is legal (Dev
 * Notes: "it simply changes `entryUnitClass`") — there is no class check
 * here, only the shared `pantryItemUpdateSchema` re-validation (ADR-005).
 * `quantityCanonical`/`entryUnitClass` are always derived via `toCanonical`
 * (never hand-duplicated math); `displayQuantity`/`displayUnit` are stored
 * verbatim (FR-9). On invalid input the existing row is left untouched.
 */
export async function updatePantryItem(
  id: number,
  input: { quantity: number; unit: string },
): Promise<PantryActionResult> {
  const parsed = pantryItemUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.flatten().fieldErrors);
  }

  const { quantity, unit } = parsed.data;
  const canonical = toCanonical(quantity, unit);

  const record = await updatePantryItemQuantity(id, {
    quantityCanonical: canonical.quantityCanonical,
    entryUnitClass: canonical.entryUnitClass,
    displayQuantity: quantity,
    displayUnit: unit,
  });
  revalidatePath("/pantry");
  return { ok: true, data: record };
}

export async function deletePantryItem(id: number): Promise<PantryDeleteResult> {
  await removePantryItem(id);
  revalidatePath("/pantry");
  return { ok: true };
}
