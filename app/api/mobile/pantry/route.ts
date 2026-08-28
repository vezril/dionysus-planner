/** openspec: mobile-api — pantry rows for the companion app. */
import { getPantryList } from "@/data/pantry";
import { withRouteLog } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withRouteLog(request, async () => {
    return Response.json(await getPantryList(), { status: 200 });
  });
}
