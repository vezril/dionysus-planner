"use client";

/** openspec: weekly-planner — one day's planned entries + remove. */
import Link from "next/link";
import { useTransition } from "react";
import { removePlanEntry } from "@/app/actions/planner-actions";
import type { PlanEntryRow } from "@/data/planner";
import { Button } from "@/components/ui/button";

export function PlanDayColumn({
  date,
  label,
  isToday,
  isSelected,
  onSelect,
  entries,
}: {
  date: string;
  label: string;
  isToday: boolean;
  isSelected: boolean;
  onSelect: () => void;
  entries: PlanEntryRow[];
}) {
  const [pending, startTransition] = useTransition();

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
      {entries.length === 0 ? (
        <span className="text-xs text-muted-foreground">—</span>
      ) : (
        // Inner links/buttons shouldn't retarget the day selection.
        <ul className="flex flex-col gap-2" onClick={(event) => event.stopPropagation()}>
          {entries.map((entry) => (
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
                  <span data-testid="plan-entry-pantry" className="text-xs font-normal text-primary">
                    (from pantry)
                  </span>
                </Link>
              ) : entry.kind === "eat_batch" ? (
                <Link href="/meal-log/batches" className="text-sm font-medium hover:text-primary hover:underline">
                  {entry.batchLabel}{" "}
                  <span data-testid="plan-entry-batch" className="text-xs font-normal text-status-cookable">
                    (batch)
                  </span>
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
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
