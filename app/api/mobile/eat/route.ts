/** openspec: mobile-api — quick-consume straight from the pantry
 * (service-first all-or-nothing, mirrors the web Eat/Drink button). */
import { eatPantryItem } from "@/app/actions/eat-actions";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const result = await eatPantryItem(await request.json().catch(() => null));
  if (!result.ok) {
    const status = result.error.code === "NOT_FOUND" ? 404 : result.error.code === "SERVICE_ERROR" ? 502 : 400;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json(result.data, { status: 200 });
}
