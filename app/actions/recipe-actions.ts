"use server";

/**
 * S-401 recipe creation Server Action (docs/stories/S-401-recipe-create.md,
 * architecture.md §4 Recipe/RecipeLine, §6 error-handling discriminated
 * union, ADR-005 shared Zod re-validation).
 *
 * Does not import drizzle-orm/better-sqlite3 directly — persistence is
 * delegated to the per-call `createDb()` entry points in `/data/recipes.ts`
 * (architecture.md §5 boundary rule: only `/data/**` imports drizzle).
 */
import { revalidatePath } from "next/cache";
import { recipeSchema } from "@/domain/validation/recipe.schema";
import { toCanonical } from "@/domain/units";
import type { RecipeRecord, RecipeLineRecord, RecipeLineInput } from "@/data/repositories/recipeRepo";
import {
  createRecipeWithLines,
  getRecipeRecordById,
  removeRecipeRecord,
  updateRecipeWithLines,
} from "@/data/recipes";

export interface ActionError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export type CreateRecipeResult =
  | { ok: true; data: RecipeRecord & { lines: RecipeLineRecord[] } }
  | { ok: false; error: ActionError };

export type UpdateRecipeResult =
  | { ok: true; data: RecipeRecord & { lines: RecipeLineRecord[] } }
  | { ok: false; error: ActionError };

export type DeleteRecipeResult = { ok: true; data: { id: number } } | { ok: false; error: ActionError };

function validationError(fieldErrors: Record<string, string[]>): { ok: false; error: ActionError } {
  return {
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Recipe input failed validation.",
      fieldErrors,
    },
  };
}

function notFoundError(id: number): { ok: false; error: ActionError } {
  return {
    ok: false,
    error: { code: "NOT_FOUND", message: `Recipe ${id} was not found.` },
  };
}

function toLineInputs(lines: Array<{ ingredientId: number; quantity: number; unit: string }>): RecipeLineInput[] {
  return lines.map((line) => {
    const { quantityCanonical, entryUnitClass } = toCanonical(line.quantity, line.unit);
    return {
      ingredientId: line.ingredientId,
      quantityCanonical,
      entryUnitClass,
      displayQuantity: line.quantity,
      displayUnit: line.unit,
    };
  });
}

/**
 * Re-parses `input` with `recipeSchema` (ADR-005 — never trusts the
 * caller, even the app's own client component). A schema violation
 * (including 0 lines, FR-13) returns `{ ok: false, error }` and writes
 * nothing. For each valid line, converts `quantity`/`unit` via
 * `domain/units.ts#toCanonical` into `quantityCanonical`/`entryUnitClass`,
 * persisting `quantity`/`unit` verbatim as `displayQuantity`/`displayUnit`
 * (FR-9 — same pattern as PantryItem). Delegates the write to
 * `recipeRepo.createWithLines` (via `data/recipes.ts`) — one transaction,
 * recipe + all lines together or neither.
 *
 * A line whose `ingredientId` parses (positive integer) but does not exist
 * in the `ingredient` table trips the FK; `createWithLines`'s transaction
 * rolls back synchronously and the underlying exception is caught here and
 * mapped to the same `{ ok: false, error }` shape (architecture.md §6) —
 * never an unhandled exception, never a partially written recipe row.
 */
export async function createRecipe(input: unknown): Promise<CreateRecipeResult> {
  const parsed = recipeSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.flatten().fieldErrors);
  }

  const data = parsed.data;
  const lines: RecipeLineInput[] = toLineInputs(data.lines);

  try {
    const record = await createRecipeWithLines({
      name: data.name,
      servings: data.servings,
      instructions: data.instructions ?? "",
      lines,
    });

    revalidatePath("/recipes");
    return { ok: true, data: record };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "PERSISTENCE_ERROR",
        message: error instanceof Error ? error.message : "Failed to save the recipe.",
      },
    };
  }
}

/**
 * S-402 (docs/stories/S-402-recipe-edit-delete.md, FR-14). Re-parses
 * `input` with the SAME `recipeSchema` `createRecipe` uses (ADR-005) — a
 * schema violation (including 0 lines, FR-13's invariant holding on edit
 * too, AC3) returns `{ ok: false, error }` and leaves the target recipe
 * untouched. A nonexistent `id` returns `NOT_FOUND` before any write is
 * attempted. Valid input replaces the recipe's metadata and its full line
 * set in one transaction (`recipeRepo.updateWithLines`'s replace-lines
 * semantics, S-202) via `data/recipes.ts#updateRecipeWithLines` — never a
 * diff-and-patch. A line whose `ingredientId` parses but does not
 * reference an existing ingredient row trips the FK inside that
 * transaction; the transaction rolls back synchronously (better-sqlite3)
 * and the exception is caught here and mapped to `{ ok: false, error }`
 * (architecture.md §6) — never an unhandled exception, never a partial
 * write.
 */
export async function updateRecipe(id: number, input: unknown): Promise<UpdateRecipeResult> {
  const parsed = recipeSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.flatten().fieldErrors);
  }

  const existing = await getRecipeRecordById(id);
  if (!existing) {
    return notFoundError(id);
  }

  const data = parsed.data;
  const lines: RecipeLineInput[] = toLineInputs(data.lines);

  try {
    const record = await updateRecipeWithLines(id, {
      name: data.name,
      servings: data.servings,
      instructions: data.instructions ?? "",
      lines,
    });

    revalidatePath("/recipes");
    return { ok: true, data: record };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "PERSISTENCE_ERROR",
        message: error instanceof Error ? error.message : "Failed to save the recipe.",
      },
    };
  }
}

/**
 * S-402 (docs/stories/S-402-recipe-edit-delete.md, FR-15). A nonexistent
 * `id` returns `NOT_FOUND`, writes nothing, and does not revalidate.
 * Otherwise deletes the recipe row — its `recipe_line` rows cascade at the
 * DB level (`ON DELETE CASCADE`, S-201); referenced ingredient catalog rows
 * and pantry rows are untouched, since this only ever deletes the `recipe`
 * row itself.
 */
export async function deleteRecipe(id: number): Promise<DeleteRecipeResult> {
  const existing = await getRecipeRecordById(id);
  if (!existing) {
    return notFoundError(id);
  }

  await removeRecipeRecord(id);

  revalidatePath("/recipes");
  return { ok: true, data: { id } };
}
