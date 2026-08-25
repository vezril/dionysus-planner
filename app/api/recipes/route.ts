/** openspec: subrecipes-consume-qol — recipe name search backing the
 * editor's `[[` sub-recipe autocomplete. Same lean shape as
 * /api/ingredients. */
import { listRecipeSummaries } from "@/data/recipes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase();
  const recipes = await listRecipeSummaries();
  const matched = query === "" ? recipes : recipes.filter((recipe) => recipe.name.toLowerCase().includes(query));
  return Response.json(matched.slice(0, 20).map((recipe) => ({ id: recipe.id, name: recipe.name })), { status: 200 });
}
