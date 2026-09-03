import { describe, expect, it } from "vitest";
import { renderBackupMarkdown, sanitizeNoteName, type BackupBundle } from "@/domain/backupMarkdown";

/** openspec: backup-export — pure markdown rendering. */
const bundle: BackupBundle = {
  exportedAt: "2026-08-23T12:00:00.000Z",
  recipes: [
    {
      id: 1,
      name: "Seared Salmon",
      servings: 2,
      rating: 4,
      variantOfName: null,
      tags: ["dinner"],
      derivedTags: ["fish"],
      instructions: "Sear 300 g, Salmon skin down.",
      lines: [{ displayQuantity: 300, displayUnit: "g", ingredientName: "Salmon" }],
    },
  ],
  products: [
    {
      id: 7,
      name: "Salmon / Atlantic: fresh?",
      category: "FOOD",
      unitClass: "MASS",
      brand: "Brandy",
      barcode: "0123",
      productId: null,
      readyToEat: false,
      categories: ["fish"],
      merchantLinks: ["https://store.example/salmon"],
      caloriesPerRef: 208,
      proteinPerRef: 20,
      carbsPerRef: 0,
      fatPerRef: 13,
    },
  ],
  pantry: [{ ingredientName: "Salmon", displayQuantity: 300, displayUnit: "g", stockedAt: "2026-08-20" }],
};

describe("backup markdown", () => {
  it("renders one note per recipe and product plus README and pantry", () => {
    const files = renderBackupMarkdown(bundle);
    const paths = files.map((file) => file.path);
    expect(paths).toEqual(["README.md", "Recipes/Seared Salmon.md", "Products/Salmon Atlantic fresh.md", "Pantry.md"]);
  });

  it("recipe notes carry frontmatter tags, ingredients, and instructions", () => {
    const recipe = renderBackupMarkdown(bundle).find((file) => file.path.startsWith("Recipes/"))!;
    expect(recipe.content).toContain('tags: ["dinner", "fish"]');
    expect(recipe.content).toContain("rating: 4");
    expect(recipe.content).toContain("- 300 g, Salmon");
    expect(recipe.content).toContain("Sear 300 g, Salmon skin down.");
  });

  it("product notes carry nutrition and merchant links", () => {
    const product = renderBackupMarkdown(bundle).find((file) => file.path.startsWith("Products/"))!;
    expect(product.content).toContain("| Calories | 208 kcal |");
    expect(product.content).toContain('barcode: "0123"');
    expect(product.content).toContain("https://store.example/salmon");
  });

  it("sanitizes unsafe names and dedupes collisions with the id", () => {
    const taken = new Set<string>();
    expect(sanitizeNoteName('A/B: "C"?', 1, taken)).toBe("A B C");
    expect(sanitizeNoteName("a b c", 2, taken)).toBe("a b c (2)");
    expect(sanitizeNoteName("///", 3, taken)).toBe("item-3");
  });
});
