/**
 * openspec: dashboard-analytics — pure aggregation for the month/year
 * dashboard views: zero-filled chart series, per-logged-day averages,
 * and deltas against the previous period. Framework-free.
 */
import { alcoholUnitsFromGrams } from "@/domain/abv";
import { weekStartOf } from "@/domain/planner";

export interface DayLike {
  date: string;
  mealCount: number;
  totalNutrition: {
    caloriesKcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    micronutrients?: Record<string, number>;
  };
}

export interface SeriesPoint {
  /** Axis key (ISO date, week start, or YYYY-MM). */
  key: string;
  /** Short axis label. */
  label: string;
  value: number;
}

const MS_PER_DAY = 86_400_000;

function alcoholGramsOf(day: DayLike): number {
  return day.totalNutrition.micronutrients?.alcoholG ?? 0;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  for (
    let t = new Date(`${from}T00:00:00Z`).getTime();
    t <= new Date(`${to}T00:00:00Z`).getTime();
    t += MS_PER_DAY
  ) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

/** Calories per calendar day, zero-filled across the whole range. */
export function dailyCaloriesSeries(days: DayLike[], from: string, to: string): SeriesPoint[] {
  const byDate = new Map(days.map((day) => [day.date, day]));
  return enumerateDates(from, to).map((date) => ({
    key: date,
    label: date.slice(8), // day of month
    value: Math.round(byDate.get(date)?.totalNutrition.caloriesKcal ?? 0),
  }));
}

/** Calories per month of the range's year, zero-filled to 12 entries. */
export function monthlyCaloriesSeries(days: DayLike[], year: string): SeriesPoint[] {
  const byMonth = new Map<string, number>();
  for (const day of days) {
    const month = day.date.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + day.totalNutrition.caloriesKcal);
  }
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    return { key: month, label: month.slice(5), value: Math.round(byMonth.get(month) ?? 0) };
  });
}

/** CRDM units per week (weeks keyed by their Monday), zero-filled. */
export function weeklyAlcoholSeries(days: DayLike[], from: string, to: string): SeriesPoint[] {
  const gramsByWeek = new Map<string, number>();
  for (const day of days) {
    const week = weekStartOf(day.date);
    gramsByWeek.set(week, (gramsByWeek.get(week) ?? 0) + alcoholGramsOf(day));
  }
  const weeks: string[] = [];
  for (const date of enumerateDates(from, to)) {
    const week = weekStartOf(date);
    if (weeks[weeks.length - 1] !== week) weeks.push(week);
  }
  return weeks.map((week) => ({
    key: week,
    label: week.slice(5),
    value: alcoholUnitsFromGrams(gramsByWeek.get(week) ?? 0),
  }));
}

/** CRDM units per month of the year, zero-filled to 12 entries. */
export function monthlyAlcoholSeries(days: DayLike[], year: string): SeriesPoint[] {
  const gramsByMonth = new Map<string, number>();
  for (const day of days) {
    const month = day.date.slice(0, 7);
    gramsByMonth.set(month, (gramsByMonth.get(month) ?? 0) + alcoholGramsOf(day));
  }
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    return { key: month, label: month.slice(5), value: alcoholUnitsFromGrams(gramsByMonth.get(month) ?? 0) };
  });
}

export interface PeriodStats {
  loggedDays: number;
  avgCaloriesKcal: number;
  avgProteinG: number;
  avgMeals: number;
  alcoholUnitsPerWeek: number;
}

/** Per-LOGGED-day averages (empty days don't drag averages to zero);
 * alcohol normalized to units per week over logged days. */
export function periodStats(days: DayLike[]): PeriodStats | null {
  if (days.length === 0) return null;
  const loggedDays = days.length;
  const total = (pick: (day: DayLike) => number) => days.reduce((sum, day) => sum + pick(day), 0);
  return {
    loggedDays,
    avgCaloriesKcal: Math.round(total((day) => day.totalNutrition.caloriesKcal) / loggedDays),
    avgProteinG: round1(total((day) => day.totalNutrition.proteinG) / loggedDays),
    avgMeals: round1(total((day) => day.mealCount) / loggedDays),
    alcoholUnitsPerWeek: round1((alcoholUnitsFromGrams(total(alcoholGramsOf)) / loggedDays) * 7),
  };
}

/** Signed % change vs the previous period; null when no baseline. */
export function percentDelta(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
