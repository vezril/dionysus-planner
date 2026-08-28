/** openspec: mobile-api — the planner week (entries, ready-to-eat,
 * suggestions, shopping list) for viewing and editing in the app. */
import { resolveDefaultThreshold } from "@/app/lib/threshold";
import { resolveDionysusTimezone, todayIsoDateIn } from "@/app/lib/dionysusTimezone";
import { getPlannerWeek } from "@/data/planner";
import { weekStartOf } from "@/domain/planner";
import { withRouteLog } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withRouteLog(request, async () => {
    const requested = new URL(request.url).searchParams.get("weekStart");
    const weekStart =
      requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)
        ? weekStartOf(requested)
        : weekStartOf(todayIsoDateIn(resolveDionysusTimezone()));
    return Response.json(await getPlannerWeek(weekStart, resolveDefaultThreshold()), { status: 200 });
  });
}
