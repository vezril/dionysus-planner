/**
 * openspec: pack-units — the INNER pre-portioned pack (a 366 g box of
 * 6 × 61 g packs). Pure. `pack`/`packs` is a product-relative unit that
 * expands to the product's pack size BEFORE canonicalization — entry
 * boundaries only, so resolveQuantityForComparison stays the single
 * conversion choke point.
 */

export function isPackUnit(unit: string): boolean {
  const lowered = unit.toLowerCase();
  return lowered === "pack" || lowered === "packs";
}

export interface PackSized {
  packQuantity: number | null;
  packUnit: string | null;
}

/**
 * Expands a pack-denominated entry to the product's real units.
 * Non-pack units pass through untouched; a pack entry on a product with
 * no pack size returns "NO_PACK" for the caller to surface.
 */
export function expandPackEntry(
  quantity: number,
  unit: string,
  product: PackSized,
): { quantity: number; unit: string } | "NO_PACK" {
  if (!isPackUnit(unit)) return { quantity, unit };
  if (product.packQuantity === null || product.packQuantity <= 0 || product.packUnit === null) {
    return "NO_PACK";
  }
  return { quantity: Math.round(quantity * product.packQuantity * 10_000) / 10_000, unit: product.packUnit };
}
