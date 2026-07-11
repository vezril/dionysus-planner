import { describe, expect, it } from "vitest";
import { ingredientSchema } from "@/domain/validation/ingredient.schema";

/**
 * S-302: ingredient Zod schema (unit level).
 *
 * Traces to docs/stories/S-302-ingredient-create-override.md's first TEST
 * task, architecture.md ADR-005 (Zod schemas live in `/domain/validation/*`,
 * shared verbatim by client form + Server Action re-validation — "no
 * client-only validation path is ever trusted as authorization to write"),
 * and prd.md FR-2 (name, unit class, calories/protein/carbs/fat required;
 * fiber/sugar/sodium optional) / FR-12 (density, optional, g/mL).
 *
 * `domain/validation/ingredient.schema.ts` currently only exports the S-101
 * scaffold placeholder `ingredientSchemaPlaceholder` (`z.object({ name:
 * z.string().min(1) })`) — every test below is intentionally RED (`ingredient
 * Schema is not a function` / `undefined`) until the implementer builds the
 * real schema to this contract.
 *
 * ============================ PINNED CONTRACT ============================
 * export const ingredientSchema: ZodType<{
 *   name: string;                        // non-empty (after trim)
 *   unitClass: "MASS" | "VOLUME" | "COUNT";
 *   caloriesPerRef: number;              // >= 0, required
 *   proteinPerRef: number;               // >= 0, required
 *   carbsPerRef: number;                 // >= 0, required
 *   fatPerRef: number;                   // >= 0, required
 *   fiberPerRef?: number | null;         // >= 0 when present, nullable/optional (A-1)
 *   sugarPerRef?: number | null;         // >= 0 when present, nullable/optional
 *   sodiumMgPerRef?: number | null;      // >= 0 when present, nullable/optional
 *   densityGPerMl?: number | null;       // > 0 when present, nullable/optional (FR-12)
 * }>
 *
 * This is the ONE schema instance shared by the create action AND the
 * override action (ADR-005 — "one schema shared client + server", and this
 * story's own dev note: overrideIngredientNutrition re-parses with "the
 * same Zod schema" used by createIngredient). It is imported directly by
 * this test — no fixture duplication of the shape elsewhere.
 *
 * `.safeParse(input)` is the pinned entry point (used identically by the
 * client's `zodResolver` and by the Server Action's manual re-parse, per
 * ADR-005). On failure, `result.error.flatten().fieldErrors` MUST be a
 * `Record<string, string[]>` keyed by the exact field name shown above —
 * this is what `app/actions/ingredient-actions.ts` forwards verbatim as
 * the action result's `error.fieldErrors` (architecture.md §6).
 * ===========================================================================
 */

const VALID_FULL_PAYLOAD = {
  name: "Homemade Almond Milk",
  unitClass: "VOLUME" as const,
  caloriesPerRef: 39,
  proteinPerRef: 1.5,
  carbsPerRef: 1.2,
  fatPerRef: 2.9,
  fiberPerRef: 0.4,
  sugarPerRef: 0.6,
  sodiumMgPerRef: 63,
  densityGPerMl: 1.03,
};

const VALID_MINIMAL_PAYLOAD = {
  name: "Garlic, 1 clove",
  unitClass: "COUNT" as const,
  caloriesPerRef: 4,
  proteinPerRef: 0.2,
  carbsPerRef: 1,
  fatPerRef: 0,
};

