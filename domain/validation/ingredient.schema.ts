/**
 * Placeholder Zod schema (architecture.md §3 ADR-005). Real fields land
 * with the Ingredient CRUD stories. Pure, framework-free — imported by
 * both client forms and Server Actions once those exist.
 */
import { z } from "zod";

export const ingredientSchemaPlaceholder = z.object({
  name: z.string().min(1),
});
