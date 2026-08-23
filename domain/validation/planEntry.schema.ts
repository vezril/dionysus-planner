/** Weekly-plan entry schema (openspec: weekly-planner) — shared by the add
 * form and the Server Action's re-parse (ADR-005). Pure, framework-free. */
import { z } from "zod";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a day.")
  .refine((raw) => {
    const parsed = new Date(`${raw}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw;
  }, "Pick a real calendar day.");

// openspec: planner-ready-to-eat — cook a recipe or eat a service batch.
// `kind` defaults to cook so pre-existing callers keep working.
export const planEntrySchema = z.preprocess(
  // An absent kind means cook — the pre-kinds callers' shape.
  (value) =>
    value !== null && typeof value === "object" && !("kind" in value) ? { ...value, kind: "cook" } : value,
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("cook"),
      date: dateSchema,
      recipeId: z.number().int().positive(),
      portions: z.number().gt(0),
    }),
    z.object({
      kind: z.literal("eat_batch"),
      date: dateSchema,
      batchId: z.number().int().positive(),
      portions: z.number().gt(0),
    }),
    // openspec: plan-pantry-backdate — plan a ready-to-eat pantry
    // product onto a day (nothing is consumed until actually eaten).
    z.object({
      kind: z.literal("eat_pantry"),
      date: dateSchema,
      ingredientId: z.number().int().positive(),
      portions: z.number().gt(0),
    }),
  ]),
);

export type PlanEntryInput = z.infer<typeof planEntrySchema>;
