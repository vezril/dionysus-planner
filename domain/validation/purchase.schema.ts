/**
 * Purchase Zod schema (openspec: pantry-item-detail; ADR-005 — one schema
 * shared by the client form and the Server Action's re-parse). Pure,
 * framework-free.
 *
 * price is the only required field (the feature is pointless without it);
 * store and bought-quantity are optional to keep logging low-friction
 * (design.md Decision 3). A quantity without a unit is meaningless, so
 * unit is required-iff-quantity. purchasedAt is a day-granularity
 * YYYY-MM-DD (no time component to get timezone-wrong) and must be a real
 * calendar date, not just regex-shaped.
 */
import { z } from "zod";

function isRealIsoDate(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const parsed = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw;
}

export const purchaseSchema = z
  .object({
    ingredientId: z.number().int().positive(),
    price: z.number().min(0),
    store: z.string().trim().min(1).nullish(),
    displayQuantity: z.number().gt(0).nullish(),
    displayUnit: z.string().trim().min(1).nullish(),
    purchasedAt: z.string().refine(isRealIsoDate, "Must be a real date (YYYY-MM-DD)."),
  })
  .refine((value) => value.displayQuantity == null || value.displayUnit != null, {
    message: "A quantity needs a unit.",
    path: ["displayUnit"],
  });

export type PurchaseSchemaInput = z.infer<typeof purchaseSchema>;
