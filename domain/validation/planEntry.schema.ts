/** Weekly-plan entry schema (openspec: weekly-planner) — shared by the add
 * form and the Server Action's re-parse (ADR-005). Pure, framework-free. */
import { z } from "zod";

export const planEntrySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a day.")
    .refine((raw) => {
      const parsed = new Date(`${raw}T00:00:00Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw;
    }, "Pick a real calendar day."),
  recipeId: z.number().int().positive(),
  portions: z.number().gt(0),
});

export type PlanEntryInput = z.infer<typeof planEntrySchema>;
