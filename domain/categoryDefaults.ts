/**
 * openspec: category-defaults — pure resolution of category nutrition
 * defaults. Deepest matching path wins; among a product's categories
 * the FIRST listed breaks depth ties; matching is case-insensitive on
 * normalized "/"-joined paths. Framework-free.
 */
import { splitCategoryPath } from "@/domain/categoryTree";

export interface CategoryDefaults {
  displayPath: string;
  caloriesPerRef: number | null;
  proteinPerRef: number | null;
  carbsPerRef: number | null;
  fatPerRef: number | null;
  alcoholAbvPercent: number | null;
}

/** Lowercase-normalized "/" key for a category path string. */
export function normalizeCategoryPath(category: string): string {
  return splitCategoryPath(category).join("/").toLowerCase();
}

/**
 * Picks the defaults for a product's category list from the stored
 * map (keys already normalized). Checks each category's full path,
 * then its ancestors; the deepest match anywhere wins, first-listed
 * category on equal depth.
 */
export function resolveCategoryDefaults(
  categories: string[],
  defaultsByPath: Map<string, CategoryDefaults>,
): CategoryDefaults | null {
  let best: { depth: number; order: number; defaults: CategoryDefaults } | null = null;
  categories.forEach((category, order) => {
    const segments = splitCategoryPath(category);
    for (let depth = segments.length; depth >= 1; depth -= 1) {
      const key = segments.slice(0, depth).join("/").toLowerCase();
      const found = defaultsByPath.get(key);
      if (!found) continue;
      if (
        best === null ||
        depth > best.depth ||
        (depth === best.depth && order < best.order)
      ) {
        best = { depth, order, defaults: found };
      }
      break; // deeper prefixes of THIS category already checked
    }
  });
  return best === null ? null : (best as { defaults: CategoryDefaults }).defaults;
}
