/** openspec: planner-consume — consume a planned entry from the phone:
 * same transition as the web planner (entry-date eatenAt, FIFO batch
 * drain / package-sized pantry portions, consumedAt mark). */
import { consumePlanEntry } from "@/app/actions/planner-actions";
import { withRouteLog } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return withRouteLog(request, async () => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Body must be JSON." }, { status: 400 });
    }
    const id = (body as { id?: unknown })?.id;
    if (typeof id !== "number") {
      return Response.json({ error: "id (number) is required." }, { status: 400 });
    }
    const result = await consumePlanEntry(id);
    if (!result.ok) {
      const status = result.error.code === "SERVICE_ERROR" ? 502 : result.error.code === "NOT_FOUND" ? 404 : 400;
      return Response.json({ error: result.error.message }, { status });
    }
    return Response.json(result.data, { status: 200 });
  });
}
