"use server";

/** openspec: category-defaults — set/clear a category path's optional
 * nutrition defaults from the products tree. */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { removeCategoryDefaults, saveCategoryDefaults } from "@/data/ingredients";
import { normalizeCategoryPath } from "@/domain/categoryDefaults";

const valuesSchema = z.object({
  displayPath: z.string().trim().min(1),
  caloriesPerRef: z.number().min(0).nullable(),
  proteinPerRef: z.number().min(0).nullable(),
  carbsPerRef: z.number().min(0).nullable(),
  fatPerRef: z.number().min(0).nullable(),
  alcoholAbvPercent: z.number().min(0).max(100).nullable(),
});

export async function setCategoryDefaults(input: unknown): Promise<{ ok: boolean; message?: string }> {
  const parsed = valuesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Category defaults failed validation." };
  const path = normalizeCategoryPath(parsed.data.displayPath);
  if (path === "") return { ok: false, message: "That isn't a category path." };
  const { displayPath, ...values } = parsed.data;
  const allNull = Object.values(values).every((value) => value === null);
  if (allNull) {
    await removeCategoryDefaults(path);
  } else {
    await saveCategoryDefaults({ path, displayPath, ...values });
  }
  revalidatePath("/ingredients");
  return { ok: true };
}

export async function clearCategoryDefaults(displayPath: string): Promise<{ ok: boolean }> {
  await removeCategoryDefaults(normalizeCategoryPath(displayPath));
  revalidatePath("/ingredients");
  return { ok: true };
}
