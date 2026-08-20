import Link from "next/link";
import { resolveDionysusTimezone, todayIsoDateIn } from "@/app/lib/dionysusTimezone";
import { resolveDefaultThreshold } from "@/app/lib/threshold";
import { getPlannerWeek } from "@/data/planner";
import { shiftWeek, weekStartOf } from "@/domain/planner";
import { AddPlanEntryForm } from "./_components/AddPlanEntryForm";
import { PlanDayColumn } from "./_components/PlanDayColumn";
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

      <AddPlanEntryForm dates={week.dates} dayLabels={DAY_LABELS} recipeOptions={week.recipeOptions} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {week.dates.map((date, index) => (
          <PlanDayColumn
            key={date}
            date={date}
            label={DAY_LABELS[index]}
            isToday={date === today}
            entries={week.entriesByDate[date] ?? []}
          />
        ))}
      </div>

      <ShoppingListPanel list={week.shoppingList} />

      <SuggestionList suggestions={week.suggestions} />
    </div>
  );
}
