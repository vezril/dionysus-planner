import { describe, expect, it } from "vitest";
import {
  buildCategoryTree,
  expandCategoryLevels,
  pruneTreeByQuery,
  splitCategoryPath,
} from "@/domain/categoryTree";

/** openspec: category-tree — the user's Rhum taxonomy, verbatim. */
const products = [
  { id: 1, name: "product 1", categories: ["Rhum/Lightly Aged Pot Rhum"] },
  { id: 2, name: "product 2", categories: ["Rhum / Lightly aged pot rhum"] }, // spacing+case variant merges
  { id: 3, name: "product 3", categories: ["Rhum/Another style of rhum"] },
  { id: 4, name: "plain salt", categories: ["seasoning"] },
  { id: 5, name: "mystery", categories: [] },
];

describe("categoryTree", () => {
  it("splits paths on slashes with trimming", () => {
    expect(splitCategoryPath(" Rhum / Lightly Aged Pot Rhum ")).toEqual(["Rhum", "Lightly Aged Pot Rhum"]);
    expect(splitCategoryPath("flat")).toEqual(["flat"]);
    expect(splitCategoryPath("//")).toEqual([]);
  });

  it("builds the nested tree with products at their leaves", () => {
    const tree = buildCategoryTree(products);
    expect(tree.map((node) => node.name)).toEqual(["Rhum", "seasoning", "Uncategorized"]);
    const rhum = tree[0];
    expect(rhum.children.map((child) => child.name)).toEqual(["Another style of rhum", "Lightly Aged Pot Rhum"]);
    const lightly = rhum.children[1];
    expect(lightly.products.map((product) => product.name)).toEqual(["product 1", "product 2"]);
    expect(rhum.children[0].products.map((product) => product.name)).toEqual(["product 3"]);
    expect(tree[2].products.map((product) => product.name)).toEqual(["mystery"]);
  });

  it("search prunes empty branches but keeps matching leaves' ancestors", () => {
    const pruned = pruneTreeByQuery(buildCategoryTree(products), "product 3");
    expect(pruned).toHaveLength(1);
    expect(pruned[0].name).toBe("Rhum");
    expect(pruned[0].children).toHaveLength(1);
    expect(pruned[0].children[0].name).toBe("Another style of rhum");
  });

  it("expands category paths into every level name for derived tags", () => {
    expect(expandCategoryLevels(["Rhum/Lightly Aged Pot Rhum", "seasoning"])).toEqual([
      "Rhum",
      "Lightly Aged Pot Rhum",
      "seasoning",
    ]);
  });
});
