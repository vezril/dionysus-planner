/** openspec: mobile-api — a day's meal log (service proxy). */
import { resolveDionysusServiceUrl } from "@/app/lib/dionysusServiceConfig";
import { resolveDionysusTimezone, todayIsoDateIn } from "@/app/lib/dionysusTimezone";
import { getDayLog } from "@/services/dionysusService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const requested = new URL(request.url).searchParams.get("date");
  const date =
    requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : todayIsoDateIn(resolveDionysusTimezone());
  try {
    return Response.json(await getDayLog(resolveDionysusServiceUrl(), date), { status: 200 });
  } catch {
    return Response.json({ error: { code: "SERVICE_ERROR", message: "Inventory service unreachable." } }, { status: 502 });
  }
}
