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
import { parseRecipeBody } from "@/domain/cooklangParser";
import { expandPackEntry, isPackUnit } from "@/domain/packs";
import { getIngredientRecordById } from "@/data/ingredients";
import type { RecipeRecord, RecipeLineRecord, RecipeLineInput } from "@/data/repositories/recipeRepo";
import {
  createRecipeWithLines,
  getNutritionPreviewForLines,
  getRecipeRecordById,
  removeRecipeRecord,
  updateRecipeWithLines,
  createRecipeVariationRecord,
  setRecipeRatingRecord,
} from "@/data/recipes";
import { getResolvedTargets } from "@/data/nutritionTargets";
import type { NutritionTotals } from "@/domain/nutrition";

export interface ActionError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export type CreateRecipeResult =
  | { ok: true; data: RecipeRecord & { lines: RecipeLineRecord[]; tags: string[] } }
  | { ok: false; error: ActionError };

export type UpdateRecipeResult =
  | { ok: true; data: RecipeRecord & { lines: RecipeLineRecord[]; tags: string[] } }
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

function toLineInputs(
  lines: Array<{ ingredientId: number; quantity: number; unit: string; displayQuantity?: number; displayUnit?: string }>,
): RecipeLineInput[] {
  return lines.map((line) => {
    const { quantityCanonical, entryUnitClass } = toCanonical(line.quantity, line.unit);
    return {
      ingredientId: line.ingredientId,
      quantityCanonical,
      entryUnitClass,
      // openspec: pack-units — pack mentions store "1 pack" verbatim for
      // display while the canonical amount is the expanded real quantity.
      displayQuantity: line.displayQuantity ?? line.quantity,
      displayUnit: line.displayUnit ?? line.unit,
    };
  });
}

/** openspec: pack-units — expand pack/packs mentions through each
 * product's pack size before canonicalization. */
async function expandPackLines(
  parsedLines: Array<{ ingredientId: number; quantity: number; unit: string }>,
): Promise<
  | { ok: true; lines: Array<{ ingredientId: number; quantity: number; unit: string; displayQuantity?: number; displayUnit?: string }> }
  | { ok: false; errors: string[] }
> {
  const expanded: Array<{ ingredientId: number; quantity: number; unit: string; displayQuantity?: number; displayUnit?: string }> = [];
  const errors: string[] = [];
  const cache = new Map<number, Awaited<ReturnType<typeof getIngredientRecordById>>>();
  for (const line of parsedLines) {
    if (!isPackUnit(line.unit)) {
      expanded.push(line);
      continue;
    }
    if (!cache.has(line.ingredientId)) {
      cache.set(line.ingredientId, await getIngredientRecordById(line.ingredientId));
    }
    const record = cache.get(line.ingredientId) ?? null;
    const result = record === null ? "NO_PACK" : expandPackEntry(line.quantity, line.unit, record);
    if (result === "NO_PACK") {
      errors.push(
        `"${record?.name ?? `#${line.ingredientId}`}" is measured in packs but has no pack size — set "Pack size (optional)" on the product first.`,
      );
      continue;
    }
    expanded.push({
      ingredientId: line.ingredientId,
      quantity: result.quantity,
      unit: result.unit,
      displayQuantity: line.quantity,
      displayUnit: line.quantity === 1 ? "pack" : "packs",
    });
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, lines: expanded };
}

/**
 * openspec: cooklang-recipe-editor — extracts `{ingredientId, quantity,
 * unit}` lines from the typed `body` text via `domain/cooklangParser.ts`.
 * Any parse error (missing quantity, unknown unit, non-positive quantity)
 * or a body with zero mentions at all is surfaced as a `fieldErrors.body`
 * validation failure (design.md Decision 5) — mirrors the old "0 lines"
 * rejection (FR-13), just derived from parsed text instead of a
 * client-submitted array.
 */
