import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright e2e config (architecture.md §3 ADR-007, NFR-8, NFR-10):
 * evergreen chromium/firefox/webkit matrix plus a 375px mobile-viewport
 * project. Drives a locally-built `next start` instance — no Docker
 * dependency. `webServer` builds once and reuses the server across the
 * whole run.
 */
// Specs that boot their own isolated next-start server (see the
// isolated-chromium project note below).
const ISOLATED_SERVER_SPECS = ["**/journeys.spec.ts", "**/scale.spec.ts"];

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: ISOLATED_SERVER_SPECS,
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      testIgnore: ISOLATED_SERVER_SPECS,
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      testIgnore: ISOLATED_SERVER_SPECS,
    },
    {
      // NFR-8: usable at 375px viewport (phone-in-the-kitchen).
      name: "mobile-375",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 667 },
      },
      testIgnore: ISOLATED_SERVER_SPECS,
    },
    {
      // S-503's journeys + scale suites spawn their OWN next-start servers
      // (ports 3210/3220, throwaway DB_PATH). Running them concurrently with
      // the four shared-server projects saturates the machine (3 servers +
      // full browser matrix) and produces load-induced flakes, so this
      // project runs only after the main matrix completes.
      name: "isolated-chromium",
      use: { ...devices["Desktop Chrome"] },
      testMatch: ISOLATED_SERVER_SPECS,
      dependencies: ["chromium", "firefox", "webkit", "mobile-375"],
    },
  ],
  webServer: {
    command: "pnpm start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
