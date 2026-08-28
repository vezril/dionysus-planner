/** openspec: backup-export — the lossless JSON bundle. */
import { buildFullBackup } from "@/data/backup";
import { withRouteLog } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withRouteLog(request, async () => {
    return Response.json(await buildFullBackup(), { status: 200 });
  });
}
