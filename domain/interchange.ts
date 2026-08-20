/**
 * Interchangeable-stock normalization (openspec: generic-products). Pure,
 * framework-free. A GROUP is a generic plus every product linked to it
 * (`genericOfId`, one level, same unit class — enforced at write time).
 *
 * Availability math never wants brands: normalize recipe-line ingredient
 * ids to their group ROOT and merge pantry rows per root, then feed the
 * existing matching/depletion machinery unchanged. Normalizing lines to
 * the root also makes overlapping references (a generic line and a
 * product line in one recipe) aggregate instead of double-counting.
 */
export type GenericLinks = Map<number, number | null>;

export function rootOf(ingredientId: number, links: GenericLinks): number {
  return links.get(ingredientId) ?? ingredientId;
}

export interface MergeableRow {
  id: number;
  ingredientId: number;
  quantityCanonical: number;
  entryUnitClass: "MASS" | "VOLUME" | "COUNT";
}

/**
 * Merges pantry rows into one virtual row per group root. Same-class
 * membership is a write-time invariant, so canonical quantities add
 * directly; a mixed-class group (legacy data) falls back to keeping the
 * mismatched row separate rather than guessing.
 */
export function mergeRowsByGroup<T extends MergeableRow>(rows: T[], links: GenericLinks): T[] {
  const byRoot = new Map<number, T>();
  const kept: T[] = [];
  for (const row of rows) {
    const root = rootOf(row.ingredientId, links);
    const existing = byRoot.get(root);
    if (!existing) {
      byRoot.set(root, { ...row, ingredientId: root });
    } else if (existing.entryUnitClass === row.entryUnitClass) {
      existing.quantityCanonical += row.quantityCanonical;
    } else {
      kept.push({ ...row });
    }
  }
  return [...byRoot.values(), ...kept];
}

/** Rewrites a line's ingredientId (and nested ingredient id when present)
 * to the group root, leaving everything else — class, density, package —
 * as the LINE ingredient declared it. */
export function normalizeLineToRoot<T extends { ingredientId: number }>(line: T, links: GenericLinks): T {
  const root = rootOf(line.ingredientId, links);
  if (root === line.ingredientId) return line;
  const next: T = { ...line, ingredientId: root };
  const ingredient = (next as { ingredient?: unknown }).ingredient;
  if (ingredient && typeof ingredient === "object" && "id" in (ingredient as object)) {
    (next as unknown as { ingredient: object }).ingredient = { ...(ingredient as object), id: root };
  }
  return next;
}
