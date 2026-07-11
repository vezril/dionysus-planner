import { expect, test } from "@playwright/test";

/**
 * Tooling smoke spec (S-101): proves Playwright is wired to a locally
 * built `next start` instance across the chromium/firefox/webkit +
 * 375px-mobile project matrix (architecture.md §3 ADR-007, NFR-8,
 * NFR-10). Real UJ-1..UJ-5 e2e coverage lands with later stories.
 *
 * S-105 turns `/` into a redirect (architecture §5 — root `page.tsx`
 * redirects to `/what-can-i-cook`), which supersedes S-101's original
 * "root page renders a placeholder heading/button" assertion. This spec
 * is intentionally kept to a matrix-wide boot sanity check only; the
 * detailed S-105 acceptance criteria (nav, empty states, 375px layout)
 * live in tests/e2e/shell.spec.ts, run once on chromium.
 */
test("app boots and renders a primary heading across the browser matrix", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
