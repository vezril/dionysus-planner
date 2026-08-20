/**
 * Pantry freshness (openspec: pantry-freshness). Pure, framework-free —
 * `now` is an explicit parameter (the domain never reads the clock).
 * Day-granular: partial days round DOWN for age and expiry math, so an
 * item stocked 36h ago is "1d ago" and a 14-day shelf life warns from
 * day 11 (≤ 3 days left) and expires past day 14.
 */
const MS_PER_DAY = 86_400_000;
export const EXPIRING_WINDOW_DAYS = 3;

export type FreshnessStatus = "fresh" | "expiring" | "expired";

export interface Freshness {
  daysSinceStocked: number;
  /** Whole days until the estimate; negative once past. Null without a shelf life. */
  daysLeft: number | null;
  status: FreshnessStatus;
}

export function computeFreshness(
  stockedAt: string | null,
  shelfLifeDays: number | null,
  now: Date,
): Freshness | null {
  if (stockedAt === null) return null;
  const stocked = new Date(stockedAt);
  if (Number.isNaN(stocked.getTime())) return null;

  const daysSinceStocked = Math.max(0, Math.floor((now.getTime() - stocked.getTime()) / MS_PER_DAY));
  if (shelfLifeDays === null) {
    return { daysSinceStocked, daysLeft: null, status: "fresh" };
  }

  const daysLeft = Math.floor(shelfLifeDays - daysSinceStocked);
  const status: FreshnessStatus =
    daysLeft < 0 ? "expired" : daysLeft <= EXPIRING_WINDOW_DAYS ? "expiring" : "fresh";
  return { daysSinceStocked, daysLeft, status };
}
