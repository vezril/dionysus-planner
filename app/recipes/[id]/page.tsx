import { notFound } from "next/navigation";
import { getRecipeDetail } from "@/data/recipes";
import { formatNutritionForDisplay } from "@/domain/nutrition";
import type { NutritionTotals } from "@/domain/nutrition";

/**
 * Recipe detail with computed nutrition (docs/stories/S-403-recipe-detail-
 * nutrition.md, architecture.md §6 Flow B). RSC — one query
 * (`recipeRepo.getWithLinesAndIngredients` via `data/recipes#
 * getRecipeDetail`) folded straight into `domain/nutrition
 * .computeRecipeNutrition`, computed fresh on every request (no
 * caching/invalidation step, ADR-011 — hence `force-dynamic` below).
 *
 * A bad/missing id renders the app's `not-found.tsx` boundary
 * (architecture.md §6), mirroring `/app/ingredients/[id]/edit/page.tsx`.
 */
export const dynamic = "force-dynamic";

const NUTRIENT_ROWS: Array<{
  key: keyof NutritionTotals;
  testid: string;
  label: string;
  kind: "kcal" | "g" | "mg";
}> = [
  { key: "calories", testid: "calories", label: "Calories", kind: "kcal" },
  { key: "protein", testid: "protein", label: "Protein", kind: "g" },
  { key: "carbs", testid: "carbs", label: "Carbs", kind: "g" },
  { key: "fat", testid: "fat", label: "Fat", kind: "g" },
  { key: "fiber", testid: "fiber", label: "Fiber", kind: "g" },
  { key: "sugar", testid: "sugar", label: "Sugar", kind: "g" },
  { key: "sodiumMg", testid: "sodium", label: "Sodium", kind: "mg" },
];

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipeId = Number(id);

  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    notFound();
  }

  const detail = await getRecipeDetail(recipeId);
  if (!detail) {
    notFound();
  }

  const { recipe, lines, nutrition } = detail;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{recipe.name}</h1>
      <p data-testid="recipe-servings" className="text-sm text-muted-foreground">
        Servings: {recipe.servings}
      </p>
      <p data-testid="recipe-instructions" className="whitespace-pre-wrap text-sm">
        {recipe.instructions}
      </p>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Ingredients</h2>
        <ul className="flex flex-col divide-y divide-border">
          {lines.map((line) => {
            const isUnresolved = nutrition.unresolvedLineIds.includes(line.id);
            return (
              <li
                key={line.id}
                data-testid="recipe-line"
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"
              >
                <span className="font-medium text-foreground">{line.ingredient.name}</span>
                <span data-testid="recipe-line-quantity" className="text-sm text-muted-foreground">
                  {line.displayQuantity} {line.displayUnit}
                </span>
                {isUnresolved ? (
                  <span data-testid="recipe-line-unresolved" className="text-sm text-destructive">
                    Unresolved — cannot compare units
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div data-testid="nutrition-totals" className="flex flex-col gap-1">
          <h2 className="text-lg font-medium">Totals</h2>
          {NUTRIENT_ROWS.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{row.label}</span>
              <span data-testid={`nutrition-total-${row.testid}`}>
                {formatNutritionForDisplay(nutrition.totals[row.key].value, row.kind)}
              </span>
            </div>
          ))}
        </div>

        <div data-testid="nutrition-per-serving" className="flex flex-col gap-1">
          <h2 className="text-lg font-medium">Per serving</h2>
          {NUTRIENT_ROWS.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{row.label}</span>
              <span data-testid={`nutrition-per-serving-${row.testid}`}>
                {formatNutritionForDisplay(nutrition.perServing[row.key].value, row.kind)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
