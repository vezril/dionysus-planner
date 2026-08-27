"use client";

/**
 * openspec: nutrition-intake — live per-serving nutrition while BUILDING
 * a recipe, each nutrient chip'd with its share of the daily target.
 * Debounced; an unparseable mid-typing body simply renders nothing.
 */
import { useEffect, useState } from "react";
import { previewRecipeNutrition } from "@/app/actions/recipe-actions";
import { formatNutritionForDisplay, type NutritionTotals } from "@/domain/nutrition";
import { percentOfTarget } from "@/domain/nutritionTargets";

const PREVIEW_ROWS: Array<{
  key: keyof NutritionTotals;
  label: string;
  kind: "kcal" | "g" | "mg";
  targetKey: string | null;
}> = [
  { key: "calories", label: "Calories", kind: "kcal", targetKey: "caloriesKcal" },
  { key: "protein", label: "Protein", kind: "g", targetKey: "proteinG" },
  { key: "carbs", label: "Carbs", kind: "g", targetKey: "carbsG" },
  { key: "fat", label: "Fat", kind: "g", targetKey: "fatG" },
  { key: "fiber", label: "Fiber", kind: "g", targetKey: "fiberG" },
  { key: "sugar", label: "Sugar", kind: "g", targetKey: "sugarG" },
  { key: "sodiumMg", label: "Sodium", kind: "mg", targetKey: "sodiumMg" },
];

export function NutritionPreview({ body, servings }: { body: string; servings: string }) {
  const [preview, setPreview] = useState<{ perServing: NutritionTotals; targets: Record<string, number> } | null>(
    null,
  );

  useEffect(() => {
    const servingsNumber = Number(servings);
    if (body.trim() === "" || !Number.isFinite(servingsNumber) || servingsNumber <= 0) {
      setPreview(null);
      return;
    }
    const handle = setTimeout(async () => {
      const result = await previewRecipeNutrition({ body, servings: servingsNumber });
      setPreview(result.ok ? result.data : null);
    }, 500);
    return () => clearTimeout(handle);
  }, [body, servings]);

  if (!preview) return null;

  return (
    <div
      data-testid="recipe-nutrition-preview"
      className="flex max-w-2xl flex-wrap gap-x-5 gap-y-1 rounded-md border border-border bg-card px-3 py-2"
    >
      <span className="w-full text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Per serving · share of daily intake
      </span>
      {PREVIEW_ROWS.map((row) => {
        const total = preview.perServing[row.key];
        if (total.value === null) {
          return (
            <span key={row.key} className="text-sm text-muted-foreground">
              {row.label} —
            </span>
          );
        }
        const target = row.targetKey !== null ? preview.targets[row.targetKey] : undefined;
        return (
          <span key={row.key} className="text-sm">
            <span className="text-muted-foreground">{row.label}</span>{" "}
            {formatNutritionForDisplay(total.value, row.kind)}
            {target !== undefined && target > 0 ? (
              <span data-testid={`preview-percent-${row.key}`} className="ml-1 text-xs text-primary">
                {percentOfTarget(total.value, target)}%
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
