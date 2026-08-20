import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/** openspec: nutrition-targets-guide — persistence round-trip. */
describe("nutrition targets", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-targets-test-${randomUUID()}-`));
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

  it("updateNutritionTargets persists overrides; defaults fill the rest; unknown keys dropped", async () => {
    const { updateNutritionTargets } = await import("@/app/actions/nutrition-target-actions");
    const { getResolvedTargets } = await import("@/data/nutritionTargets");

    const result = await updateNutritionTargets([
      { key: "sodiumMg", value: 1500 },
      { key: "micro:vitaminD", value: 25 },
      { key: "hacks", value: 9 },
    ]);
    expect(result.ok).toBe(true);

    const targets = await getResolvedTargets();
    expect(targets.values.sodiumMg).toBe(1500);
    expect(targets.micro.vitaminD).toBe(25);
    expect(targets.values.caloriesKcal).toBe(2500);

    // Re-save updates in place.
    await updateNutritionTargets([{ key: "sodiumMg", value: 2000 }]);
    expect((await getResolvedTargets()).values.sodiumMg).toBe(2000);
  });

  it("rejects empty or non-positive input", async () => {
    const { updateNutritionTargets } = await import("@/app/actions/nutrition-target-actions");
    expect((await updateNutritionTargets([{ key: "sodiumMg", value: 0 }])).ok).toBe(false);
    expect((await updateNutritionTargets([{ key: "hacks", value: 5 }])).ok).toBe(false);
  });
});
