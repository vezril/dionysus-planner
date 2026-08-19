import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * openspec: meal-log-integration — `app/actions/meal-log-actions.ts`.
 *
 * Unlike every other action-file integration test in this app, there is no
 * database in this feature's path — `services/dionysusService.ts` is mocked
 * instead of spinning up a temp better-sqlite3 DB (design.md Decision 7).
 * `next/cache`'s `revalidatePath` is mocked, same as every other suite here
 * (it throws outside an active Next.js request/action scope).
 *
 * ============================ PINNED CONTRACT ============================
 * Every action: (input: unknown) => Promise<{ ok: true; data } | { ok: false; error }>
 * error: { code: string; message: string; fieldErrors?: Record<string, string[]> }
 * Codes: VALIDATION_ERROR (schema rejects input) | SERVICE_ERROR (dionysus-service
 * call throws — network failure or non-2xx response).
 * ===========================================================================
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const serviceMocks = vi.hoisted(() => ({
  createIngredient: vi.fn(),
  createRecipe: vi.fn(),
  createBatch: vi.fn(),
  createMeal: vi.fn(),
}));

vi.mock("@/services/dionysusService", async () => {
  const actual = await vi.importActual<typeof import("@/services/dionysusService")>(
    "@/services/dionysusService",
  );
  return {
    ...actual,
    createIngredient: serviceMocks.createIngredient,
    createRecipe: serviceMocks.createRecipe,
    createBatch: serviceMocks.createBatch,
    createMeal: serviceMocks.createMeal,
  };
});

import { DionysusServiceError } from "@/services/dionysusService";
import {
  createMealLogBatch,
  createMealLogIngredient,
  createMealLogRecipe,
  logMeal,
} from "@/app/actions/meal-log-actions";

describe("meal-log-actions", () => {
  beforeEach(() => {
    process.env.DIONYSUS_SERVICE_URL = "http://dionysus-service.test";
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.DIONYSUS_SERVICE_URL;
  });

  describe("createMealLogIngredient", () => {
    it("rejects input missing sodiumMg without calling the service", async () => {
      const result = await createMealLogIngredient({
        name: "Onion",
        caloriesKcal: 40,
        proteinG: 1,
        carbsG: 9,
        fatG: 0,
        directlyLoggable: false,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
      }
      expect(serviceMocks.createIngredient).not.toHaveBeenCalled();
    });

    it("calls the service and returns its data on valid input", async () => {
      const created = {
        id: 1,
        name: "Onion",
        caloriesKcal: 40,
        proteinG: 1,
        carbsG: 9,
        fatG: 0,
        sodiumMg: 4,
        abvPercent: null,
        directlyLoggable: false,
      };
      serviceMocks.createIngredient.mockResolvedValue(created);

      const result = await createMealLogIngredient({
        name: "Onion",
        caloriesKcal: 40,
        proteinG: 1,
        carbsG: 9,
        fatG: 0,
        sodiumMg: 4,
        directlyLoggable: false,
      });

      expect(result).toEqual({ ok: true, data: created });
      expect(serviceMocks.createIngredient).toHaveBeenCalledWith(
        "http://dionysus-service.test",
        expect.objectContaining({ name: "Onion", sodiumMg: 4 }),
      );
    });

    it("maps a DionysusServiceError to SERVICE_ERROR, not an unhandled exception", async () => {
      serviceMocks.createIngredient.mockRejectedValue(new DionysusServiceError("unreachable", undefined));

      const result = await createMealLogIngredient({
        name: "Onion",
        caloriesKcal: 40,
        proteinG: 1,
        carbsG: 9,
        fatG: 0,
        sodiumMg: 4,
        directlyLoggable: false,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("SERVICE_ERROR");
        expect(result.error.message).toBe("unreachable");
      }
    });
  });

  describe("createMealLogRecipe", () => {
    it("rejects zero ingredient lines", async () => {
      const result = await createMealLogRecipe({ name: "Soup", servings: 4, lines: [] });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(serviceMocks.createRecipe).not.toHaveBeenCalled();
    });

    it("calls the service on valid input", async () => {
      const created = {
        id: 1,
        name: "Soup",
        servings: 4,
        lines: [{ ingredientId: 1, quantity: 200, unit: "g" }],
        perServingNutrition: { caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0, sodiumMg: 0 },
      };
      serviceMocks.createRecipe.mockResolvedValue(created);

      const result = await createMealLogRecipe({
        name: "Soup",
        servings: 4,
        lines: [{ ingredientId: 1, quantity: 200, unit: "g" }],
      });

      expect(result).toEqual({ ok: true, data: created });
    });
  });

  describe("createMealLogBatch", () => {
    it("rejects a non-positive servingsMade", async () => {
      const result = await createMealLogBatch({
        recipeId: 1,
        cookedAt: "2026-08-19T12:00:00Z",
        servingsMade: 0,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(serviceMocks.createBatch).not.toHaveBeenCalled();
    });

    it("surfaces a service rejection (e.g. unknown recipeId) as SERVICE_ERROR", async () => {
      serviceMocks.createBatch.mockRejectedValue(new DionysusServiceError("unknown recipeId: 999", 400));

      const result = await createMealLogBatch({
        recipeId: 999,
        cookedAt: "2026-08-19T12:00:00Z",
        servingsMade: 4,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("SERVICE_ERROR");
        expect(result.error.message).toContain("unknown recipeId");
      }
    });
  });

  describe("logMeal", () => {
    it("rejects zero lines", async () => {
      const result = await logMeal({ eatenAt: "2026-08-19T18:00:00Z", lines: [] });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(serviceMocks.createMeal).not.toHaveBeenCalled();
    });

    it("surfaces an over-portioning rejection from the service", async () => {
      serviceMocks.createMeal.mockRejectedValue(
        new DionysusServiceError("portions (5) exceeds remaining (4) for batchId=1", 400),
      );

      const result = await logMeal({
        eatenAt: "2026-08-19T18:00:00Z",
        lines: [{ lineType: "batch_portion", batchId: 1, portions: 5 }],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("SERVICE_ERROR");
        expect(result.error.message).toContain("exceeds remaining");
      }
    });

    it("logs a mixed meal (batch portion + direct consumable) on valid input", async () => {
      const created = {
        id: 1,
        eatenAt: "2026-08-19T18:00:00Z",
        lines: [
          { lineType: "batch_portion", batchId: 1, portions: 1 },
          { lineType: "direct_consumable", ingredientId: 2, quantity: 1, unit: "each" },
        ],
        totalNutrition: { caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0, sodiumMg: 0 },
      };
      serviceMocks.createMeal.mockResolvedValue(created);

      const result = await logMeal({
        eatenAt: "2026-08-19T18:00:00Z",
        lines: [
          { lineType: "batch_portion", batchId: 1, portions: 1 },
          { lineType: "direct_consumable", ingredientId: 2, quantity: 1, unit: "each" },
        ],
      });

      expect(result).toEqual({ ok: true, data: created });
    });
  });
});
