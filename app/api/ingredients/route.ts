/**
 * Ingredient catalog search Route Handler (architecture.md §5 ADR-004,
 * docs/stories/S-301-ingredient-catalog-search.md AC-3). Node runtime
 * only — `better-sqlite3` is a native Node addon and cannot run on the
 * Edge runtime (ADR-004). Delegates the actual DB work to
 * `data/ingredients.ts` (only `/data/**` may import drizzle-orm/
 * better-sqlite3 per the §5 boundary rule); this file touches no DB
 * driver directly.
 *
 * Also the reusable ingredient-picker backend for pantry (S-304) and
 * recipe (S-401) comboboxes — the response shape stays stable/lean for
 * that reuse.
 */
import { getIngredientCatalog } from "@/data/ingredients";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";

  const ingredients = await getIngredientCatalog(query);

  return Response.json(ingredients, { status: 200 });
}
