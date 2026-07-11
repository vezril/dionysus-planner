/**
 * Health check Route Handler (architecture.md §5 ADR-004, §6 Flow A Risk
 * #6). Node runtime only — `better-sqlite3` is a native addon and cannot
 * run on the Edge runtime (ADR-004). Delegates the actual DB check to
 * `data/health.ts` (only `/data/**` may import drizzle-orm/better-sqlite3
 * per the §5 boundary rule); this file touches no DB driver directly.
 */
import { isSeedComplete } from "@/data/health";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  void request;

  const healthy = isSeedComplete();

  return Response.json({ status: healthy ? "ok" : "unavailable" }, { status: healthy ? 200 : 503 });
}
