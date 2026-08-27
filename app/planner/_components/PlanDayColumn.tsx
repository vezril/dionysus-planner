"use client";

/** openspec: weekly-planner — one day's planned entries + remove.
 * openspec: planner-consume — Eat/Drink logs the entry on ITS OWN day;
 * consumed entries show a badge and lose both buttons. */
import Link from "next/link";
import { useState, useTransition } from "react";
import { consumePlanEntry, removePlanEntry } from "@/app/actions/planner-actions";
import type { PlanEntryRow } from "@/data/planner";
import { fitStatus, percentOfTarget } from "@/domain/nutritionTargets";
import { Button } from "@/components/ui/button";

function consumeVerb(entry: PlanEntryRow): { action: string; done: string } {
  return entry.kind === "eat_pantry" && entry.ingredientCategory === "DRINK"
    ? { action: "Drink", done: "drunk" }
    : { action: "Eat", done: "eaten" };
}

export function PlanDayColumn({
  date,
  label,
  isToday,
  isSelected,
  onSelect,
  entries,
  calorieTargetKcal,
}: {
  date: string;
  label: string;
  isToday: boolean;
  isSelected: boolean;
  onSelect: () => void;
  entries: PlanEntryRow[];
  calorieTargetKcal: number;
}) {
  const [pending, startTransition] = useTransition();
  const [errorByEntry, setErrorByEntry] = useState<Record<number, string>>({});
  // openspec: nutrition-intake — the day's share of the calorie budget.
  const dayKcal = entries.reduce((total, entry) => total + (entry.caloriesKcal ?? 0), 0);
  const dayStatus = fitStatus(dayKcal, calorieTargetKcal, "cap");
  const dayTone =
    dayStatus === "over" ? "text-destructive" : dayStatus === "near" ? "text-status-near" : "text-status-cookable";

  return (
    <div
      data-testid="plan-day"
      data-date={date}
      data-selected={isSelected || undefined}
      className={`flex cursor-pointer flex-col gap-2 rounded-md border p-3 transition-colors ${
        isSelected ? "border-primary bg-primary/10" : isToday ? "border-primary/60" : "border-border hover:border-primary/40"
      }`}
      onClick={onSelect}
      role="button"
      aria-pressed={isSelected}
      aria-label={`Select ${label} ${date}`}
    >
      <div className="flex items-baseline justify-between">
        <span className={`text-sm font-semibold ${isToday || isSelected ? "text-primary" : ""}`}>{label}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{date.slice(5)}</span>
      </div>
      {dayKcal > 0 ? (
        <span data-testid="plan-day-kcal" className={`font-mono text-xs tabular-nums ${dayTone}`}>
          {dayKcal} kcal · {percentOfTarget(dayKcal, calorieTargetKcal)}% of day
        </span>
      ) : null}
      {entries.length === 0 ? (
        <span className="text-xs text-muted-foreground">—</span>
      ) : (
        // Inner links/buttons shouldn't retarget the day selection.
        <ul className="flex flex-col gap-2" onClick={(event) => event.stopPropagation()}>
          {entries.map((entry) => {
            const verb = consumeVerb(entry);
            const consumed = entry.consumedAt !== null;
            const consumable = (entry.kind === "eat_batch" || entry.kind === "eat_pantry") && !consumed;
            return (
              <li key={entry.id} data-testid="plan-entry" className="flex flex-col gap-1 rounded-sm border border-border/60 p-2">
                {entry.kind === "eat_item" ? (
                  <span className="text-sm font-medium">
                    {entry.batchLabel}{" "}
                    <span data-testid="plan-entry-eaten" className="text-xs font-normal text-status-cookable">
                      (eaten)
                    </span>
                  </span>
                ) : entry.kind === "eat_pantry" ? (
                  /* openspec: plan-pantry-backdate — planned, not yet eaten. */
                  <Link href="/pantry" className="text-sm font-medium hover:text-primary hover:underline">
                    {entry.batchLabel}{" "}
                    {consumed ? (
                      <span data-testid="plan-entry-consumed" className="text-xs font-normal text-status-cookable">
                        ({verb.done})
                      </span>
                    ) : (
                      <span data-testid="plan-entry-pantry" className="text-xs font-normal text-primary">
                        (from pantry)
                      </span>
                    )}
                  </Link>
                ) : entry.kind === "eat_batch" ? (
                  <Link href="/meal-log/batches" className="text-sm font-medium hover:text-primary hover:underline">
                    {entry.batchLabel}{" "}
                    {consumed ? (
                      <span data-testid="plan-entry-consumed" className="text-xs font-normal text-status-cookable">
                        ({verb.done})
                      </span>
                    ) : (
                      <span data-testid="plan-entry-batch" className="text-xs font-normal text-status-cookable">
                        (batch)
                      </span>
                    )}
                  </Link>
                ) : (
                  <Link href={`/recipes/${entry.recipeId}`} className="text-sm font-medium hover:text-primary hover:underline">
                    {entry.recipeName}
                  </Link>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {entry.kind === "eat_item" ? "logged" : `${entry.portions} portions`}
                    {entry.caloriesKcal !== null ? (
                      <span data-testid="plan-entry-calories"> · {entry.caloriesKcal} kcal</span>
                    ) : null}
                  </span>
                  {consumed ? null : (
                    <span className="flex items-center gap-1">
                      {consumable ? (
                        <Button
                          type="button"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          data-testid="plan-entry-consume"
                          disabled={pending}
                          aria-label={`${verb.action} ${entry.batchLabel ?? entry.recipeName}`}
                          onClick={() =>
                            startTransition(async () => {
                              const result = await consumePlanEntry(entry.id);
                              setErrorByEntry((previous) => ({
                                ...previous,
                                [entry.id]: result.ok ? "" : result.error.message,
                              }));
                            })
                          }
                        >
                          {verb.action}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        disabled={pending}
                        aria-label={`Remove ${entry.recipeName ?? entry.batchLabel}`}
                        onClick={() => startTransition(async () => void (await removePlanEntry(entry.id)))}
                      >
                        ✕
                      </Button>
                    </span>
                  )}
                </div>
                {errorByEntry[entry.id] ? (
                  <p data-testid="plan-entry-consume-error" className="text-xs text-destructive">
                    {errorByEntry[entry.id]}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
