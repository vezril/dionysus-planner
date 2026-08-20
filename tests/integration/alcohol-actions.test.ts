import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/** openspec: alcohol-tracking — alcohol persists through create, scales
 * with a nutrition basis, and stays null when absent. */
describe("alcohol through the actions", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-alcohol-test-${randomUUID()}-`));
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

  const beerCan = {
    name: "Beer, lager",
    unitClass: "VOLUME",
    caloriesPerRef: 150,
    proteinPerRef: 1.6,
    carbsPerRef: 13,
    fatPerRef: 0,
    alcoholGPerRef: 14,
    nutritionBasisQuantity: 355,
    nutritionBasisUnit: "mL",
  };

  it("createIngredient scales per-355 mL alcohol to per-100 mL", async () => {
    const { createIngredient } = await import("@/app/actions/ingredient-actions");
    const result = await createIngredient(beerCan);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.alcoholGPerRef).toBe(3.9437);
    }
  });

  it("an absent alcohol value stays null", async () => {
    const { createIngredient } = await import("@/app/actions/ingredient-actions");
    const result = await createIngredient({
      ...beerCan,
      alcoholGPerRef: undefined,
      nutritionBasisQuantity: undefined,
      nutritionBasisUnit: undefined,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.alcoholGPerRef).toBeNull();
    }
  });
});
