import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";
import { insertRawIngredient } from "./support/rawFixtures";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * openspec: ariadne-product-ref — P1 of the Ariadne migration: the
 * reference exists, defaults null, survives edits, and rides the backup.
 * Nothing reads it yet, so these are the whole contract.
 */
describe("ingredient.productId", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-productref-test-${randomUUID()}-`));
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

  it("defaults to null for ingredients created through the normal path", async () => {
    const { createIngredient } = await import("@/app/actions/ingredient-actions");
    const result = await createIngredient({
      name: "Ref Test Butter",
      unitClass: "MASS",
      caloriesPerRef: 717,
      proteinPerRef: 0.9,
      carbsPerRef: 0.1,
      fatPerRef: 81,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { getIngredientRecordById } = await import("@/data/ingredients");
    expect((await getIngredientRecordById(result.data.id))!.productId).toBeNull();
  });

  it("round-trips a set reference and survives an unrelated edit", async () => {
    const sqlite = new Database(dbPath);
    const id = insertRawIngredient(sqlite, { name: "Ref Test Salmon", unitClass: "MASS", caloriesPerRef: 208 });
    sqlite.prepare("UPDATE ingredient SET productId = ? WHERE id = ?").run("prd_abc123", id);
    sqlite.close();

    const { getIngredientRecordById } = await import("@/data/ingredients");
    expect((await getIngredientRecordById(id))!.productId).toBe("prd_abc123");

    // An ordinary nutrition edit must not clear the link.
    const { overrideIngredientNutrition } = await import("@/app/actions/ingredient-actions");
    const edited = await overrideIngredientNutrition(id, {
      name: "Ref Test Salmon",
      unitClass: "MASS",
      caloriesPerRef: 210,
      proteinPerRef: 20,
      carbsPerRef: 0,
      fatPerRef: 13,
    });
    expect(edited.ok).toBe(true);
    const after = (await getIngredientRecordById(id))!;
    expect(after.caloriesPerRef).toBe(210);
    expect(after.productId).toBe("prd_abc123");
  });

  it("rides the backup export", async () => {
    const sqlite = new Database(dbPath);
    const id = insertRawIngredient(sqlite, { name: "Ref Test Oats", unitClass: "MASS", caloriesPerRef: 380 });
    sqlite.prepare("UPDATE ingredient SET productId = ? WHERE id = ?").run("prd_oats", id);
    sqlite.close();

    const { buildFullBackup } = await import("@/data/backup");
    const bundle = await buildFullBackup();
    const product = bundle.products.find((row) => row.name === "Ref Test Oats")!;
    expect(product.productId).toBe("prd_oats");
  });
});
