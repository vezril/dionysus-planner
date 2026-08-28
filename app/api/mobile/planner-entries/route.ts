/** openspec: mobile-api — add/remove plan entries from the app. */
import { addPlanEntry, removePlanEntry } from "@/app/actions/planner-actions";
import { withRouteLog } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return withRouteLog(request, async () => {
    const result = await addPlanEntry(await request.json().catch(() => null));
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    return Response.json(result.data, { status: 201 });
  });
}

export async function DELETE(request: Request): Promise<Response> {
  return withRouteLog(request, async () => {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ error: { code: "VALIDATION_ERROR", message: "id required" } }, { status: 400 });
    }
    const result = await removePlanEntry(id);
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    return new Response(null, { status: 204 });
  });
}
