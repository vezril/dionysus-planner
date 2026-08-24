/**
 * openspec: category-tree — pure helpers for hierarchical categories.
 * A category is a "/"-separated path (broad → narrow), stored in the
 * SAME ingredient_tag rows as flat labels. Framework-free.
 */

export interface CategoryTreeProduct {
  id: number;
  name: string;
}

export interface CategoryNode {
  name: string;
  children: CategoryNode[];
  products: CategoryTreeProduct[];
}

/** "Rhum / Lightly Aged Pot Rhum" → ["Rhum", "Lightly Aged Pot Rhum"]. */
export function splitCategoryPath(category: string): string[] {
  return category
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");
}

const UNCATEGORIZED = "Uncategorized";

/**
 * Builds the browse tree. A product appears once per category path it
 * carries, attached at the path's leaf; products with no categories
 * land under "Uncategorized". Nodes and products sort alphabetically.
 */
export function buildCategoryTree(
  products: Array<CategoryTreeProduct & { categories: string[] }>,
): CategoryNode[] {
  const roots: CategoryNode[] = [];

  const childOf = (siblings: CategoryNode[], name: string): CategoryNode => {
    const existing = siblings.find((node) => node.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const created: CategoryNode = { name, children: [], products: [] };
    siblings.push(created);
    return created;
  };

  const nodeFor = (path: string[]): CategoryNode => {
    let siblings = roots;
    let node: CategoryNode | null = null;
    for (const segment of path) {
      node = childOf(siblings, segment);
      siblings = node.children;
    }
    return node!;
  };

  for (const product of products) {
    const paths = product.categories.map(splitCategoryPath).filter((path) => path.length > 0);
    if (paths.length === 0) {
      nodeFor([UNCATEGORIZED]).products.push({ id: product.id, name: product.name });
      continue;
    }
    for (const path of paths) {
      nodeFor(path).products.push({ id: product.id, name: product.name });
    }
  }

  const sortNode = (node: CategoryNode): CategoryNode => ({
    name: node.name,
    children: node.children
      .map(sortNode)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    products: [...node.products].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    ),
  });

  return roots
    .map(sortNode)
    .sort((a, b) => {
      if (a.name === UNCATEGORIZED) return 1;
      if (b.name === UNCATEGORIZED) return -1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
}

/** Keeps products whose name matches; prunes branches left empty. */
export function pruneTreeByQuery(nodes: CategoryNode[], query: string): CategoryNode[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return nodes;
  const prune = (node: CategoryNode): CategoryNode | null => {
    const products = node.products.filter((product) => product.name.toLowerCase().includes(needle));
    const children = node.children.map(prune).filter((child): child is CategoryNode => child !== null);
    if (products.length === 0 && children.length === 0) return null;
    return { name: node.name, children, products };
  };
  return nodes.map(prune).filter((node): node is CategoryNode => node !== null);
}

/** Every level name of every path — the derived-tag expansion. */
export function expandCategoryLevels(categories: string[]): string[] {
  const seen = new Set<string>();
  const levels: string[] = [];
  for (const category of categories) {
    for (const segment of splitCategoryPath(category)) {
      if (!seen.has(segment.toLowerCase())) {
        seen.add(segment.toLowerCase());
        levels.push(segment);
      }
    }
  }
  return levels;
}
