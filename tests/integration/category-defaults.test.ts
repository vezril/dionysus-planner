import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/** openspec: category-defaults — action round-trip + API resolution. */
describe("category defaults", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-catdef-test-${randomUUID()}-`));
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

  it("set, resolve via the API (ancestor fallback), and clear", async () => {
    const { setCategoryDefaults } = await import("@/app/actions/category-defaults-actions");
    const saved = await setCategoryDefaults({
      displayPath: "Rhum/Lightly Aged Pot Rhum",
      caloriesPerRef: 235,
      proteinPerRef: 0,
      carbsPerRef: 0,
      fatPerRef: 0,
      alcoholAbvPercent: 40,
    });
    expect(saved.ok).toBe(true);

    const { GET } = await import("@/app/api/category-defaults/route");
    const exact = await GET(new Request("http://x/api/category-defaults?categories=" + encodeURIComponent("RHUM/lightly aged pot rhum")));
    expect(exact.status).toBe(200);
    expect(((await exact.json()) as { caloriesPerRef: number; alcoholAbvPercent: number }).alcoholAbvPercent).toBe(40);

    // No defaults for the sibling style, none on the parent → 404.
    const miss = await GET(new Request("http://x/api/category-defaults?categories=" + encodeURIComponent("Rhum/Agricole")));
    expect(miss.status).toBe(404);

    // Parent defaults make the sibling resolve via ancestor.
    await setCategoryDefaults({ displayPath: "Rhum", caloriesPerRef: 231, proteinPerRef: null, carbsPerRef: null, fatPerRef: null, alcoholAbvPercent: null });
    const viaParent = await GET(new Request("http://x/api/category-defaults?categories=" + encodeURIComponent("Rhum/Agricole")));
    expect(((await viaParent.json()) as { caloriesPerRef: number }).caloriesPerRef).toBe(231);

    const { clearCategoryDefaults } = await import("@/app/actions/category-defaults-actions");
    await clearCategoryDefaults("Rhum/Lightly Aged Pot Rhum");
    await clearCategoryDefaults("Rhum");
    const gone = await GET(new Request("http://x/api/category-defaults?categories=Rhum"));
    expect(gone.status).toBe(404);
  });

  it("all-null values delete the row instead of storing emptiness", async () => {
    const { setCategoryDefaults } = await import("@/app/actions/category-defaults-actions");
    await setCategoryDefaults({ displayPath: "beer", caloriesPerRef: 43, proteinPerRef: null, carbsPerRef: null, fatPerRef: null, alcoholAbvPercent: null });
    await setCategoryDefaults({ displayPath: "beer", caloriesPerRef: null, proteinPerRef: null, carbsPerRef: null, fatPerRef: null, alcoholAbvPercent: null });
    const sqlite = new Database(dbPath);
    const count = (sqlite.prepare("SELECT COUNT(*) AS n FROM category_nutrition").get() as { n: number }).n;
    sqlite.close();
    expect(count).toBe(0);
  });
});
