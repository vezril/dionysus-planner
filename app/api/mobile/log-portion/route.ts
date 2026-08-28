/** openspec: mobile-api — one-tap "eat a batch portion" logging. */
import { quickLogBatchPortion } from "@/app/actions/meal-log-actions";
import { withRouteLog } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return withRouteLog(request, async () => {
    const body = (await request.json().catch(() => null)) as { batchId?: unknown } | null;
    const batchId = Number(body?.batchId);
    if (!Number.isInteger(batchId) || batchId <= 0) {
      return Response.json({ error: { code: "VALIDATION_ERROR", message: "batchId required" } }, { status: 400 });
    }
    const result = await quickLogBatchPortion(batchId);
    if (!result.ok) return Response.json({ error: result.error }, { status: 502 });
    return Response.json(result.data, { status: 200 });
  });
}
