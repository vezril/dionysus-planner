/**
 * Typed HTTP client for `dionysus-service` (openspec: meal-log-integration
 * design.md Decision 1). No database access, no `process.env` read — every
 * function takes `baseUrl` explicitly (resolved once by
 * `app/lib/dionysusServiceConfig.ts`) so this module is trivially testable
 * with a mocked `fetch`.
 *
 * Wire shapes mirror dionysus-service's JSON exactly (server/src/main/scala/
 * .../http/*.scala in the dionysus-service repo) — this file is the single
 * place that shape is allowed to leak into dionysus-planner.
 */

export interface NutritionJson {
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  sodiumMg: number;
  /** openspec: meal-micronutrients — always written by the service (may be {}). */
  micronutrients: Record<string, number>;
}

export interface IngredientJson {
  id: number | null;
  name: string;
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  sodiumMg: number;
  abvPercent: number | null;
  directlyLoggable: boolean;
  /** openspec: meal-micronutrients — optional on requests, echoed on responses. */
  micronutrients?: Record<string, number>;
}

export interface RecipeLineJson {
  ingredientId: number;
  quantity: number;
  unit: string;
}

export interface RecipeJson {
  id: number | null;
  name: string;
  servings: number;
  lines: RecipeLineJson[];
  perServingNutrition: NutritionJson;
}

export interface BatchJson {
  id: number | null;
  recipeId: number;
  cookedAt: string;
  servingsMade: number;
  remainingPortions: number;
}

export type MealLineJson =
  | { lineType: "batch_portion"; batchId: number; portions: number }
  | { lineType: "direct_consumable"; ingredientId: number; quantity: number; unit: string };

export interface MealJson {
  id: number | null;
  eatenAt: string;
  lines: MealLineJson[];
  totalNutrition: NutritionJson;
}

export interface DayLogJson {
  date: string;
  totalNutrition: NutritionJson;
  meals: Array<{ id: number | null; eatenAt: string; nutrition: NutritionJson }>;
}

/** Thrown on a network failure or a non-2xx response. `message` is the
 * service's own `ErrorResponse.error` text when the body parses as one. */
export class DionysusServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "DionysusServiceError";
  }
}

async function request<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (cause) {
    throw new DionysusServiceError(
      `Could not reach dionysus-service at ${baseUrl}: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `dionysus-service returned ${response.status} for ${path}`;
    throw new DionysusServiceError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function listIngredients(baseUrl: string): Promise<IngredientJson[]> {
  return request(baseUrl, "/api/ingredients");
}

export function createIngredient(
  baseUrl: string,
  body: Omit<IngredientJson, "id">,
): Promise<IngredientJson> {
  return request(baseUrl, "/api/ingredients", { method: "POST", body: JSON.stringify(body) });
}

/** openspec: pantry-quick-eat — flip mirrors to directly loggable. */
export function updateIngredient(
  baseUrl: string,
  id: number,
  body: Omit<IngredientJson, "id">,
): Promise<IngredientJson> {
  return request(baseUrl, `/api/ingredients/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

export function listRecipes(baseUrl: string): Promise<RecipeJson[]> {
  return request(baseUrl, "/api/recipes");
}

export function createRecipe(
  baseUrl: string,
  body: { name: string; servings: number; lines: RecipeLineJson[] },
): Promise<RecipeJson> {
  return request(baseUrl, "/api/recipes", { method: "POST", body: JSON.stringify(body) });
}

export function listBatches(baseUrl: string): Promise<BatchJson[]> {
  return request(baseUrl, "/api/batches");
}

export function createBatch(
  baseUrl: string,
  body: { recipeId: number; cookedAt: string; servingsMade: number },
): Promise<BatchJson> {
  return request(baseUrl, "/api/batches", { method: "POST", body: JSON.stringify(body) });
}

export function createMeal(
  baseUrl: string,
  body: { eatenAt: string; lines: MealLineJson[] },
): Promise<MealJson> {
  return request(baseUrl, "/api/meals", { method: "POST", body: JSON.stringify(body) });
}

/** `date` is `YYYY-MM-DD`. */
export interface RangeDayJson {
  date: string;
  totalNutrition: NutritionJson;
  mealCount: number;
}

export interface RangeLogJson {
  days: RangeDayJson[];
}

/** openspec: consumption-dashboard — per-day rollups for an inclusive
 * range in one call (service change log-range). */
export function getLogRange(baseUrl: string, from: string, to: string): Promise<RangeLogJson> {
  return request(baseUrl, `/api/log/range?from=${from}&to=${to}`);
}

export function getDayLog(baseUrl: string, date: string): Promise<DayLogJson> {
  return request(baseUrl, `/api/log/${date}`);
}
