/** openspec: category-defaults — resolve the prefill defaults for a
 * comma-separated category list (deepest match wins). 404 = none. */
import { getAllCategoryDefaultsMap } from "@/data/ingredients";
import { resolveCategoryDefaults } from "@/domain/categoryDefaults";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const raw = new URL(request.url).searchParams.get("categories") ?? "";
  const categories = raw.split(",").map((category) => category.trim()).filter(Boolean);
  if (categories.length === 0) {
    return Response.json({ error: { code: "VALIDATION_ERROR", message: "categories required" } }, { status: 400 });
  }
  const resolved = resolveCategoryDefaults(categories, await getAllCategoryDefaultsMap());
  if (resolved === null) {
    return Response.json({ error: { code: "NOT_FOUND", message: "No defaults for those categories." } }, { status: 404 });
  }
  return Response.json(resolved, { status: 200 });
}
