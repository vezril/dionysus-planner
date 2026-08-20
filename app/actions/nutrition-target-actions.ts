"use server";

/** openspec: nutrition-targets-guide — save the Guide page's target edits. */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { upsertTargets } from "@/data/nutritionTargets";
import { MICRONUTRIENTS } from "@/domain/micronutrients";
import { TARGET_DEFS } from "@/domain/nutritionTargets";

export interface ActionError {
  code: string;
  message: string;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

const VALID_KEYS = new Set([
  ...TARGET_DEFS.map((def) => def.key),
  ...Object.keys(MICRONUTRIENTS).map((key) => `micro:${key}`),
]);

const schema = z.array(z.object({ key: z.string(), value: z.number().gt(0) })).max(64);

export async function updateNutritionTargets(input: unknown): Promise<ActionResult<null>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "Targets failed validation." } };
  }
  const entries = parsed.data.filter((entry) => VALID_KEYS.has(entry.key));
  if (entries.length === 0) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "No known targets to save." } };
  }
  await upsertTargets(entries);
  revalidatePath("/guide");
  revalidatePath("/dashboard");
  revalidatePath("/planner");
  return { ok: true, data: null };
}
