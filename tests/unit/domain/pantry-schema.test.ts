import { describe, expect, it } from "vitest";
import { UNITS } from "@/domain/units";
import { pantryItemSchema } from "@/domain/validation/pantryItem.schema";

/**
 * S-304: pantry add/upsert — Zod input schema.
 *
 * Traces to docs/stories/S-304-pantry-add-upsert.md's first TEST task:
 * "domain/validation/pantryItem.schema.ts — ingredientId required,
 * quantity positive number, unit ∈ UNITS keys, mode ∈ {new, increment,
 * replace} as applicable." Also architecture.md ADR-005 (one Zod schema
 * shared by the client form and the Server Action's independent
 * server-side re-parse) and §6 error handling (Server Actions surface
 * `fieldErrors` from this schema's `safeParse` failures).
 *
 * `domain/validation/pantryItem.schema.ts` does not exist yet (only the
 * S-105-era `ingredientSchemaPlaceholder` lives in this directory) — every
 * test below is intentionally RED (module-not-found) until the
 * implementer builds it.
 *
 * ============================ PINNED CONTRACT ============================
 * export const pantryItemSchema = z.object({
 *   ingredientId: <positive integer>,
 *   quantity: <positive finite number>,
 *   unit: <string, must be a key of domain/units.ts's UNITS table>,
 *   mode: <optional, one of "new" | "increment" | "replace">,
 * });
 *
 * This is the RAW form-input shape (display quantity/unit, pre-
 * conversion) — NOT the PantryItemRecord/DB shape. Canonical conversion
 * (`toCanonical`) happens afterward, in the Server Action, per the
 * story's Dev Notes ("Canonical conversion happens in the Server Action
 * ... display values persist verbatim").
 *
 * `pantryItemSchema.safeParse(input)` on failure produces a Zod result
 * whose `.error.flatten().fieldErrors` keys match the field names above
 * (`ingredientId`, `quantity`, `unit`, `mode`) — this is what the Server
 * Action's `{ ok: false, error: { code: "VALIDATION_ERROR", fieldErrors }
 * }` result (tests/integration/pantry-actions.test.ts) surfaces
 * unchanged to the client form.
 * ===========================================================================
 */
describe("domain/validation/pantryItemSchema (S-304)", () => {
  const validBase = {
    ingredientId: 1,
    quantity: 2,
    unit: "lb",
  };

  describe("a fully valid payload", () => {
    it("parses successfully without a mode (new-item add)", () => {
      const result = pantryItemSchema.safeParse(validBase);
      expect(result.success).toBe(true);
    });

    it.each(["new", "increment", "replace"] as const)("parses successfully with mode=%s", (mode) => {
      const result = pantryItemSchema.safeParse({ ...validBase, mode });
      expect(result.success).toBe(true);
    });
  });

  describe("ingredientId — required", () => {
    it("rejects a missing ingredientId", () => {
      const { ingredientId: _omit, ...rest } = validBase;
      const result = pantryItemSchema.safeParse(rest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.ingredientId?.length).toBeGreaterThan(0);
      }
    });

    it("rejects a zero ingredientId", () => {
      const result = pantryItemSchema.safeParse({ ...validBase, ingredientId: 0 });
      expect(result.success).toBe(false);
    });

    it("rejects a negative ingredientId", () => {
      const result = pantryItemSchema.safeParse({ ...validBase, ingredientId: -3 });
      expect(result.success).toBe(false);
    });

    it("rejects a non-integer ingredientId", () => {
      const result = pantryItemSchema.safeParse({ ...validBase, ingredientId: 1.5 });
      expect(result.success).toBe(false);
    });

    it("rejects a non-numeric ingredientId", () => {
      const result = pantryItemSchema.safeParse({ ...validBase, ingredientId: "1" });
      expect(result.success).toBe(false);
    });
  });

  describe("quantity — positive number", () => {
    it("rejects a zero quantity", () => {
      const result = pantryItemSchema.safeParse({ ...validBase, quantity: 0 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.quantity?.length).toBeGreaterThan(0);
      }
    });

    it("rejects a negative quantity", () => {
      const result = pantryItemSchema.safeParse({ ...validBase, quantity: -2 });
      expect(result.success).toBe(false);
    });

    it("rejects a non-numeric quantity", () => {
      const result = pantryItemSchema.safeParse({ ...validBase, quantity: "two" });
      expect(result.success).toBe(false);
    });

    it("rejects a missing quantity", () => {
      const { quantity: _omit, ...rest } = validBase;
      const result = pantryItemSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("accepts a fractional positive quantity (e.g. 0.5 cup)", () => {
      const result = pantryItemSchema.safeParse({ ...validBase, unit: "cup", quantity: 0.5 });
      expect(result.success).toBe(true);
    });
  });

  describe("unit — must be a key of domain/units.ts's UNITS table (FR-10)", () => {
    it.each(Object.keys(UNITS))("accepts every real unit key: %s", (unit) => {
      const result = pantryItemSchema.safeParse({ ...validBase, unit });
      expect(result.success).toBe(true);
    });

    it("rejects an unknown unit string", () => {
      const result = pantryItemSchema.safeParse({ ...validBase, unit: "banana-bunches" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.unit?.length).toBeGreaterThan(0);
      }
    });

    it("is case-sensitive (rejects 'ML' when the real key is 'mL')", () => {
      const result = pantryItemSchema.safeParse({ ...validBase, unit: "ML" });
      expect(result.success).toBe(false);
    });

    it("rejects a missing unit", () => {
      const { unit: _omit, ...rest } = validBase;
      const result = pantryItemSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("rejects an empty-string unit", () => {
      const result = pantryItemSchema.safeParse({ ...validBase, unit: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("mode — optional, one of {new, increment, replace} when present", () => {
    it("rejects an unrecognized mode value", () => {
      const result = pantryItemSchema.safeParse({ ...validBase, mode: "merge" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.mode?.length).toBeGreaterThan(0);
      }
    });

    it("omitting mode entirely is valid (defaults are the action's concern, not the schema's)", () => {
      const result = pantryItemSchema.safeParse(validBase);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mode).toBeUndefined();
      }
    });
  });

  describe("multi-field failure reporting (ADR-005: fieldErrors drive inline client errors)", () => {
    it("reports every invalid field at once, not just the first", () => {
      const result = pantryItemSchema.safeParse({ ingredientId: 0, quantity: -1, unit: "nope" });
      expect(result.success).toBe(false);
      if (!result.success) {
        const fieldErrors = result.error.flatten().fieldErrors;
        expect(Object.keys(fieldErrors).sort()).toEqual(["ingredientId", "quantity", "unit"].sort());
      }
    });
  });
});
