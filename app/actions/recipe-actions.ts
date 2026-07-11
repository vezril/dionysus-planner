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
import { createRecipeWithLines } from "@/data/recipes";

export interface ActionError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export type CreateRecipeResult =
  | { ok: true; data: RecipeRecord & { lines: RecipeLineRecord[] } }
  | { ok: false; error: ActionError };

function validationError(fieldErrors: Record<string, string[]>): CreateRecipeResult {
  return {
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Recipe input failed validation.",
      fieldErrors,
    },
  };
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
  const lines: RecipeLineInput[] = data.lines.map((line) => {
    const { quantityCanonical, entryUnitClass } = toCanonical(line.quantity, line.unit);
    return {
      ingredientId: line.ingredientId,
      quantityCanonical,
      entryUnitClass,
      displayQuantity: line.quantity,
      displayUnit: line.unit,
    };
  });

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
