import { describe, expect, it } from "vitest";
import { recipeSchema } from "@/domain/validation/recipe.schema";

/**
 * openspec: cooklang-recipe-editor — `recipeSchema` drops `instructions`/
 * `lines` in favor of a single `body: string` (the typed recipe, with
 * inline `@Name(id){quantity%unit}` mentions). This schema layer only
 * validates that `body` is a non-empty string; "does it contain at least
 * one valid mention" is `domain/cooklangParser.ts` + the Server Action's
 * concern (tested at the integration level), not this schema's.
 *
 * Shape (input):
 *   {
 *     name: string;      // required, non-empty after trim
 *     servings: number;  // integer, >= 1
 *     body: string;      // required, non-empty after trim
 *     tags?: string[];
 *   }
 */

function validRecipe(overrides: Record<string, unknown> = {}) {
  return {
    name: "Chicken and Rice",
    servings: 4,
    body: "Cook the @Chicken(1){400%g} with the @Rice(2){200%g}.",
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

  describe("body — the typed recipe (openspec: cooklang-recipe-editor)", () => {
    it("rejects a missing body field entirely", () => {
      const input = validRecipe();
      delete (input as Record<string, unknown>).body;
      const result = recipeSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.body).toBeDefined();
      }
    });

    it("rejects an empty body", () => {
      const result = recipeSchema.safeParse(validRecipe({ body: "" }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.body).toBeDefined();
      }
    });

    it("rejects a whitespace-only body", () => {
      const result = recipeSchema.safeParse(validRecipe({ body: "   \n  " }));
      expect(result.success).toBe(false);
    });

    it("accepts a non-empty body string, regardless of whether it contains a mention (the schema doesn't parse — the Server Action does)", () => {
      expect(recipeSchema.safeParse(validRecipe({ body: "Just mix everything together." })).success).toBe(true);
    });

    it("accepts a body containing one or more @Name(id){quantity%unit} mentions", () => {
      expect(
        recipeSchema.safeParse(
          validRecipe({ body: "Fry the @Onion, yellow, medium(11){1} in @Olive oil(42){2%tbsp}." }),
        ).success,
      ).toBe(true);
    });
  });
});
