import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

// data/seed/seed.ts is currently a placeholder (`export {}`, S-101/S-203
// scaffold) — every test below is intentionally RED (either a compile-time
// "no export named X" on the type-only import, or a runtime "seed is not a
// function" TypeError) until the implementer builds the module. Do not
// "fix" this suite by loosening assertions — implement seed.ts to this
// contract instead.
import { seed, type SeedRow } from "@/data/seed/seed";
import { ingredient } from "@/data/schema";
import * as schema from "@/data/schema";
import realSeedData from "@/data/seed/seed-data.json";
import { createMigratedDrizzleDb, type MigratedDrizzleDb } from "./support/migratedDb";
import { insertRawIngredient } from "./support/rawFixtures";
import { SAMPLE_SEED_ROWS } from "./support/seedFixtures";

/**
 * S-203: idempotent, override-preserving seed runner.
 *
 * Traces to docs/stories/S-203-seed-mechanism-boot.md AC-1..AC-4 and
 * architecture.md §6 Flow A's algorithm (verbatim):
 *
 *   for each row in seed-data.json (keyed by seedKey):
 *     existing = SELECT * FROM ingredient WHERE seedKey = row.seedKey
 *     if not existing:              INSERT (source='SEEDED', overridden=false)
 *     else if existing.overridden == false:  UPDATE <nutrition fields> only
 *     else (existing.overridden == true):    skip entirely
 *
 * ============================ PINNED API SHAPE ============================
 * export interface SeedRow {
 *   seedKey: string;
 *   name: string;
 *   unitClass: "MASS" | "VOLUME" | "COUNT";
 *   densityGPerMl: number | null;
 *   caloriesPerRef: number;
 *   proteinPerRef: number;
 *   carbsPerRef: number;
 *   fatPerRef: number;
 *   fiberPerRef: number | null;
 *   sugarPerRef: number | null;
 *   sodiumMgPerRef: number | null;
 * }
 *
 * export async function seed(
 *   db: BetterSQLite3Database<typeof schema>,  // same drizzle wrapper shape data/db.ts's createDb() returns
 *   rows: SeedRow[],
 * ): Promise<void>
 *   - Runs the algorithm above for every row, inside a SINGLE transaction
 *     (AC-1: "...inside a single transaction") — a failure partway through
 *     must roll back every row from that call, not commit a partial batch.
 *   - Joins on `seedKey` only, never `name` or DB `id` (architecture §8).
 *   - On update, touches ONLY the nutrition/density fields
 *     (caloriesPerRef/proteinPerRef/carbsPerRef/fatPerRef/fiberPerRef/
 *     sugarPerRef/sodiumMgPerRef/densityGPerMl) — never `name`, `source`,
 *     or `overridden` (Dev Notes: "never name (user may have renamed)").
 * ===========================================================================
 */
