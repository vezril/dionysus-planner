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
  entries,
}: {
  date: string;
  label: string;
  isToday: boolean;
  entries: PlanEntryRow[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div
      data-testid="plan-day"
      data-date={date}
      className={`flex flex-col gap-2 rounded-md border p-3 ${isToday ? "border-primary/60" : "border-border"}`}
    >
      <div className="flex items-baseline justify-between">
        <span className={`text-sm font-semibold ${isToday ? "text-primary" : ""}`}>{label}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{date.slice(5)}</span>
      </div>
      {entries.length === 0 ? (
        <span className="text-xs text-muted-foreground">—</span>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li key={entry.id} data-testid="plan-entry" className="flex flex-col gap-1 rounded-sm border border-border/60 p-2">
              {entry.kind === "eat_batch" ? (
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
                <span className="text-xs text-muted-foreground">{entry.portions} portions</span>
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
