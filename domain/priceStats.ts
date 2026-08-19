/**
 * Derived purchase-price stats (openspec: pantry-item-detail design.md
 * Decision 4) — computed from the purchase list at read time, never
 * stored, same philosophy as cookability. Pure, framework-free.
 */

export interface PriceStatsInput {
  price: number;
  store: string | null;
  purchasedAt: string; // YYYY-MM-DD
}

export interface PriceStats {
  /** Price of the most recent purchase (latest purchasedAt; ties broken by list order, first wins). */
  lastPaid: number;
  lowest: { price: number; store: string | null };
}

/** `null` when there are no purchases — the page renders an empty state, never zeros. */
export function computePriceStats(purchases: PriceStatsInput[]): PriceStats | null {
  if (purchases.length === 0) return null;

  let latest = purchases[0];
  let lowest = purchases[0];
  for (const p of purchases) {
    if (p.purchasedAt > latest.purchasedAt) latest = p;
    if (p.price < lowest.price) lowest = p;
  }
  return {
    lastPaid: latest.price,
    lowest: { price: lowest.price, store: lowest.store },
  };
}