async function resolveLinesFromBody(
  body: string,
): Promise<{ ok: true; lines: RecipeLineInput[] } | { ok: false; error: ActionError }> {
  const parsed = parseRecipeBody(body);

  if (parsed.errors.length > 0) {
    return validationError({ body: parsed.errors });
  }
  if (parsed.lines.length === 0) {
    return validationError({ body: ["Type at least one ingredient (start with @)."] });
  }

  const expanded = await expandPackLines(parsed.lines);
  if (!expanded.ok) {
    return validationError({ body: expanded.errors });
  }
  return { ok: true, lines: toLineInputs(expanded.lines) };
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
  const resolved = await resolveLinesFromBody(data.body);
  if (!resolved.ok) {
    return resolved;
  }

  try {
    const record = await createRecipeWithLines({
      name: data.name,
      servings: data.servings,
      instructions: data.body,
      lines: resolved.lines,
      tags: data.tags ?? [],
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
  const resolved = await resolveLinesFromBody(data.body);
  if (!resolved.ok) {
    return resolved;
  }

  try {
    const record = await updateRecipeWithLines(id, {
      name: data.name,
      servings: data.servings,
      instructions: data.body,
      lines: resolved.lines,
      tags: data.tags ?? [],
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
/** openspec: ratings-variants-links — 1–5 stars; null clears. */
export async function rateRecipe(id: number, rating: number | null): Promise<{ ok: boolean }> {
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) return { ok: false };
  await setRecipeRatingRecord(id, rating);
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${id}`);
  return { ok: true };
}

/** openspec: ratings-variants-links — duplicate as a linked variation;
 * returns the new recipe id (null if the source vanished). */
export async function createRecipeVariation(id: number): Promise<{ ok: boolean; newId: number | null }> {
  const newId = await createRecipeVariationRecord(id);
  if (newId === null) return { ok: false, newId: null };
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${id}`);
  return { ok: true, newId };
}

export async function deleteRecipe(id: number): Promise<DeleteRecipeResult> {
  const existing = await getRecipeRecordById(id);
  if (!existing) {
    return notFoundError(id);
  }

  await removeRecipeRecord(id);

  revalidatePath("/recipes");
  return { ok: true, data: { id } };
}

/**
 * openspec: nutrition-intake — live per-serving nutrition for the body
 * being TYPED, with the resolved daily targets for %-of-intake chips.
 * Unparseable bodies (mid-typing) return data: null — never an error.
 */
export type PreviewRecipeNutritionResult =
  | { ok: true; data: { perServing: NutritionTotals; targets: Record<string, number> } | null }
  | { ok: false; error: ActionError };

export async function previewRecipeNutrition(input: unknown): Promise<PreviewRecipeNutritionResult> {
  const shape =
    input !== null && typeof input === "object" ? (input as { body?: unknown; servings?: unknown }) : {};
  const body = typeof shape.body === "string" ? shape.body : "";
  const servings = typeof shape.servings === "number" && shape.servings > 0 ? shape.servings : null;
  if (body.trim() === "" || servings === null) return { ok: true, data: null };

  const parsed = parseRecipeBody(body);
  if (parsed.errors.length > 0 || parsed.lines.length === 0) return { ok: true, data: null };

  // openspec: pack-units — pack mentions preview at their expanded size;
  // a missing pack size just means no preview yet (mid-setup, not an error).
  const expanded = await expandPackLines(parsed.lines);
  if (!expanded.ok) return { ok: true, data: null };

  let lines: RecipeLineInput[];
  try {
    lines = toLineInputs(expanded.lines);
  } catch {
    return { ok: true, data: null };
  }

  try {
    const [nutrition, targets] = await Promise.all([
      getNutritionPreviewForLines(servings, lines),
      getResolvedTargets(),
    ]);
    return { ok: true, data: { perServing: nutrition.perServing, targets: targets.values } };
  } catch (error) {
    return {
      ok: false,
      error: { code: "PERSISTENCE_ERROR", message: error instanceof Error ? error.message : "Preview failed." },
    };
  }
}
