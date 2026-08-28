/** openspec: api-docs — the raw OpenAPI document. */
import { openapiSpec } from "@/lib/openapi";
import { withRouteLog } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return withRouteLog(request, async () => {
    return Response.json(openapiSpec, { status: 200 });
  });
}
