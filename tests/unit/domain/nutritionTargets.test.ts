import { describe, expect, it } from "vitest";
import { fitStatus, percentOfTarget, resolveTargets, TARGET_DEFS } from "@/domain/nutritionTargets";

/** openspec: nutrition-targets-guide — defaults, overrides, judgments. */
describe("resolveTargets", () => {
  it("defaults hold with no overrides; overrides win; unknown keys ignored", () => {
    const base = resolveTargets([]);
    expect(base.values.sodiumMg).toBe(2300);
    expect(base.values.alcoholUnitsWeek).toBe(2);
    expect(base.micro.vitaminD).toBe(15);

    const tuned = resolveTargets([
      { key: "sodiumMg", value: 1500 },
      { key: "micro:vitaminD", value: 25 },
      { key: "nonsense", value: 1 },
      { key: "micro:unobtainium", value: 1 },
    ]);
    expect(tuned.values.sodiumMg).toBe(1500);
    expect(tuned.micro.vitaminD).toBe(25);
    expect(tuned.values.caloriesKcal).toBe(2500);
  });

  it("every def has a positive default and a kind", () => {
    for (const def of TARGET_DEFS) {
      expect(def.defaultValue).toBeGreaterThan(0);
      expect(["goal", "cap"]).toContain(def.kind);
    }
  });
});

describe("fitStatus", () => {
  it("caps: ok / near / over at 90% and 100%", () => {
    expect(fitStatus(2000, 2300, "cap")).toBe("ok");
    expect(fitStatus(2200, 2300, "cap")).toBe("near");
    expect(fitStatus(2400, 2300, "cap")).toBe("over");
  });

  it("goals: met / partial / low at 100% and 60%", () => {
    expect(fitStatus(70, 65, "goal")).toBe("met");
    expect(fitStatus(45, 65, "goal")).toBe("partial");
    expect(fitStatus(20, 65, "goal")).toBe("low");
  });
});

describe("percentOfTarget", () => {
  it("rounds; zero target yields 0", () => {
    expect(percentOfTarget(1600, 2300)).toBe(70);
    expect(percentOfTarget(10, 0)).toBe(0);
  });
});
