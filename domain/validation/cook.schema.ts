/**
 * Cook-flow input schema (openspec: cook-recipe-into-meals design D4).
 * Pure, framework-free; shared by the cook dialog and the Server Action's
 * re-parse (ADR-005). The server re-derives every line status — these are
 * structural rules only.
 */
import { z } from "zod";
import { UNITS } from "@/domain/units";

const consumeLine = z.object({
  lineId: z.number().int().positive(),
  action: z.literal("consume"),
  // openspec: generic-products — which interchangeable product to use
  // when the line's group has several stocked rows.
  usePantryItemId: z.number().int().positive().optional(),
});

const ignoreLine = z.object({
  lineId: z.number().int().positive(),
  action: z.literal("ignore"),
});

const substituteLine = z.object({
  lineId: z.number().int().positive(),
  action: z.literal("substitute"),
  substitutePantryItemId: z.number().int().positive(),
  substituteQuantity: z.number().gt(0),
  substituteUnit: z.string().refine((unit) => unit in UNITS, { message: "Pick a known unit." }),
});

export const cookLineChoiceSchema = z.discriminatedUnion("action", [consumeLine, ignoreLine, substituteLine]);

export const cookRecipeSchema = z.object({
  recipeId: z.number().int().positive(),
  portions: z.number().gt(0),
  // openspec: eat-now-and-quick-log — portions logged as eaten immediately
  // after the cook (≤ portions enforced in the action, not here).
  eatNowPortions: z.number().min(0).default(0),
  lines: z.array(cookLineChoiceSchema).min(1),
});

export type CookRecipeInput = z.infer<typeof cookRecipeSchema>;
export type CookLineChoice = z.infer<typeof cookLineChoiceSchema>;
