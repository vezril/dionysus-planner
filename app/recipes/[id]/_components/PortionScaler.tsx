"use client";

/**
 * openspec: qol-nav-scale-delete — the portion slider + everything it
 * rescales (ingredient lines, nutrition totals). Client Component because
 * the factor is interactive; all data arrives serialized from the RSC —
 * no fetches, nothing persisted (design D2). At the default factor the
 * rendering (values AND testids) is identical to the pre-slider page, so
 * existing pins hold. Per-serving is factor-independent and stays in the
 * RSC. The selected portion count is exposed on
 * `data-testid="portion-scaler"`'s `data-portions` attribute — the seam
 * cook-recipe-into-meals will lift.
 */
import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { formatNutritionForDisplay } from "@/domain/nutrition";
import { scaleDisplayQuantity, scaleNutrientValue } from "@/domain/portionScaling";

export interface ScalerLine {
  id: number;
  name: string;
  displayQuantity: number;
  displayUnit: string;
  unresolved: boolean;
}

export interface ScalerNutrientRow {
  key: string;
  testid: string;
  label: string;
  kind: "kcal" | "g" | "mg";
  totalValue: number | null;
  /** Factor-independent by definition — rendered verbatim. */
  perServingValue: number | null;
}

export function PortionScaler({
  servings,
  lines,
  totalRows,
}: {
  servings: number;
  lines: ScalerLine[];
  totalRows: ScalerNutrientRow[];
}) {
  const [portions, setPortions] = useState(servings);
  const factor = portions / servings;

  return (
    <div data-testid="portion-scaler" data-portions={portions} className="flex flex-col gap-6">
      <div data-testid="portion-slider" className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted-foreground">
          Portions: <span data-testid="portion-count" className="text-foreground">{portions}</span>
          {portions !== servings ? (
            <span className="ml-2 text-xs">(recipe makes {servings})</span>
          ) : null}
        </span>
        <Slider
          aria-label="Portions"
          value={[portions]}
          min={1}
          max={servings * 4}
          step={1}
          onValueChange={(values: number[]) => setPortions(values[0])}
        />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Ingredients</h2>
        <ul className="flex flex-col divide-y divide-border">
          {lines.map((line) => (
            <li
              key={line.id}
              data-testid="recipe-line"
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"
            >
              <span className="font-medium text-foreground">{line.name}</span>
              <span data-testid="recipe-line-quantity" className="font-mono text-sm tabular-nums text-muted-foreground">
                {scaleDisplayQuantity(line.displayQuantity, factor)} {line.displayUnit}
              </span>
              {line.unresolved ? (
                <span data-testid="recipe-line-unresolved" className="text-sm text-destructive">
                  Unresolved — cannot compare units
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div data-testid="nutrition-totals" className="flex flex-col gap-1">
          <h2 className="text-lg font-medium">Totals</h2>
          {totalRows.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{row.label}</span>
              <span data-testid={`nutrition-total-${row.testid}`} className="font-mono tabular-nums">
                {formatNutritionForDisplay(scaleNutrientValue(row.totalValue, factor), row.kind)}
              </span>
            </div>
          ))}
        </div>

        <div data-testid="nutrition-per-serving" className="flex flex-col gap-1">
          <h2 className="text-lg font-medium">Per serving</h2>
          {totalRows.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{row.label}</span>
              <span data-testid={`nutrition-per-serving-${row.testid}`} className="font-mono tabular-nums">
                {formatNutritionForDisplay(row.perServingValue, row.kind)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
