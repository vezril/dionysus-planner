import { expect, test } from "@playwright/test";

/**
 * Tooling smoke spec (S-101): proves Playwright is wired to a locally
 * built `next start` instance across the chromium/firefox/webkit +
 * 375px-mobile project matrix (architecture.md §3 ADR-007, NFR-8,
 * NFR-10). Real UJ-1..UJ-5 e2e coverage lands with later stories.
 */
test("root page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dionysus Planner" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Get started" })).toBeVisible();
});
