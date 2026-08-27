/**
 * Personal nutrition targets (openspec: nutrition-targets-guide). Pure,
 * framework-free. Defaults and semantics are documented in the
 * nutrition-reference skill (.claude/skills/nutrition-reference) —
 * Health Canada DRIs + CCSA 2023 alcohol guidance. These are adult
 * GENERIC seeds; the stored `nutrition_target` rows override them.
 */
import { MICRONUTRIENTS } from "@/domain/micronutrients";

export type TargetKind = "goal" | "cap";

export interface TargetDef {
  key: string;
  label: string;
  unit: string;
  kind: TargetKind;
  defaultValue: number;
  /** Scale to a day (most) or a week (alcohol). */
  per: "day" | "week";
}

export const TARGET_DEFS: TargetDef[] = [
  { key: "caloriesKcal", label: "Calories", unit: "kcal", kind: "cap", defaultValue: 2500, per: "day" },
  { key: "proteinG", label: "Protein", unit: "g", kind: "goal", defaultValue: 65, per: "day" },
  { key: "carbsG", label: "Carbs", unit: "g", kind: "cap", defaultValue: 300, per: "day" },
  { key: "fatG", label: "Fat", unit: "g", kind: "cap", defaultValue: 80, per: "day" },
  { key: "fiberG", label: "Fiber", unit: "g", kind: "goal", defaultValue: 38, per: "day" },
  { key: "sugarG", label: "Sugar", unit: "g", kind: "cap", defaultValue: 60, per: "day" },
  { key: "saturatedFatG", label: "Saturated fat", unit: "g", kind: "cap", defaultValue: 25, per: "day" },
  { key: "sodiumMg", label: "Sodium", unit: "mg", kind: "cap", defaultValue: 2300, per: "day" },
  { key: "cholesterolMg", label: "Cholesterol", unit: "mg", kind: "cap", defaultValue: 300, per: "day" },
  { key: "alcoholUnitsWeek", label: "Alcohol", unit: "units/week", kind: "cap", defaultValue: 2, per: "week" },
];

/** Adult-male DRI seeds per registry key — all goals (see the skill). */
export const MICRO_TARGET_DEFAULTS: Record<string, number> = {
  vitaminA: 900,
  vitaminC: 90,
  vitaminD: 15,
  vitaminE: 15,
  vitaminK: 120,
  vitaminB1: 1.2,
  vitaminB2: 1.3,
  vitaminB3: 16,
  vitaminB6: 1.3,
  vitaminB9: 400,
  vitaminB12: 2.4,
  calcium: 1000,
  iron: 8,
  magnesium: 420,
  potassium: 3400,
  zinc: 11,
  phosphorus: 700,
  // openspec: nutrition-intake — Health Canada DRI adult-male seeds.
  pantothenate: 5,
  biotin: 30,
  iodine: 150,
  selenium: 55,
  copper: 0.9,
  manganese: 2.3,
  chromium: 35,
  molybdenum: 45,
};

export interface ResolvedTargets {
  /** TARGET_DEFS keys → effective value. */
  values: Record<string, number>;
  /** micronutrient registry keys → effective daily goal. */
  micro: Record<string, number>;
}

/** Merges stored overrides ("micro:<key>" rows for micronutrients) over
 * the defaults. Unknown keys are ignored. */
export function resolveTargets(stored: Array<{ key: string; value: number }>): ResolvedTargets {
  const values = Object.fromEntries(TARGET_DEFS.map((def) => [def.key, def.defaultValue]));
  const micro = { ...MICRO_TARGET_DEFAULTS };
  for (const row of stored) {
    if (row.key.startsWith("micro:")) {
      const microKey = row.key.slice("micro:".length);
      if (microKey in MICRONUTRIENTS) micro[microKey] = row.value;
    } else if (row.key in values) {
      values[row.key] = row.value;
    }
  }
  return { values, micro };
}

export type FitStatus = "ok" | "near" | "over" | "met" | "partial" | "low";

/**
 * Cap: ok ≤ 90% · near 90–100% · over > 100%.
 * Goal: met ≥ 100% · partial 60–100% · low < 60%.
 */
export function fitStatus(value: number, target: number, kind: TargetKind): FitStatus {
  if (target <= 0) return kind === "cap" ? "ok" : "low";
  const ratio = value / target;
  if (kind === "cap") {
    if (ratio > 1) return "over";
    if (ratio >= 0.9) return "near";
    return "ok";
  }
  if (ratio >= 1) return "met";
  if (ratio >= 0.6) return "partial";
  return "low";
}

export function percentOfTarget(value: number, target: number): number {
  if (target <= 0) return 0;
  return Math.round((value / target) * 100);
}
