import { beforeEach, describe, expect, it } from "vitest";
 
// is currently a placeholder (`export {}`, S-101 scaffold); this suite is
// intentionally RED until the S-202 implementer builds the named exports
// below.
import * as pantryRepo from "@/data/repositories/pantryRepo";
import { toCanonical } from "@/domain/units";
import { createMigratedDrizzleDb, type MigratedDrizzleDb } from "../support/migratedDb";
import { insertRawIngredient } from "../support/rawFixtures";

/**
 * S-202: pantryRepo (data <-> domain mapping).
 *
 * Traces to docs/stories/S-202-repositories.md AC-1, AC-3, and the
 * pantryRepo task list (getByIngredientId, insert, updateQuantity, delete,
 * getAllAsIndex). Covers FR-9 (canonical + display round-trip) and Flow C's
 * `pantryRepo.getAllAsIndex()` data shape.
 *
 * `data/repositories/pantryRepo.ts` is currently `export {}` — every test
 * below is intentionally RED until the implementer builds the module.
 *
 * ============================ PINNED API SHAPE ============================
 * interface PantryItemRecord {
 *   id: number;
 *   ingredientId: number;
 *   quantityCanonical: number;
 *   entryUnitClass: "MASS" | "VOLUME" | "COUNT";
 *   displayQuantity: number;
 *   displayUnit: string;
 *   updatedAt: string;
 * }
 *
 * pantryRepo.insert(db, input: { ingredientId, quantityCanonical, entryUnitClass, displayQuantity, displayUnit }): PantryItemRecord
 * pantryRepo.getByIngredientId(db, ingredientId: number): PantryItemRecord | null
 * pantryRepo.updateQuantity(db, id: number, patch: { quantityCanonical, entryUnitClass, displayQuantity, displayUnit }): PantryItemRecord
 * pantryRepo.remove(db, id: number): void
 * pantryRepo.getAllAsIndex(db): Map<number, { qtyCanonical: number; class: "MASS"|"VOLUME"|"COUNT" }>
 *   - field names are `qtyCanonical`/`class` VERBATIM per architecture.md
 *     §4/§6 Flow C ("Map<ingredientId, {qtyCanonical, class}>") — NOT
 *     `quantityCanonical`/`entryUnitClass`. This is the exact shape
 *     `domain/matching.ts` (S-104) and `domain/units.ts`'s
 *     `resolveQuantityForComparison` consume; do not rename.
 * ===========================================================================
 */
describe("data/repositories/pantryRepo", () => {
  let db: MigratedDrizzleDb;
  let sqlite: ReturnType<typeof createMigratedDrizzleDb>["sqlite"];
  let ingredientId: number;

  beforeEach(() => {
    ({ db, sqlite } = createMigratedDrizzleDb());
    ingredientId = insertRawIngredient(sqlite, { name: "Butter", unitClass: "MASS" });
  });

  describe("FR-9 round-trip: canonical + display values persist exactly (AC-1)", () => {
    it("2 lb displays back verbatim while canonical quantity/class are correct", async () => {
      const { quantityCanonical, entryUnitClass } = toCanonical(2, "lb");

      await pantryRepo.insert(db, {
        ingredientId,
        quantityCanonical,
        entryUnitClass,
        displayQuantity: 2,
        displayUnit: "lb",
      });

      const found = await pantryRepo.getByIngredientId(db, ingredientId);
      expect(found).not.toBeNull();
      expect(found!.entryUnitClass).toBe("MASS");
      expect(found!.quantityCanonical).toBeCloseTo(907.184, 1);
      // Verbatim redisplay — no lossy round-trip through conversion (FR-9).
      expect(found!.displayQuantity).toBe(2);
      expect(found!.displayUnit).toBe("lb");
    });
  });

  describe("getByIngredientId()", () => {
    it("returns null when the ingredient has no pantry row", async () => {
      expect(await pantryRepo.getByIngredientId(db, ingredientId)).toBeNull();
    });

    it("returns exactly the documented field set — no Drizzle row metadata", async () => {
      await pantryRepo.insert(db, {
        ingredientId,
        quantityCanonical: 100,
        entryUnitClass: "MASS",
        displayQuantity: 100,
        displayUnit: "g",
      });

      const found = await pantryRepo.getByIngredientId(db, ingredientId);
      expect(Object.keys(found!).sort()).toEqual(
        ["id", "ingredientId", "quantityCanonical", "entryUnitClass", "displayQuantity", "displayUnit", "updatedAt"].sort(),
      );
    });
  });

  describe("updateQuantity()", () => {
    it("replaces the canonical + display values on an existing row", async () => {
      const inserted = await pantryRepo.insert(db, {
        ingredientId,
        quantityCanonical: 100,
        entryUnitClass: "MASS",
        displayQuantity: 100,
        displayUnit: "g",
      });

      const updated = await pantryRepo.updateQuantity(db, inserted.id, {
        quantityCanonical: 250,
        entryUnitClass: "MASS",
        displayQuantity: 250,
        displayUnit: "g",
      });

      expect(updated.quantityCanonical).toBe(250);
      expect(updated.displayQuantity).toBe(250);

      const reread = await pantryRepo.getByIngredientId(db, ingredientId);
      expect(reread!.quantityCanonical).toBe(250);
    });
  });

  describe("remove()", () => {
    it("deletes the pantry row for an ingredient", async () => {
      const inserted = await pantryRepo.insert(db, {
        ingredientId,
        quantityCanonical: 100,
        entryUnitClass: "MASS",
        displayQuantity: 100,
        displayUnit: "g",
      });

      await pantryRepo.remove(db, inserted.id);

      expect(await pantryRepo.getByIngredientId(db, ingredientId)).toBeNull();
    });
  });

  describe("getAllAsIndex() — Map<ingredientId, {qtyCanonical, class}> for O(1) matching lookups (AC-3)", () => {
    it("returns an empty Map when the pantry is empty", async () => {
      const index = await pantryRepo.getAllAsIndex(db);
      expect(index).toBeInstanceOf(Map);
      expect(index.size).toBe(0);
    });

    it("keys the Map by ingredientId with the exact {qtyCanonical, class} shape", async () => {
      const flourId = insertRawIngredient(sqlite, { name: "Flour", unitClass: "MASS" });
      const milkId = insertRawIngredient(sqlite, { name: "Milk", unitClass: "VOLUME" });

      await pantryRepo.insert(db, {
        ingredientId: flourId,
        quantityCanonical: 500,
        entryUnitClass: "MASS",
        displayQuantity: 500,
        displayUnit: "g",
      });
      await pantryRepo.insert(db, {
        ingredientId: milkId,
        quantityCanonical: 1000,
        entryUnitClass: "VOLUME",
        displayQuantity: 1,
        displayUnit: "L",
      });

      const index = await pantryRepo.getAllAsIndex(db);

      expect(index.size).toBe(2);
      expect(index.get(flourId)).toEqual({ qtyCanonical: 500, class: "MASS" });
      expect(index.get(milkId)).toEqual({ qtyCanonical: 1000, class: "VOLUME" });
      // Exactly the two documented keys, nothing else.
      expect(Object.keys(index.get(flourId)!).sort()).toEqual(["class", "qtyCanonical"]);
    });
  });
});
