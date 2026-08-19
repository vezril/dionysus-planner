import Link from "next/link";
import { resolveDionysusServiceUrl } from "@/app/lib/dionysusServiceConfig";
import { formatInstantIn, resolveDionysusTimezone, todayIsoDateIn } from "@/app/lib/dionysusTimezone";
import { getDayLog } from "@/services/dionysusService";

/**
 * openspec: meal-log-integration — the Meal Log day view. Reads exclusively
 * through dionysus-service's `GET /api/log/{date}` (design.md Decision 4:
 * force-dynamic, no caching — day totals and meal lists are live values).
 *
 * "Today" and displayed times follow `DIONYSUS_TZ` (app/lib/
 * dionysusTimezone.ts) — the server container runs in UTC, and a naive
 * UTC "today" made the day flip at 8pm in Montreal.
 */
export const dynamic = "force-dynamic";

/** True only for a real calendar date (regex alone admits 2026-02-31). */
function isValidIsoDate(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const parsed = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw;
}

/** Pure calendar-date arithmetic on YYYY-MM-DD strings (timezone-free). */
function shiftDate(date: string, deltaDays: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

const NUTRIENT_LABELS: Array<{ key: "sodiumMg" | "caloriesKcal" | "proteinG" | "carbsG" | "fatG"; label: string; unit: string }> = [
  { key: "sodiumMg", label: "Sodium", unit: "mg" },
  { key: "caloriesKcal", label: "Calories", unit: "kcal" },
  { key: "proteinG", label: "Protein", unit: "g" },
  { key: "carbsG", label: "Carbs", unit: "g" },
  { key: "fatG", label: "Fat", unit: "g" },
];

export default async function MealLogPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const timeZone = resolveDionysusTimezone();
  const date = params.date && isValidIsoDate(params.date) ? params.date : todayIsoDateIn(timeZone);

  const baseUrl = resolveDionysusServiceUrl();
  const dayLog = await getDayLog(baseUrl, date);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Meal Log</h1>
        <div className="flex gap-4 text-sm">
          <Link href="/meal-log/log" className="font-medium text-primary hover:underline">
            Log a meal
          </Link>
          <Link href="/meal-log/ingredients" className="font-medium text-primary hover:underline">
            Ingredients
          </Link>
          <Link href="/meal-log/recipes" className="font-medium text-primary hover:underline">
            Recipes
          </Link>
          <Link href="/meal-log/batches" className="font-medium text-primary hover:underline">
            Batches
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href={`/meal-log?date=${shiftDate(date, -1)}`}
          className="text-sm font-medium text-primary hover:underline"
          data-testid="meal-log-prev-day"
        >
          ← Previous day
        </Link>
        <form action="/meal-log" method="get" className="flex items-center gap-2">
          <input
            type="date"
            name="date"
            defaultValue={date}
            aria-label="Date"
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
          <button type="submit" className="text-sm font-medium text-primary hover:underline">
            Go
          </button>
        </form>
        <Link
          href={`/meal-log?date=${shiftDate(date, 1)}`}
          className="text-sm font-medium text-primary hover:underline"
          data-testid="meal-log-next-day"
        >
          Next day →
        </Link>
      </div>

      <div data-testid="day-log-totals" className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-md border border-border p-4 sm:grid-cols-5">
        {NUTRIENT_LABELS.map(({ key, label, unit }) => (
          <div key={key} className="flex flex-col">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span data-testid={`day-log-total-${key}`} className="text-lg font-semibold">
              {dayLog.totalNutrition[key]}
              <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>
            </span>
          </div>
        ))}
      </div>

      {dayLog.meals.length === 0 ? (
        <p data-testid="day-log-no-meals" className="text-sm text-muted-foreground">
          No meals logged for {date}.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border" data-testid="day-log-meals">
          {dayLog.meals.map((meal) => (
            <li key={meal.id} data-testid="day-log-meal-row" className="flex items-center justify-between gap-4 py-3">
              <span className="text-sm">{formatInstantIn(meal.eatenAt, timeZone)}</span>
              <span className="text-sm text-muted-foreground">{meal.nutrition.sodiumMg}mg sodium</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
