/** openspec: api-docs — the raw OpenAPI document. */
import { openapiSpec } from "@/lib/openapi";

export const runtime = "nodejs";

export function GET(): Response {
  return Response.json(openapiSpec, { status: 200 });
}
