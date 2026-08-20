"use client";

/** openspec: nutrition-targets-guide — the adjustable targets form. */
import { useState, useTransition } from "react";
import { updateNutritionTargets } from "@/app/actions/nutrition-target-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MICRONUTRIENTS } from "@/domain/micronutrients";
import { TARGET_DEFS, type ResolvedTargets } from "@/domain/nutritionTargets";

export function TargetsEditor({ targets }: { targets: ResolvedTargets }) {
  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(TARGET_DEFS.map((def) => [def.key, String(targets.values[def.key])])),
    ...Object.fromEntries(
      Object.entries(targets.micro).map(([key, value]) => [`micro:${key}`, String(value)]),
    ),
  }));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const setField = (key: string, raw: string) => setValues((current) => ({ ...current, [key]: raw }));

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Your targets</h2>
      <p className="text-sm text-muted-foreground">
        Seeded from Health Canada DRIs and CCSA guidance — tune them to your body, activity, and goals.
        Caps are budgets to stay under; goals are floors to meet.
      </p>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {TARGET_DEFS.map((def) => (
          <div key={def.key} className="flex flex-col gap-1">
            <label htmlFor={`target-${def.key}`} className="text-sm font-medium">
              {def.label}{" "}
              <span className="font-normal text-muted-foreground">
                ({def.unit}, {def.kind})
              </span>
            </label>
            <Input
              id={`target-${def.key}`}
              type="number"
              step="any"
              value={values[def.key] ?? ""}
              onChange={(event) => setField(def.key, event.target.value)}
            />
          </div>
        ))}
      </div>

      <h3 className="text-base font-medium">Micronutrient goals (per day)</h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {Object.entries(MICRONUTRIENTS).map(([key, def]) => (
          <div key={key} className="flex flex-col gap-1">
            <label htmlFor={`target-micro-${key}`} className="text-xs font-medium">
              {def.label} <span className="font-normal text-muted-foreground">({def.unit})</span>
            </label>
            <Input
              id={`target-micro-${key}`}
              type="number"
              step="any"
              value={values[`micro:${key}`] ?? ""}
              onChange={(event) => setField(`micro:${key}`, event.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          data-testid="targets-save"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setMessage(null);
              const entries = Object.entries(values)
                .filter(([, raw]) => raw !== "" && Number(raw) > 0)
                .map(([key, raw]) => ({ key, value: Number(raw) }));
              const result = await updateNutritionTargets(entries);
              setMessage(result.ok ? "Saved." : result.error.message);
            })
          }
        >
          {pending ? "Saving…" : "Save targets"}
        </Button>
        {message ? (
          <span data-testid="targets-message" className="text-sm text-muted-foreground">
            {message}
          </span>
        ) : null}
      </div>
    </section>
  );
}