describe("data/seed/seed.ts — seed()", () => {
  let db: MigratedDrizzleDb;

  beforeEach(() => {
    ({ db } = createMigratedDrizzleDb());
  });

  async function allIngredients() {
    return db.select().from(ingredient);
  }

  async function bySeedKey(seedKey: string) {
    const [row] = await db.select().from(ingredient).where(eq(ingredient.seedKey, seedKey));
    return row ?? null;
  }

  describe("fresh empty database (AC-1)", () => {
    it("inserts every row with source='SEEDED', overridden=false, and the given seedKey", async () => {
      await seed(db, SAMPLE_SEED_ROWS);

      const rows = await allIngredients();
      expect(rows).toHaveLength(SAMPLE_SEED_ROWS.length);

      for (const fixture of SAMPLE_SEED_ROWS) {
        const row = await bySeedKey(fixture.seedKey);
        expect(row, `expected a row for seedKey ${fixture.seedKey}`).not.toBeNull();
        expect(row!.source).toBe("SEEDED");
        expect(row!.overridden).toBe(false);
        expect(row!.name).toBe(fixture.name);
        expect(row!.unitClass).toBe(fixture.unitClass);
        expect(row!.caloriesPerRef).toBe(fixture.caloriesPerRef);
        expect(row!.proteinPerRef).toBe(fixture.proteinPerRef);
        expect(row!.carbsPerRef).toBe(fixture.carbsPerRef);
        expect(row!.fatPerRef).toBe(fixture.fatPerRef);
      }
    });
  });

  describe("re-running with identical rows (AC-2, FR-28)", () => {
    it("leaves the ingredient count unchanged and creates no duplicate rows", async () => {
      await seed(db, SAMPLE_SEED_ROWS);
      const idsAfterFirstRun = (await allIngredients()).map((r) => r.id).sort();

      await seed(db, SAMPLE_SEED_ROWS);
      const rowsAfterSecondRun = await allIngredients();

      expect(rowsAfterSecondRun).toHaveLength(SAMPLE_SEED_ROWS.length);
      expect(rowsAfterSecondRun.map((r) => r.id).sort()).toEqual(idsAfterFirstRun);
    });
  });

  describe("seed corrections flow through for non-overridden rows (AC-4)", () => {
    it("updates nutrition fields when the seed re-runs with corrected values for an existing, non-overridden seedKey", async () => {
      await seed(db, SAMPLE_SEED_ROWS);

      const correctedRows = SAMPLE_SEED_ROWS.map((row) =>
        row.seedKey === "test:flour" ? { ...row, caloriesPerRef: 400, proteinPerRef: 11 } : row,
      );
      await seed(db, correctedRows);

      const flour = await bySeedKey("test:flour");
      expect(flour!.caloriesPerRef).toBe(400);
      expect(flour!.proteinPerRef).toBe(11);
    });

    it("never touches `name` on update, even for a non-overridden row (the user may have renamed it without editing nutrition — overridden only tracks nutrition edits per FR-3)", async () => {
      await seed(db, SAMPLE_SEED_ROWS);

      await db.update(ingredient).set({ name: "My Custom Onion Name" }).where(eq(ingredient.seedKey, "test:onion"));

      const renamedUpstream = SAMPLE_SEED_ROWS.map((row) =>
        row.seedKey === "test:onion" ? { ...row, name: "Onion X", caloriesPerRef: 50 } : row,
      );
      await seed(db, renamedUpstream);

      const onion = await bySeedKey("test:onion");
      expect(onion!.name).toBe("My Custom Onion Name");
      expect(onion!.caloriesPerRef).toBe(50);
      expect(onion!.overridden).toBe(false);
    });
  });

  describe("override preservation (AC-3, FR-28, FR-3)", () => {
    it("preserves the user's overridden values untouched, while a sibling non-overridden row still updates", async () => {
      await seed(db, SAMPLE_SEED_ROWS);

      // Simulate the user overriding the onion's nutrition (FR-3): flips
      // `overridden` and edits a nutrition field directly, bypassing seed.
      await db
        .update(ingredient)
        .set({ overridden: true, caloriesPerRef: 999, carbsPerRef: 55 })
        .where(eq(ingredient.seedKey, "test:onion"));

      const upstreamCorrection = SAMPLE_SEED_ROWS.map((row) => {
        if (row.seedKey === "test:onion") return { ...row, caloriesPerRef: 45, carbsPerRef: 10.5 };
        if (row.seedKey === "test:flour") return { ...row, caloriesPerRef: 400 };
        return row;
      });
      await seed(db, upstreamCorrection);

      const onion = await bySeedKey("test:onion");
      expect(onion!.overridden).toBe(true);
      expect(onion!.caloriesPerRef).toBe(999);
      expect(onion!.carbsPerRef).toBe(55);
      expect(onion!.source).toBe("SEEDED");

      const flour = await bySeedKey("test:flour");
      expect(flour!.overridden).toBe(false);
      expect(flour!.caloriesPerRef).toBe(400);
    });
  });

  describe("custom (non-seeded) rows are never touched", () => {
    it("leaves a CUSTOM ingredient (seedKey=null) completely unchanged by an unrelated seed run", async () => {
      const { sqlite } = createMigratedDrizzleDb();
      const customId = insertRawIngredient(sqlite, {
        seedKey: null,
        source: "CUSTOM",
        name: "My Homemade Sauce",
        caloriesPerRef: 123,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      const before = sqlite.prepare(`SELECT * FROM ingredient WHERE id = ?`).get(customId);

      const rawDb = drizzle(sqlite, { schema });
      await seed(rawDb, SAMPLE_SEED_ROWS);

      const after = sqlite.prepare(`SELECT * FROM ingredient WHERE id = ?`).get(customId);
      expect(after).toEqual(before);
    });
  });

  describe("transactionality (AC-1: 'inside a single transaction')", () => {
    it("rolls back the entire batch when one row is malformed — no partial insert", async () => {
      const malformedRow = {
        ...SAMPLE_SEED_ROWS[SAMPLE_SEED_ROWS.length - 1],
        seedKey: "test:malformed",
        caloriesPerRef: null,
      } as unknown as SeedRow;
      const rowsWithOneBad = [...SAMPLE_SEED_ROWS, malformedRow];

      await expect(seed(db, rowsWithOneBad)).rejects.toBeTruthy();

      const rows = await allIngredients();
      expect(rows, "a failed seed() call must not commit any of the valid rows either").toHaveLength(0);
    });
  });

  describe("real data/seed/seed-data.json (S-204 asset, Risk #6 bounded-time)", () => {
    it(`seeds all ${(realSeedData as SeedRow[]).length} rows and completes well within the bounded seed-time budget`, async () => {
      const rows = realSeedData as SeedRow[];
      expect(rows.length).toBeGreaterThan(300);

      const start = Date.now();
      await seed(db, rows);
      const durationMs = Date.now() - start;

      const count = await allIngredients();
      expect(count).toHaveLength(rows.length);

      // architecture.md §9 Risk #6 targets "<1s" for ~300 upserts against
      // the 10s NFR-1 boot budget; this bound is deliberately generous
      // (guards against an accidental O(n²) or per-row-transaction
      // regression, not micro-timing noise on a slow CI runner).
      expect(durationMs, `seed of ${rows.length} rows took ${durationMs}ms`).toBeLessThan(5000);
    });

    it("re-running the real seed file is idempotent (no duplicates)", async () => {
      const rows = realSeedData as SeedRow[];
      await seed(db, rows);
      await seed(db, rows);

      const all = await allIngredients();
      expect(all).toHaveLength(rows.length);
    });
  });
});