describe("domain/validation/ingredient.schema — ingredientSchema", () => {
  it("accepts a fully-populated valid payload, including all optional fields (FR-2/FR-12)", () => {
    const result = ingredientSchema.safeParse(VALID_FULL_PAYLOAD);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject(VALID_FULL_PAYLOAD);
    }
  });

  it("accepts a valid payload with every optional field omitted (A-1: optional fiber/sugar/sodium/density)", () => {
    const result = ingredientSchema.safeParse(VALID_MINIMAL_PAYLOAD);

    expect(result.success).toBe(true);
  });

  it("accepts explicit null for fiber/sugar/sodium/density (A-1: 'omitted' stores as null, not just absent)", () => {
    const result = ingredientSchema.safeParse({
      ...VALID_MINIMAL_PAYLOAD,
      fiberPerRef: null,
      sugarPerRef: null,
      sodiumMgPerRef: null,
      densityGPerMl: null,
    });

    expect(result.success).toBe(true);
  });

  it("rejects a missing name with a field error on 'name' (FR-2 AC-2)", () => {
    const { name: _name, ...withoutName } = VALID_MINIMAL_PAYLOAD;
    const result = ingredientSchema.safeParse(withoutName);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.name).toBeDefined();
      expect(result.error.flatten().fieldErrors.name!.length).toBeGreaterThan(0);
    }
  });

  it("rejects an empty-string name with a field error on 'name'", () => {
    const result = ingredientSchema.safeParse({ ...VALID_MINIMAL_PAYLOAD, name: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.name).toBeDefined();
    }
  });

  it("rejects a missing unitClass with a field error on 'unitClass' (FR-2 AC-2: 'no unit class')", () => {
    const { unitClass: _unitClass, ...withoutUnitClass } = VALID_MINIMAL_PAYLOAD;
    const result = ingredientSchema.safeParse(withoutUnitClass);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.unitClass).toBeDefined();
    }
  });

  it("rejects an unrecognized unitClass value with a field error on 'unitClass'", () => {
    const result = ingredientSchema.safeParse({ ...VALID_MINIMAL_PAYLOAD, unitClass: "WEIGHT" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.unitClass).toBeDefined();
    }
  });

  it.each(["caloriesPerRef", "proteinPerRef", "carbsPerRef", "fatPerRef"] as const)(
    "rejects a missing required macro field '%s' with a field error on that key (FR-2 required macros)",
    (field) => {
      const payload = { ...VALID_MINIMAL_PAYLOAD };
      delete (payload as Record<string, unknown>)[field];

      const result = ingredientSchema.safeParse(payload);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors[field]).toBeDefined();
      }
    },
  );

  it.each(["caloriesPerRef", "proteinPerRef", "carbsPerRef", "fatPerRef"] as const)(
    "rejects a negative value for required macro '%s' with a field error on that key (FR-2 AC-2: negative macros)",
    (field) => {
      const result = ingredientSchema.safeParse({ ...VALID_MINIMAL_PAYLOAD, [field]: -1 });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors[field]).toBeDefined();
      }
    },
  );

  it.each(["fiberPerRef", "sugarPerRef", "sodiumMgPerRef"] as const)(
    "rejects a negative value for optional field '%s' when it IS provided (A-1)",
    (field) => {
      const result = ingredientSchema.safeParse({ ...VALID_MINIMAL_PAYLOAD, [field]: -5 });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors[field]).toBeDefined();
      }
    },
  );

  it("accepts a positive densityGPerMl (FR-12)", () => {
    const result = ingredientSchema.safeParse({ ...VALID_MINIMAL_PAYLOAD, densityGPerMl: 1.03 });

    expect(result.success).toBe(true);
  });

  it("rejects a zero or negative densityGPerMl when provided (FR-12: density must be a positive ratio)", () => {
    const zeroResult = ingredientSchema.safeParse({ ...VALID_MINIMAL_PAYLOAD, densityGPerMl: 0 });
    const negativeResult = ingredientSchema.safeParse({ ...VALID_MINIMAL_PAYLOAD, densityGPerMl: -1 });

    expect(zeroResult.success).toBe(false);
    expect(negativeResult.success).toBe(false);
    if (!negativeResult.success) {
      expect(negativeResult.error.flatten().fieldErrors.densityGPerMl).toBeDefined();
    }
  });

  it("reports every violated field at once for a multiply-invalid payload (client renders all inline errors together)", () => {
    const result = ingredientSchema.safeParse({
      name: "",
      unitClass: "WEIGHT",
      caloriesPerRef: -1,
      proteinPerRef: 1,
      carbsPerRef: 1,
      fatPerRef: 1,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      expect(Object.keys(fieldErrors).sort()).toEqual(["caloriesPerRef", "name", "unitClass"].sort());
    }
  });
});
