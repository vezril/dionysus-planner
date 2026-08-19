import { describe, expect, it } from "vitest";
import {
  mealLogBatchSchema,
  mealLogIngredientSchema,
  mealLogMealSchema,
  mealLogRecipeSchema,
} from "@/domain/validation/mealLog.schema";

describe("mealLogIngredientSchema", () => {
  const valid = {
    name: "Onion",
    caloriesKcal: 40,
    proteinG: 1.1,
    carbsG: 9,
    fatG: 0.1,
    sodiumMg: 4,
    directlyLoggable: false,
  };

  it("accepts a fully valid ingredient", () => {
    expect(mealLogIngredientSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a missing sodiumMg", () => {
    const { sodiumMg: _sodiumMg, ...rest } = valid;
    const result = mealLogIngredientSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a negative sodiumMg", () => {
    const result = mealLogIngredientSchema.safeParse({ ...valid, sodiumMg: -1 });
    expect(result.success).toBe(false);
  });

  it("accepts an optional abvPercent", () => {
    expect(mealLogIngredientSchema.safeParse({ ...valid, abvPercent: 5 }).success).toBe(true);
  });
});

describe("mealLogRecipeSchema", () => {
  const valid = {
    name: "Onion Soup",
    servings: 4,
    lines: [{ ingredientId: 1, quantity: 200, unit: "g" }],
  };

  it("accepts a valid recipe", () => {
    expect(mealLogRecipeSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects zero ingredient lines", () => {
    const result = mealLogRecipeSchema.safeParse({ ...valid, lines: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive servings", () => {
    expect(mealLogRecipeSchema.safeParse({ ...valid, servings: 0 }).success).toBe(false);
  });

  it("rejects a line with non-positive quantity", () => {
    const result = mealLogRecipeSchema.safeParse({
      ...valid,
      lines: [{ ingredientId: 1, quantity: 0, unit: "g" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("mealLogBatchSchema", () => {
  it("accepts a valid batch", () => {
    const result = mealLogBatchSchema.safeParse({
      recipeId: 1,
      cookedAt: "2026-08-19T12:00:00Z",
      servingsMade: 4,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-positive servingsMade", () => {
    const result = mealLogBatchSchema.safeParse({
      recipeId: 1,
      cookedAt: "2026-08-19T12:00:00Z",
      servingsMade: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("mealLogMealSchema", () => {
  it("accepts a meal with a batch-portion line", () => {
    const result = mealLogMealSchema.safeParse({
      eatenAt: "2026-08-19T18:00:00Z",
      lines: [{ lineType: "batch_portion", batchId: 1, portions: 1 }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a meal with a direct-consumable line", () => {
    const result = mealLogMealSchema.safeParse({
      eatenAt: "2026-08-19T18:00:00Z",
      lines: [{ lineType: "direct_consumable", ingredientId: 2, quantity: 1, unit: "each" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a meal mixing both line types", () => {
    const result = mealLogMealSchema.safeParse({
      eatenAt: "2026-08-19T18:00:00Z",
      lines: [
        { lineType: "batch_portion", batchId: 1, portions: 1 },
        { lineType: "direct_consumable", ingredientId: 2, quantity: 1, unit: "each" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero lines", () => {
    const result = mealLogMealSchema.safeParse({ eatenAt: "2026-08-19T18:00:00Z", lines: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a batch-portion line with non-positive portions", () => {
    const result = mealLogMealSchema.safeParse({
      eatenAt: "2026-08-19T18:00:00Z",
      lines: [{ lineType: "batch_portion", batchId: 1, portions: 0 }],
    });
    expect(result.success).toBe(false);
  });
});
