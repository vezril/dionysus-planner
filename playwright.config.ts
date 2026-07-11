import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright e2e config (architecture.md §3 ADR-007, NFR-8, NFR-10):
 * evergreen chromium/firefox/webkit matrix plus a 375px mobile-viewport
 * project. Drives a locally-built `next start` instance — no Docker
 * dependency. `webServer` builds once and reuses the server across the
 * whole run.
 */
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
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      // NFR-8: usable at 375px viewport (phone-in-the-kitchen).
      name: "mobile-375",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 667 },
      },
    },
  ],
  webServer: {
    command: "pnpm start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
