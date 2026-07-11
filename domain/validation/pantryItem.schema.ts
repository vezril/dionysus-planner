/**
 * Pantry item Zod schema (architecture.md §3 ADR-005 — one schema shared
 * verbatim by the client form (`react-hook-form` + `@hookform/resolvers/zod`)
 * and the Server Action's independent re-parse, per docs/stories/S-304).
 * Pure, framework-free.
 *
 * This is the RAW form-input shape (display quantity/unit, pre-conversion)
 * — NOT the PantryItemRecord/DB shape. Canonical conversion (`toCanonical`)
 * happens afterward, in the Server Action (see
 * `app/actions/pantry-actions.ts`).
 */
import { z } from "zod";
import { UNITS } from "@/domain/units";

const unitKeys = Object.keys(UNITS) as [string, ...string[]];

export const pantryItemSchema = z.object({
  ingredientId: z
    .number({ error: "Select an ingredient." })
    .int({ message: "Select an ingredient." })
    .positive({ message: "Select an ingredient." }),
  quantity: z
    .number({ error: "Quantity is required." })
    .positive({ message: "Quantity must be greater than zero." }),
  unit: z.enum(unitKeys, { error: "Select a unit." }),
  mode: z.enum(["new", "increment", "replace"]).optional(),
});

export type PantryItemSchemaInput = z.infer<typeof pantryItemSchema>;
