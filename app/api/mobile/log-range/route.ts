/** openspec: mobile-api — per-day rollups for a range (service proxy);
 * the app's HealthKit sync reads this. */
import { resolveDionysusServiceUrl } from "@/app/lib/dionysusServiceConfig";
import { getLogRange } from "@/services/dionysusService";
import { withRouteLog } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withRouteLog(request, async () => {
    const params = new URL(request.url).searchParams;
    const from = params.get("from");
    const to = params.get("to");
    if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return Response.json({ error: { code: "VALIDATION_ERROR", message: "from and to (YYYY-MM-DD) required" } }, { status: 400 });
    }
    try {
      return Response.json(await getLogRange(resolveDionysusServiceUrl(), from, to), { status: 200 });
    } catch {
      return Response.json({ error: { code: "SERVICE_ERROR", message: "Inventory service unreachable." } }, { status: 502 });
    }
  });
}
