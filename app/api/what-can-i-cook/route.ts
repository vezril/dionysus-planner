/**
 * "What Can I Cook" threshold Route Handler (architecture.md §5 ADR-004,
 * docs/stories/S-502-near-match-threshold.md AC-2/AC-3/AC-4). Node runtime
 * only — `better-sqlite3` is a native Node addon and cannot run on the Edge
 * runtime (ADR-004). Delegates the actual scan + classification work to
 * `data/whatCanICook.ts#getWhatCanICook` (the same assembly function
 * `app/what-can-i-cook/page.tsx`'s RSC render calls) so the scan logic is
 * never duplicated here.
 *
 * `threshold` query-param handling:
 *   - missing or non-numeric -> falls back to
 *     `app/lib/threshold.ts#resolveDefaultThreshold()` (env-resolved
 *     default, read at call time).
 *   - numeric -> clamped server-side to [0, 20] (never trusted from the
 *     client, never thrown, never silently defaulted once it's numeric).
 */
import { getWhatCanICook } from "@/data/whatCanICook";
import { resolveDefaultThreshold } from "@/app/lib/threshold";

export const runtime = "nodejs";

const MIN_THRESHOLD = 0;
const MAX_THRESHOLD = 20;

function resolveThreshold(raw: string | null): number {
  if (raw === null) {
    return resolveDefaultThreshold();
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return resolveDefaultThreshold();
  }

  return Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, parsed));
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const threshold = resolveThreshold(searchParams.get("threshold"));

  const result = await getWhatCanICook(threshold);

  return Response.json(result, { status: 200 });
}
