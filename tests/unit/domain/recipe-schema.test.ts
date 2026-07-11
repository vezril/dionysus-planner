import { describe, expect, it } from "vitest";
import { UNITS } from "@/domain/units";
// `domain/validation/recipe.schema.ts` does not exist yet (only
// `domain/validation/ingredient.schema.ts` has landed so far) — this suite
// is intentionally RED (module-not-found) until the implementer builds
// `recipeSchema` per docs/stories/S-401-recipe-create.md's TEST task and
// architecture.md ADR-005 (one Zod schema shared by the client form and the
// Server Action).
import { recipeSchema } from "@/domain/validation/recipe.schema";

/**
 * S-401 recipe.schema.ts — traces to docs/stories/S-401-recipe-create.md
 * task list ("name required; servings integer ≥1 (0, -1, 2.5 all fail);
 * instructions optional-empty; lines array min length 1; each line:
 * ingredientId required, quantity positive, unit ∈ UNITS") and FR-13.
 *
 * ============================ PINNED CONTRACT ==============================
 * `domain/validation/recipe.schema.ts` exports `recipeSchema` (a Zod
 * object schema), parsed identically by the client form (react-hook-form +
 * `@hookform/resolvers/zod`) and the `createRecipe` Server Action
 * (architecture.md ADR-005 — no client-only validation path is trusted).
 *
 * Shape (input, pre-canonicalization — the Server Action converts
 * `quantity`/`unit` to `quantityCanonical`/`entryUnitClass` via
 * `domain/units.ts#toCanonical` AFTER this schema validates):
 *   {
 *     name: string;            // required, non-empty after trim
 *     servings: number;        // integer, >= 1
 *     instructions?: string;   // may be omitted or ""
 *     lines: Array<{
 *       ingredientId: number;  // required, positive integer
 *       quantity: number;      // required, > 0
 *       unit: string;          // required, must be a key of domain/units.ts UNITS
 *     }>;                      // min length 1 (FR-13)
 *   }
 *
 * On failure, `recipeSchema.safeParse(input)` returns `{ success: false,
 * error }` where `error.flatten().fieldErrors` carries top-level messages
 * (used directly as the Server Action's `fieldErrors` per architecture.md
 * §6's `{ ok: false, error: { code, message, fieldErrors? } }` union) and
 * `error.issues` carries the full per-line paths (e.g.
 * `["lines", 0, "ingredientId"]`) for anything nested.
 * ============================================================================
 */

/** Minimal shape of a Zod issue — typed locally so assertions below don't
 * carry an implicit-any dependency on the not-yet-existing schema module's
 * inferred error type. */
type MinimalIssue = { path: (string | number)[] };

function hasIssueAtPath(issues: unknown, path: string): boolean {
  return (issues as MinimalIssue[]).some((issue) => issue.path.join(".") === path);
}

function validLine(overrides: Partial<{ ingredientId: number; quantity: number; unit: string }> = {}) {
  return { ingredientId: 1, quantity: 400, unit: "g", ...overrides };
}

function validRecipe(overrides: Record<string, unknown> = {}) {
  return {
    name: "Chicken and Rice",
    servings: 4,
    instructions: "Cook it.",
    lines: [validLine()],
    ...overrides,
  };
}

