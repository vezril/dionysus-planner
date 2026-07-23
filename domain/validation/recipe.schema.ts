/**
 * Recipe Zod schema (architecture.md §3 ADR-005 — shared verbatim by the
 * client editor and the `createRecipe`/`updateRecipe` Server Actions'
 * independent re-parse).
 *
 * openspec: cooklang-recipe-editor — `instructions`/`lines` replaced by a
 * single `body: z.string()`: the whole recipe, typed with inline
 * `@Name(id){quantity%unit}` mentions (domain/cooklangParser.ts extracts
 * lines from it; see design.md Decisions 1/2/5). "At least one ingredient"
 * (FR-13) is now enforced post-parse — a zero-mention body is rejected by
 * the Server Action, not by this schema (this schema only knows it's a
 * string; it has no parser dependency, keeping the two concerns separate).
 *
 * `name` required non-empty; `servings` integer >= 1 (matches the DB CHECK
 * constraint); `body` required non-empty string (the real "did you type
 * anything" floor — the "did you type a valid mention" floor is the
 * parser's job, applied by the Server Action).
 */
import { z } from "zod";

/**
 * S-405 (docs/stories/S-405-recipe-tags.md) optional `tags` field: each
 * entry is trimmed; an entry that is empty/whitespace-only AFTER trimming
 * is a validation failure (same "reject, don't silently drop" posture),
 * surfaced under `fieldErrors.tags`. Trimmed tags are then deduplicated by
 * EXACT (case-sensitive) string equality — tags are free text and are
 * NEVER lowercase-folded (Dev Notes: "do not lowercase-fold silently;
 * store as typed"), so "Quick" and "quick" are two distinct tags, not a
 * duplicate pair.
 */
const tagsSchema = z
  .array(z.string().trim().min(1, "Tags cannot be empty."))
  .optional()
  .transform((tags) => (tags ? Array.from(new Set(tags)) : tags));

export const recipeSchema = z.object({
  name: z.string().trim().min(1),
  servings: z.number().int().min(1),
  body: z.string().trim().min(1, "Type at least one ingredient (start with @)."),
  tags: tagsSchema,
});

export type RecipeSchemaInput = z.infer<typeof recipeSchema>;
