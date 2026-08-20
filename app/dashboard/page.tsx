import Link from "next/link";
import { resolveDionysusServiceUrl } from "@/app/lib/dionysusServiceConfig";
import { resolveDionysusTimezone, todayIsoDateIn } from "@/app/lib/dionysusTimezone";
import { alcoholUnitsFromGrams } from "@/domain/abv";
import { periodRange, shiftAnchor, type Period } from "@/domain/periods";
import { getLogRange, type RangeDayJson } from "@/services/dionysusService";
import { getResolvedTargets } from "@/data/nutritionTargets";
import { fitStatus, type FitStatus, type TargetKind } from "@/domain/nutritionTargets";

/**
 * openspec: consumption-dashboard — day/week/month/year consumption from
 * the meal service's range endpoint. RSC, one range call per view,
 * force-dynamic; alcohol reported in CRDM units (mL ethanol ÷ 17).
 */
export const dynamic = "force-dynamic";

const PERIODS: Period[] = ["day", "week", "month", "year"];

function sum(days: RangeDayJson[], pick: (day: RangeDayJson) => number): number {
  return Math.round(days.reduce((total, day) => total + pick(day), 0) * 100) / 100;
}

function alcoholGramsOf(day: RangeDayJson): number {
  return day.totalNutrition.micronutrients?.alcoholG ?? 0;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; date?: string }>;
}) {
  const params = await searchParams;
  const timeZone = resolveDionysusTimezone();
  const today = todayIsoDateIn(timeZone);
  const period: Period = PERIODS.includes(params.period as Period) ? (params.period as Period) : "week";
  const anchor = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  const range = periodRange(period, anchor);

  const targets = await getResolvedTargets();
  let days: RangeDayJson[] = [];
  let serviceAvailable = true;
  try {
    const baseUrl = resolveDionysusServiceUrl();
    days = (await getLogRange(baseUrl, range.from, range.to)).days;
  } catch {
    serviceAvailable = false;
  }

  const totalAlcoholG = sum(days, alcoholGramsOf);
  // openspec: nutrition-targets-guide — day/week judge exactly (×1/×7);
  // longer periods judge the per-logged-day average. Alcohol judges the
  // weekly cap (exact on week, per-week average beyond).
  const loggedDays = Math.max(1, days.length);
  const judge = (
    total: number,
    targetKey: string,
    kind: TargetKind,
  ): FitStatus | null => {
    if (days.length === 0) return null;
    const daily = targets.values[targetKey];
    if (period === "day") return fitStatus(total, daily, kind);
    if (period === "week") return fitStatus(total, daily * 7, kind);
    return fitStatus(total / loggedDays, daily, kind);
  };
  const alcoholUnits = alcoholUnitsFromGrams(totalAlcoholG);
  const alcoholStatus: FitStatus | null =
    days.length === 0
      ? null
      : period === "day"
        ? null // a daily judgment against a weekly cap would mislead
        : period === "week"
          ? fitStatus(alcoholUnits, targets.values.alcoholUnitsWeek, "cap")
          : fitStatus(alcoholUnits / Math.max(1, loggedDays / 7), targets.values.alcoholUnitsWeek, "cap");

  const totals = [
    { label: "Calories", value: `${sum(days, (day) => day.totalNutrition.caloriesKcal)} kcal`, testid: "calories", status: judge(sum(days, (day) => day.totalNutrition.caloriesKcal), "caloriesKcal", "cap") },
    { label: "Protein", value: `${sum(days, (day) => day.totalNutrition.proteinG)} g`, testid: "protein", status: judge(sum(days, (day) => day.totalNutrition.proteinG), "proteinG", "goal") },
    { label: "Carbs", value: `${sum(days, (day) => day.totalNutrition.carbsG)} g`, testid: "carbs", status: judge(sum(days, (day) => day.totalNutrition.carbsG), "carbsG", "cap") },
    { label: "Fat", value: `${sum(days, (day) => day.totalNutrition.fatG)} g`, testid: "fat", status: judge(sum(days, (day) => day.totalNutrition.fatG), "fatG", "cap") },
    { label: "Sodium", value: `${sum(days, (day) => day.totalNutrition.sodiumMg)} mg`, testid: "sodium", status: judge(sum(days, (day) => day.totalNutrition.sodiumMg), "sodiumMg", "cap") },
    { label: "Meals", value: `${days.reduce((total, day) => total + day.mealCount, 0)}`, testid: "meals", status: null },
    { label: "Alcohol", value: `${alcoholUnits} units`, testid: "alcohol-units", status: alcoholStatus },
  ];

  // Breakdown: per day for day/week/month; per month for year.
  const breakdown =
    period === "year"
      ? [...days.reduce((byMonth, day) => {
          const month = day.date.slice(0, 7);
          const row = byMonth.get(month) ?? { label: month, kcal: 0, meals: 0, alcoholG: 0 };
          row.kcal += day.totalNutrition.caloriesKcal;
          row.meals += day.mealCount;
          row.alcoholG += alcoholGramsOf(day);
          byMonth.set(month, row);
          return byMonth;
        }, new Map<string, { label: string; kcal: number; meals: number; alcoholG: number }>()).values()]
      : days.map((day) => ({
          label: day.date,
          kcal: day.totalNutrition.caloriesKcal,
          meals: day.mealCount,
          alcoholG: alcoholGramsOf(day),
        }));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex gap-2">
          {PERIODS.map((candidate) => (
            <Link
              key={candidate}
              href={`/dashboard?period=${candidate}&date=${anchor}`}
              data-testid={`dashboard-period-${candidate}`}
              aria-current={candidate === period ? "page" : undefined}
              className={`rounded-md border px-3 py-1 text-sm font-medium capitalize ${
                candidate === period ? "border-primary text-primary" : "border-border text-foreground hover:border-primary/40"
              }`}
            >
              {candidate}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <Link
          href={`/dashboard?period=${period}&date=${shiftAnchor(period, anchor, -1)}`}
          data-testid="dashboard-prev"
          className="font-medium text-primary hover:underline"
        >
          ← Previous {period}
        </Link>
        <span data-testid="dashboard-range" className="font-mono tabular-nums text-muted-foreground">
          {range.label}
        </span>
        <Link
          href={`/dashboard?period=${period}&date=${shiftAnchor(period, anchor, 1)}`}
          data-testid="dashboard-next"
          className="font-medium text-primary hover:underline"
        >
          Next {period} →
        </Link>
      </div>

      {!serviceAvailable ? (
        <p data-testid="dashboard-service-down" className="text-sm text-muted-foreground">
          Inventory service unreachable — no consumption data to show.
        </p>
      ) : (
        <>
          <div data-testid="dashboard-totals" className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-md border border-border p-4 sm:grid-cols-4">
            {totals.map((total) => (
              <div key={total.testid} className="flex flex-col">
                <span className="text-xs text-muted-foreground">{total.label}</span>
                <span data-testid={`dashboard-total-${total.testid}`} className="text-lg font-semibold">
                  {total.value}
                </span>
                {total.status !== null ? (
                  <span
                    data-testid={`dashboard-status-${total.testid}`}
                    className={`text-xs font-medium ${
                      total.status === "ok" || total.status === "met"
                        ? "text-status-cookable"
                        : total.status === "near" || total.status === "partial"
                          ? "text-status-near"
                          : total.status === "over"
                            ? "text-destructive"
                            : "text-muted-foreground"
                    }`}
                  >
                    {total.status}
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          {breakdown.length === 0 ? (
            <p data-testid="dashboard-empty" className="text-sm text-muted-foreground">
              Nothing consumed in this {period}.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 font-medium">{period === "year" ? "Month" : "Day"}</th>
                  <th className="py-1 text-right font-medium">Calories</th>
                  <th className="py-1 text-right font-medium">Meals</th>
                  <th className="py-1 text-right font-medium">Alcohol</th>
                </tr>
              </thead>
              <tbody data-testid="dashboard-breakdown">
                {breakdown.map((row) => (
                  <tr key={row.label} data-testid="dashboard-row" className="border-t border-border">
                    <td className="py-2 font-mono tabular-nums">{row.label}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{Math.round(row.kcal)} kcal</td>
                    <td className="py-2 text-right font-mono tabular-nums">{row.meals}</td>
                    <td className="py-2 text-right font-mono tabular-nums">
                      {alcoholUnitsFromGrams(row.alcoholG)} u
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
