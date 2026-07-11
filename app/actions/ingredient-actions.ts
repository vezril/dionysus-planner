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
import { ingredientSchema } from "@/domain/validation/ingredient.schema";
import type { IngredientRecord } from "@/data/repositories/ingredientRepo";
import {
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
export async function createIngredient(input: unknown): Promise<ActionResult<IngredientRecord>> {
  const parsed = ingredientSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.flatten().fieldErrors);
  }

  const data = parsed.data;
  const record = await createIngredientRecord({
    name: data.name,
    unitClass: data.unitClass,
    caloriesPerRef: data.caloriesPerRef,
    proteinPerRef: data.proteinPerRef,
    carbsPerRef: data.carbsPerRef,
    fatPerRef: data.fatPerRef,
    fiberPerRef: data.fiberPerRef ?? null,
    sugarPerRef: data.sugarPerRef ?? null,
    sodiumMgPerRef: data.sodiumMgPerRef ?? null,
    densityGPerMl: data.densityGPerMl ?? null,
  });

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

  const record = await updateIngredientNutritionRecord(id, {
    name: data.name,
    unitClass: data.unitClass,
    caloriesPerRef: data.caloriesPerRef,
    proteinPerRef: data.proteinPerRef,
    carbsPerRef: data.carbsPerRef,
    fatPerRef: data.fatPerRef,
    fiberPerRef: data.fiberPerRef ?? null,
    sugarPerRef: data.sugarPerRef ?? null,
    sodiumMgPerRef: data.sodiumMgPerRef ?? null,
    densityGPerMl: data.densityGPerMl ?? null,
    overridden,
  });

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
