/**
 * App-layer default near-match threshold resolution (architecture.md §4
 * OQ-1). `domain/matching.ts#computeCookableAndNearMatch` takes `threshold`
 * as an explicit parameter and never reads `process.env` itself — this is
 * the one place that reads `NEAR_MATCH_DEFAULT_THRESHOLD` and falls back to
 * the PRD's default of `3`. Consumed by `app/what-can-i-cook/page.tsx`
 * (S-501) and, per this story's Context, S-406/S-502 later.
 *
 * Deliberately pure: no DB import, no Next.js import. Reads the env var at
 * CALL time (not module-load time) so callers observe the current process
 * env on every invocation.
 */

const DEFAULT_THRESHOLD = 3;

export function resolveDefaultThreshold(): number {
  const raw = process.env.NEAR_MATCH_DEFAULT_THRESHOLD;
  if (raw === undefined) {
    return DEFAULT_THRESHOLD;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return DEFAULT_THRESHOLD;
  }

  return parsed;
}
