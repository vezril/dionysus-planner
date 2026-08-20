import Link from "next/link";
import { resolveDionysusTimezone, todayIsoDateIn } from "@/app/lib/dionysusTimezone";
import { resolveDefaultThreshold } from "@/app/lib/threshold";
import { getPlannerWeek } from "@/data/planner";
import { getResolvedTargets } from "@/data/nutritionTargets";
import { fitStatus } from "@/domain/nutritionTargets";
import { shiftWeek, weekStartOf } from "@/domain/planner";
import { PlannerBoard } from "./_components/PlannerBoard";
import { ShoppingListPanel } from "./_components/ShoppingListPanel";
import { SuggestionList } from "./_components/SuggestionList";

/**
 * openspec: weekly-planner — the week grid + pantry-depletion-aware
 * suggestions. RSC, one facade call, force-dynamic (plans and pantry are
 * live values); the week defaults to today's Monday in DIONYSUS_TZ.
 */
export const dynamic = "force-dynamic";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const timeZone = resolveDionysusTimezone();
  const today = todayIsoDateIn(timeZone);
  const requested = params.week && /^\d{4}-\d{2}-\d{2}$/.test(params.week) ? params.week : today;
  const weekStart = weekStartOf(requested);

  const threshold = resolveDefaultThreshold();
  const week = await getPlannerWeek(weekStart, threshold);
  // openspec: nutrition-targets-guide — planned calories vs 7 daily budgets.
  const targets = await getResolvedTargets();
  const plannedKcal = Object.values(week.entriesByDate)
    .flat()
    .reduce((total, entry) => total + (entry.caloriesKcal ?? 0), 0);
  const weeklyKcalTarget = targets.values.caloriesKcal * 7;
  const plannedStatus = plannedKcal > 0 ? fitStatus(plannedKcal, weeklyKcalTarget, "cap") : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Planner</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={`/planner?week=${shiftWeek(weekStart, -1)}`}
            data-testid="planner-prev-week"
            className="font-medium text-primary hover:underline"
          >
            ← Previous week
          </Link>
          <span data-testid="planner-week-start" className="font-mono tabular-nums text-muted-foreground">
            week of {weekStart}
          </span>
          <Link
            href={`/planner?week=${shiftWeek(weekStart, 1)}`}
            data-testid="planner-next-week"
            className="font-medium text-primary hover:underline"
          >
            Next week →
          </Link>
        </div>
      </div>

      {plannedStatus !== null ? (
        <p data-testid="planner-week-fit" className="text-sm text-muted-foreground">
          Planned: <span className="font-mono tabular-nums">{Math.round(plannedKcal)} kcal</span> of{" "}
          <span className="font-mono tabular-nums">{Math.round(weeklyKcalTarget)} kcal</span> weekly budget{" "}
          <span
            className={`font-medium ${
              plannedStatus === "ok" ? "text-status-cookable" : plannedStatus === "near" ? "text-status-near" : "text-destructive"
            }`}
          >
            ({plannedStatus})
          </span>
        </p>
      ) : null}

      <PlannerBoard
        dates={week.dates}
        dayLabels={DAY_LABELS}
        today={today}
        entriesByDate={week.entriesByDate}
        recipeOptions={week.recipeOptions}
        batchOptions={week.readyToEat}
      />

      <ShoppingListPanel list={week.shoppingList} />

      <SuggestionList suggestions={week.suggestions} readyToEat={week.readyToEat} serviceAvailable={week.serviceAvailable} />
    </div>
  );
}
