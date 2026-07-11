import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit is a dev-only tool (architecture.md §3 ADR-003) used to
 * generate SQL migrations from data/schema.ts into /drizzle, which are
 * then applied at runtime by data/migrate.ts's programmatic migrator.
 */
export default defineConfig({
  schema: "./data/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
});
