/**
 * Recipe Zod schema (architecture.md §3 ADR-005 — one schema shared
 * verbatim by the client editor (`react-hook-form` + `@hookform/resolvers
 * /zod` where used) and the `createRecipe` Server Action's independent
 * re-parse, per docs/stories/S-401-recipe-create.md). Pure, framework-free.
 *
 * Field semantics per architecture.md §4 Recipe/RecipeLine: `name` required
 * non-empty; `servings` integer >= 1 (matches the DB CHECK constraint);
 * `instructions` free text, optional/empty (A-2); `lines` at least one
 * entry (FR-13), each requiring a positive integer `ingredientId`, a
 * positive `quantity`, and a `unit` that is a known key of
 * `domain/units.ts`'s `UNITS` table (FR-10). Deliberately permissive on
 * unit *class* — a line entered in a class other than its ingredient's
 * primary class (e.g. a MASS ingredient measured in `cup`) is not this
 * schema's concern (AC5); that join only exists in the Server Action /
 * repository layer, not here.
 */
import { z } from "zod";
import { UNITS } from "@/domain/units";

const UNIT_KEYS = Object.keys(UNITS) as [string, ...string[]];

const recipeLineSchema = z.object({
  ingredientId: z.number().int().positive(),
  quantity: z.number().gt(0),
  unit: z.enum(UNIT_KEYS),
});

/**
 * S-405 (docs/stories/S-405-recipe-tags.md) optional `tags` field: each
 * entry is trimmed; an entry that is empty/whitespace-only AFTER trimming
 * is a validation failure (same "reject, don't silently drop" posture the
 * schema already takes for a 0-length `lines` array), surfaced under
 * `fieldErrors.tags`. Trimmed tags are then deduplicated by EXACT
 * (case-sensitive) string equality — tags are free text and are NEVER
 * lowercase-folded (Dev Notes: "do not lowercase-fold silently; store as
 * typed"), so "Quick" and "quick" are two distinct tags, not a duplicate
 * pair.
 */
const tagsSchema = z
  .array(z.string().trim().min(1, "Tags cannot be empty."))
  .optional()
  .transform((tags) => (tags ? Array.from(new Set(tags)) : tags));

export const recipeSchema = z.object({
  name: z.string().trim().min(1),
  servings: z.number().int().min(1),
  instructions: z.string().optional(),
  lines: z.array(recipeLineSchema).min(1, "Add at least one ingredient line."),
  tags: tagsSchema,
});

export type RecipeSchemaInput = z.infer<typeof recipeSchema>;
export type RecipeLineSchemaInput = z.infer<typeof recipeLineSchema>;
