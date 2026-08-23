import { describe, expect, it } from "vitest";
import {
  dailyCaloriesSeries,
  enumerateDates,
  monthlyAlcoholSeries,
  monthlyCaloriesSeries,
  percentDelta,
  periodStats,
  weeklyAlcoholSeries,
  type DayLike,
} from "@/domain/dashboardStats";

/** openspec: dashboard-analytics — pure aggregation math. */
function day(date: string, kcal: number, extras: Partial<DayLike["totalNutrition"]> & { meals?: number; alcoholG?: number } = {}): DayLike {
  return {
    date,
    mealCount: extras.meals ?? 1,
    totalNutrition: {
      caloriesKcal: kcal,
      proteinG: extras.proteinG ?? 0,
      carbsG: extras.carbsG ?? 0,
      fatG: extras.fatG ?? 0,
      micronutrients: extras.alcoholG !== undefined ? { alcoholG: extras.alcoholG } : {},
    },
  };
}

describe("dashboardStats", () => {
  it("enumerates inclusive date ranges across month ends", () => {
    expect(enumerateDates("2026-08-30", "2026-09-02")).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
    ]);
  });

  it("daily calories zero-fill unlogged days", () => {
    const series = dailyCaloriesSeries([day("2026-08-02", 500)], "2026-08-01", "2026-08-03");
    expect(series.map((point) => point.value)).toEqual([0, 500, 0]);
    expect(series[1].label).toBe("02");
  });

  it("monthly calories fill all 12 months", () => {
    const series = monthlyCaloriesSeries([day("2026-03-10", 700), day("2026-03-11", 300)], "2026");
    expect(series).toHaveLength(12);
    expect(series[2]).toMatchObject({ key: "2026-03", value: 1000 });
    expect(series[11].value).toBe(0);
  });

  it("weekly alcohol buckets by Monday and converts grams to CRDM units", () => {
    // 2026-08-05 is a Wednesday (week of 08-03); 13.415 g ≈ 1 unit.
    const series = weeklyAlcoholSeries([day("2026-08-05", 0, { alcoholG: 13.415 })], "2026-08-01", "2026-08-14");
    const week = series.find((point) => point.key === "2026-08-03")!;
    expect(week.value).toBeCloseTo(1, 1);
    expect(series.every((point) => point.key === week.key || point.value === 0)).toBe(true);
  });

  it("monthly alcohol converts per month", () => {
    const series = monthlyAlcoholSeries([day("2026-05-01", 0, { alcoholG: 26.83 })], "2026");
    expect(series[4].value).toBeCloseTo(2, 1);
  });

  it("stats average over LOGGED days only and normalize alcohol weekly", () => {
    const stats = periodStats([
      day("2026-08-01", 2000, { proteinG: 50, meals: 3, alcoholG: 13.415 }),
      day("2026-08-02", 1000, { proteinG: 100, meals: 1, alcoholG: 0 }),
    ])!;
    expect(stats.loggedDays).toBe(2);
    expect(stats.avgCaloriesKcal).toBe(1500);
    expect(stats.avgProteinG).toBe(75);
    expect(stats.avgMeals).toBe(2);
    // 1 unit over 2 logged days → 3.5 units/week.
    expect(stats.alcoholUnitsPerWeek).toBeCloseTo(3.5, 1);
    expect(periodStats([])).toBeNull();
  });

  it("percent deltas handle missing and zero baselines", () => {
    expect(percentDelta(150, 100)).toBe(50);
    expect(percentDelta(50, 100)).toBe(-50);
    expect(percentDelta(100, 0)).toBeNull();
    expect(percentDelta(100, undefined)).toBeNull();
  });
});
