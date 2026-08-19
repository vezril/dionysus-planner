/**
 * Meal Log Zod schemas (openspec: meal-log-integration design.md Decision 3),
 * shared verbatim by the client forms and each Server Action's independent
 * re-parse (ADR-005). Pure, framework-free — mirrors dionysus-service's own
 * validation (ingredient-catalog/recipe-authoring/batch-tracking/meal-logging
 * specs) client-side, but the service's own re-validation remains
 * authoritative; these schemas exist for fast, friendly client feedback.
 */
import { z } from "zod";

const nonNegativeNumber = z.number().min(0);

export const mealLogIngredientSchema = z.object({
  name: z.string().trim().min(1),
  caloriesKcal: nonNegativeNumber,
  proteinG: nonNegativeNumber,
  carbsG: nonNegativeNumber,
  fatG: nonNegativeNumber,
  sodiumMg: nonNegativeNumber,
  abvPercent: z.number().min(0).nullish(),
  directlyLoggable: z.boolean(),
});
export type MealLogIngredientInput = z.infer<typeof mealLogIngredientSchema>;

const recipeLineSchema = z.object({
  ingredientId: z.number().int().positive(),
  quantity: z.number().gt(0),
  unit: z.string().trim().min(1),
});

export const mealLogRecipeSchema = z.object({
  name: z.string().trim().min(1),
  servings: z.number().int().min(1),
  lines: z.array(recipeLineSchema).min(1, "Add at least one ingredient line."),
});
export type MealLogRecipeInput = z.infer<typeof mealLogRecipeSchema>;

export const mealLogBatchSchema = z.object({
  recipeId: z.number().int().positive(),
  cookedAt: z.string().trim().min(1),
  servingsMade: z.number().gt(0),
});
export type MealLogBatchInput = z.infer<typeof mealLogBatchSchema>;

const batchPortionLineSchema = z.object({
  lineType: z.literal("batch_portion"),
  batchId: z.number().int().positive(),
  portions: z.number().gt(0),
});
const directConsumableLineSchema = z.object({
  lineType: z.literal("direct_consumable"),
  ingredientId: z.number().int().positive(),
  quantity: z.number().gt(0),
  unit: z.string().trim().min(1),
});
const mealLineSchema = z.discriminatedUnion("lineType", [batchPortionLineSchema, directConsumableLineSchema]);

export const mealLogMealSchema = z.object({
  eatenAt: z.string().trim().min(1),
  lines: z.array(mealLineSchema).min(1, "Add at least one line."),
});
export type MealLogMealInput = z.infer<typeof mealLogMealSchema>;