describe("domain/validation/recipe.schema", () => {
  describe("a fully valid recipe", () => {
    it("parses successfully", () => {
      const result = recipeSchema.safeParse(validRecipe());
      expect(result.success).toBe(true);
    });
  });

  describe("name", () => {
    it("rejects a missing name", () => {
      const input = validRecipe();
      delete (input as Record<string, unknown>).name;
      const result = recipeSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.name).toBeDefined();
      }
    });

    it("rejects an empty name", () => {
      const result = recipeSchema.safeParse(validRecipe({ name: "" }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.name).toBeDefined();
      }
    });

    it("accepts a non-empty name", () => {
      const result = recipeSchema.safeParse(validRecipe({ name: "Tomato Soup" }));
      expect(result.success).toBe(true);
    });
  });

  describe("servings — integer >= 1 (architecture.md §4 CHECK, FR-13)", () => {
    it("accepts servings = 1", () => {
      expect(recipeSchema.safeParse(validRecipe({ servings: 1 })).success).toBe(true);
    });

    it("accepts servings = 8", () => {
      expect(recipeSchema.safeParse(validRecipe({ servings: 8 })).success).toBe(true);
    });

    it("rejects servings = 0", () => {
      const result = recipeSchema.safeParse(validRecipe({ servings: 0 }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.servings).toBeDefined();
      }
    });

    it("rejects a negative servings value (-1)", () => {
      const result = recipeSchema.safeParse(validRecipe({ servings: -1 }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.servings).toBeDefined();
      }
    });

    it("rejects a fractional servings value (2.5)", () => {
      const result = recipeSchema.safeParse(validRecipe({ servings: 2.5 }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.servings).toBeDefined();
      }
    });
  });

  describe("instructions — free text, optional-empty (A-2)", () => {
    it("accepts an empty string", () => {
      expect(recipeSchema.safeParse(validRecipe({ instructions: "" })).success).toBe(true);
    });

    it("accepts a fully omitted instructions field", () => {
      const input = validRecipe();
      delete (input as Record<string, unknown>).instructions;
      expect(recipeSchema.safeParse(input).success).toBe(true);
    });

    it("accepts free-text instructions", () => {
      expect(
        recipeSchema.safeParse(validRecipe({ instructions: "1. Boil.\n2. Simmer.\n3. Serve." })).success,
      ).toBe(true);
    });
  });

  describe("lines — array min length 1 (FR-13 AC2)", () => {
    it("rejects an empty lines array", () => {
      const result = recipeSchema.safeParse(validRecipe({ lines: [] }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.lines).toBeDefined();
        expect(result.error.flatten().fieldErrors.lines!.length).toBeGreaterThan(0);
      }
    });

    it("rejects a missing lines field entirely", () => {
      const input = validRecipe();
      delete (input as Record<string, unknown>).lines;
      expect(recipeSchema.safeParse(input).success).toBe(false);
    });

    it("accepts a single valid line", () => {
      expect(recipeSchema.safeParse(validRecipe({ lines: [validLine()] })).success).toBe(true);
    });

    it("accepts two or more valid lines", () => {
      expect(
        recipeSchema.safeParse(
          validRecipe({ lines: [validLine({ ingredientId: 1 }), validLine({ ingredientId: 2 })] }),
        ).success,
      ).toBe(true);
    });
  });

  describe("each line — ingredientId required (FR-13 AC3)", () => {
    it("rejects a line with no ingredientId", () => {
      const line = validLine();
      delete (line as Record<string, unknown>).ingredientId;
      const result = recipeSchema.safeParse(validRecipe({ lines: [line] }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(hasIssueAtPath(result.error.issues, "lines.0.ingredientId")).toBe(true);
      }
    });

    it("rejects an ingredientId of 0", () => {
      const result = recipeSchema.safeParse(validRecipe({ lines: [validLine({ ingredientId: 0 })] }));
      expect(result.success).toBe(false);
    });

    it("rejects a negative ingredientId", () => {
      const result = recipeSchema.safeParse(validRecipe({ lines: [validLine({ ingredientId: -3 })] }));
      expect(result.success).toBe(false);
    });
  });

  describe("each line — quantity must be positive (FR-13 AC3, architecture §4 CHECK-style rule)", () => {
    it("rejects a quantity of 0", () => {
      const result = recipeSchema.safeParse(validRecipe({ lines: [validLine({ quantity: 0 })] }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(hasIssueAtPath(result.error.issues, "lines.0.quantity")).toBe(true);
      }
    });

    it("rejects a negative quantity", () => {
      expect(recipeSchema.safeParse(validRecipe({ lines: [validLine({ quantity: -5 })] })).success).toBe(
        false,
      );
    });

    it("accepts a positive fractional quantity (e.g. 0.5)", () => {
      expect(recipeSchema.safeParse(validRecipe({ lines: [validLine({ quantity: 0.5 })] })).success).toBe(
        true,
      );
    });
  });

  describe("each line — unit must be a known member of domain/units.ts UNITS (FR-10)", () => {
    it("rejects an unknown unit string", () => {
      const result = recipeSchema.safeParse(validRecipe({ lines: [validLine({ unit: "banana-bunches" })] }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(hasIssueAtPath(result.error.issues, "lines.0.unit")).toBe(true);
      }
    });

    it.each(Object.keys(UNITS))("accepts the known unit %s", (unit) => {
      expect(recipeSchema.safeParse(validRecipe({ lines: [validLine({ unit })] })).success).toBe(true);
    });
  });

  describe("cross-class entry is permitted at the schema level (AC5 — save-time is permissive; comparison-time rules are FR-11/FR-12, not here)", () => {
    it("accepts a VOLUME unit (cup) alongside any ingredientId with no class cross-check at this layer", () => {
      // The schema has no access to the ingredient's primary class — that
      // join happens in the Server Action via toCanonical/recipeRepo, not
      // here. A cup entry must not be rejected by the schema itself.
      expect(recipeSchema.safeParse(validRecipe({ lines: [validLine({ unit: "cup", quantity: 1 })] })).success).toBe(
        true,
      );
    });
  });
});
