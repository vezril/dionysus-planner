import Database from "better-sqlite3";
import { generateScaleFixture } from "./scaleFixture";

/**
 * CLI wrapper around `generateScaleFixture` (docs/stories/S-503-e2e-
 * journeys-scale.md). Exists ONLY so `tests/e2e/scale.spec.ts` — which
 * lives outside `tests/integration/**` and therefore may not import
 * `better-sqlite3` directly (architecture.md §5 boundary rule,
 * eslint.config.mjs's `no-restricted-imports` scoping that exemption to
 * `data/**`/`tests/integration/**` only) — can still populate an
 * already-migrated-and-seeded sqlite file with the NFR-3 scale dataset,
 * by spawning THIS script (which lives inside the exempted
 * `tests/integration/support/**` tier) as a child process instead of
 * importing the driver itself.
 *
 * Usage: `tsx tests/integration/support/populateScaleFixtureCli.ts <dbPath>`
 * Prints the resulting `HandVerifiedFixture` as one line of JSON to
 * stdout and exits 0, or prints an error to stderr and exits 1.
 */
function main(): void {
  const dbPath = process.argv[2];
  if (!dbPath) {
    console.error("usage: populateScaleFixtureCli.ts <dbPath>");
    process.exitCode = 1;
    return;
  }

  const sqlite = new Database(dbPath);
  try {
    const fixture = generateScaleFixture(sqlite);
    process.stdout.write(`${JSON.stringify(fixture)}\n`);
  } finally {
    sqlite.close();
  }
}

main();
