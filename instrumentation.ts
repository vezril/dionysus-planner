/**
 * Next.js instrumentation hook (architecture.md §6 Flow A). Next.js only
 * recognizes this file at the PROJECT ROOT. `register()` runs once per
 * server process start, in dev (`next dev`) and production (standalone
 * `node server.js`) alike, applying migrations then seeding — both
 * idempotent, so dev-mode hot reload re-invoking `register()` is safe.
 *
 * The `NEXT_RUNTIME === 'nodejs'` guard plus the dynamic `import()`s
 * inside it keep every `/data/**` (drizzle-orm/better-sqlite3) reference
 * out of any Edge bundle — this file itself imports nothing from `/data`
 * at the top level. The `SeedRow` type import is erased at compile time
 * (`import type`), so it carries no runtime module reference either.
 */
import type { SeedRow } from "@/data/seed/seed";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const [{ createDb }, { bootstrap }, seedDataModule] = await Promise.all([
      import("@/data/db"),
      import("@/data/bootstrap"),
      import("@/data/seed/seed-data.json"),
    ]);

    const db = createDb();
    const rows = seedDataModule.default as unknown as SeedRow[];

    try {
      await bootstrap(db.$client, rows);
    } finally {
      db.$client.close();
    }
  }
}
