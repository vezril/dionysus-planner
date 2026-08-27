/**
 * openspec: planner-consume — what "one portion" of a ready-to-eat
 * product means when a planned pantry entry is consumed. Pure.
 *
 * COUNT products portion as 1 each; otherwise the INNER pack size
 * (openspec: pack-units) when one is recorded; then the package size;
 * then the nutrition reference (100 g / 100 mL) — the same ladder the
 * pantry Eat dialog prefills with.
 */

export interface PortionSizing {
  unitClass: "MASS" | "VOLUME" | "COUNT";
  packageQuantity: number | null;
  packageUnit: string | null;
  packQuantity?: number | null;
  packUnit?: string | null;
}

export function defaultPortionQuantity(product: PortionSizing): { quantity: number; unit: string } {
  if (product.unitClass === "COUNT") return { quantity: 1, unit: "each" };
  if (product.packQuantity != null && product.packQuantity > 0 && product.packUnit != null) {
    return { quantity: product.packQuantity, unit: product.packUnit };
  }
  if (product.packageQuantity !== null && product.packageQuantity > 0 && product.packageUnit !== null) {
    return { quantity: product.packageQuantity, unit: product.packageUnit };
  }
  return { quantity: 100, unit: product.unitClass === "MASS" ? "g" : "mL" };
}
