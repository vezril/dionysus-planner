import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootAlias = {
  "@": fileURLToPath(new URL(".", import.meta.url)),
};

/**
 * Two Vitest projects (architecture.md §3 ADR-007):
 *  - unit: /domain/** only — pure functions, no DB, no Next.js runtime.
 *  - integration: /data/** and /app/actions/** — real better-sqlite3
 *    against :memory:/temp files, real Drizzle migrations. Configured
 *    now; DB setup/fixtures land with S-201+.
 */
export default defineConfig({
  resolve: {
    alias: rootAlias,
  },
  test: {
    // Applies to both projects. `integration` has no specs yet (DB
    // schema lands in S-201), so `pnpm test:integration` intentionally
    // passes with zero tests until then.
    passWithNoTests: true,
    projects: [
      {
        resolve: { alias: rootAlias },
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        resolve: { alias: rootAlias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
        },
      },
    ],
  },
});
