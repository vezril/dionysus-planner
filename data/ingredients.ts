/**
 * Ingredient catalog data-layer entry point for `app/api/ingredients/route.ts`
 * and `app/ingredients/page.tsx` (docs/stories/S-301). Kept in `/data/**`
 * (not the route/page themselves) per the architecture.md §5 boundary rule
 * — only `/data/**` may import drizzle-orm/better-sqlite3 — mirroring
 * `data/health.ts`'s per-call-connection pattern: a fresh `createDb()` on
 * every call (never a module-scope singleton), closed before returning, so
 * callers always observe the current `DB_PATH`/DB state.
 *
 * Projects `ingredientRepo`'s full `IngredientRecord` down to the lean
 * shape the catalog UI and the search box actually need (architecture.md
 * §5 ADR-004 — this route is also the reusable ingredient-picker backend
 * for pantry/S-304 and recipe/S-401) — keeps the RSC payload and the
 * search API response small at NFR-3's ~2,000-row ceiling.
 */
import { createDb } from "@/data/db";
import * as ingredientRepo from "@/data/repositories/ingredientRepo";
import type { IngredientRecord } from "@/data/repositories/ingredientRepo";

export interface IngredientSummary {
  id: number;
  name: string;
  unitClass: "MASS" | "VOLUME" | "COUNT";
  source: "SEEDED" | "CUSTOM";
  caloriesPerRef: number;
  proteinPerRef: number;
  carbsPerRef: number;
  fatPerRef: number;
}

function toSummary(record: IngredientRecord): IngredientSummary {
  return {
    id: record.id,
    name: record.name,
    unitClass: record.unitClass,
    source: record.source,
    caloriesPerRef: record.caloriesPerRef,
    proteinPerRef: record.proteinPerRef,
    carbsPerRef: record.carbsPerRef,
    fatPerRef: record.fatPerRef,
  };
}

/**
 * Missing/empty `query` returns the full catalog (`ingredientRepo.listAll`);
 * a non-empty query delegates to `ingredientRepo.searchByName` (case-
 * insensitive substring match) — the exact split pinned by
 * tests/integration/api-ingredients.test.ts and this story's AC-3.
 */
export async function getIngredientCatalog(query?: string): Promise<IngredientSummary[]> {
  const db = createDb();
  try {
    const records = !query ? await ingredientRepo.listAll(db) : await ingredientRepo.searchByName(db, query);
    return records.map(toSummary);
  } finally {
    db.$client.close();
  }
}
