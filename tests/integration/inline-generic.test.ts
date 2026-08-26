import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/** openspec: inline-generic-create — reuse-or-create a generic from the
 * product create actions. */
describe("inline generic creation", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-inlgen-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    vi.resetModules();
    const sqlite = new Database(dbPath);
    runMigrations(sqlite);
    sqlite.close();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  function rows(sql: string): Array<Record<string, unknown>> {
    const sqlite = new Database(dbPath);
    const result = sqlite.prepare(sql).all() as Array<Record<string, unknown>>;
    sqlite.close();
    return result;
  }

  it("creates the generic seeded with the product's nutrition and links it", async () => {
    const { createIngredient } = await import("@/app/actions/ingredient-actions");
    const result = await createIngredient({
      name: "Lagabière IPA",
      unitClass: "VOLUME",
      category: "DRINK",
      caloriesPerRef: 43,
      proteinPerRef: 0.5,
      carbsPerRef: 3.6,
      fatPerRef: 0,
      readyToEat: true,
      newGenericName: "Beer",
    });
    expect(result.ok).toBe(true);

    const all = rows("SELECT id, name, genericOfId, unitClass, category, caloriesPerRef, readyToEat FROM ingredient WHERE name IN ('Beer', 'Lagabière IPA')");
    const generic = all.find((row) => row.name === "Beer")!;
    const product = all.find((row) => row.name === "Lagabière IPA")!;
    expect(generic).toMatchObject({ genericOfId: null, unitClass: "VOLUME", category: "DRINK", caloriesPerRef: 43, readyToEat: 0 });
    expect(product.genericOfId).toBe(generic.id);
  });

  it("reuses an existing same-class generic case-insensitively", async () => {
    const { createIngredient } = await import("@/app/actions/ingredient-actions");
    await createIngredient({
      name: "First Lager",
      unitClass: "VOLUME",
      category: "DRINK",
      caloriesPerRef: 40,
      proteinPerRef: 0,
      carbsPerRef: 3,
      fatPerRef: 0,
      readyToEat: false,
      newGenericName: "Beer",
    });
    await createIngredient({
      name: "Second Stout",
      unitClass: "VOLUME",
      category: "DRINK",
      caloriesPerRef: 60,
      proteinPerRef: 1,
      carbsPerRef: 5,
      fatPerRef: 0,
      readyToEat: false,
      newGenericName: "beer",
    });
    expect(rows("SELECT id FROM ingredient WHERE LOWER(name) = 'beer'")).toHaveLength(1);
    const linked = rows("SELECT genericOfId FROM ingredient WHERE name IN ('First Lager', 'Second Stout')");
    expect(new Set(linked.map((row) => row.genericOfId)).size).toBe(1);
  });

  it("the quick-create dialog action does the same", async () => {
    const { createCustomPantryItem } = await import("@/app/actions/custom-pantry-item-actions");
    const result = await createCustomPantryItem({
      name: "Corner-store Cola",
      unitClass: "VOLUME",
      category: "DRINK",
      nutritionBasisQuantity: 100,
      nutritionBasisUnit: "mL",
      caloriesPerRef: 42,
      proteinPerRef: 0,
      carbsPerRef: 11,
      fatPerRef: 0,
      readyToEat: true,
      initialQuantity: 355,
      unit: "mL",
      newGenericName: "Soda",
    });
    expect(result.ok).toBe(true);
    const generic = rows("SELECT id, genericOfId, unitClass FROM ingredient WHERE name = 'Soda'");
    expect(generic).toHaveLength(1);
    expect(generic[0].genericOfId).toBeNull();
    const product = rows("SELECT genericOfId FROM ingredient WHERE name = 'Corner-store Cola'");
    expect(product[0].genericOfId).toBe(generic[0].id);
  });
});
