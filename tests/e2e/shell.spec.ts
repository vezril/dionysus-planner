import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * S-105 App shell, navigation & error boundaries — acceptance criteria
 * coverage (docs/stories/S-105-app-shell.md).
 *
 * Fixed contract these tests require of the implementation (see hand-off
 * notes for the full rationale):
 *   - `<nav aria-label="Main">` landmark present on every shell page,
 *     containing one link per primary section, accessible name === the
 *     section's h1 text ("What Can I Cook" | "Pantry" | "Recipes" |
 *     "Ingredients"). A mobile toggle button named "Menu" is OPTIONAL —
 *     if present, it must reveal the same links; if absent, the links
 *     must already be visible (stacked nav is an equally valid NFR-8
 *     design per the story's Dev Notes).
 *   - Each primary page has exactly one `<h1>` with the section's exact
 *     name.
 *   - Each primary page renders a `data-testid="empty-state"` container
 *     with at least one CTA (link or button) inside it.
 *   - `/pantry`'s empty-state CTA copy is exactly "Add your first pantry
 *     item" (FR-29's literal example, echoed in the story's Dev Notes).
 *
 * AC4 (error.tsx boundary) is verified manually in dev per the story's
 * own task list ("a test route that throws... remove the test route
 * after") and is not asserted here. The not-found.tsx half of AC4 is
 * deferred to S-403 (recipe detail route doesn't exist yet) — see the
 * `test.fixme` placeholder below, which documents the deferral without
 * blocking this story's suite.
 */

const SECTIONS = [
  { path: "/what-can-i-cook", heading: "What Can I Cook" },
  { path: "/pantry", heading: "Pantry" },
  { path: "/recipes", heading: "Recipes" },
  { path: "/ingredients", heading: "Ingredients" },
] as const;

/**
 * Returns the primary nav landmark, revealing its links first if the
 * implementer gated them behind a mobile toggle button. Works whether
 * the nav is a permanently visible stacked list (desktop, or a mobile
 * design that doesn't use a sheet) or a toggle-revealed sheet/drawer.
 */
async function openNav(page: Page): Promise<Locator> {
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav).toBeAttached();

  const toggle = page.getByRole("button", { name: "Menu" });
  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click();
  }
  return nav;
}

test.describe("S-105 app shell", () => {
  test.beforeEach(({}, testInfo) => {
    // Functional ACs are checked once on chromium; the browser/viewport
    // matrix itself is already exercised by smoke.spec.ts.
    test.skip(
      testInfo.project.name !== "chromium",
      "shell functional ACs verified once on chromium"
    );
  });

  test("AC1: root / redirects to /what-can-i-cook", async ({ page }) => {
    const response = await page.goto("/");
    await expect(page).toHaveURL(/\/what-can-i-cook$/);
    expect(response?.ok()).toBe(true);
    await expect(
      page.getByRole("heading", { level: 1, name: "What Can I Cook" })
    ).toBeVisible();
  });

  // S-301 supersedes the empty-state contract for /ingredients: the
  // catalog is seeded (351 rows, S-204) at boot via instrumentation.ts, so
  // this route is NEVER empty on a fresh install. Its detailed, non-empty
  // catalog assertions live in tests/e2e/ingredients.spec.ts; this loop
  // keeps the generic "still-empty" sections only.
  const EMPTY_STATE_SECTIONS = SECTIONS.filter(({ path }) => path !== "/ingredients");

  for (const { path, heading } of EMPTY_STATE_SECTIONS) {
    test(`AC2: ${path} renders its heading and a defined empty state, not an error`, async ({
      page,
    }) => {
      const response = await page.goto(path);
      expect(response?.ok()).toBe(true);

      await expect(
        page.getByRole("heading", { level: 1, name: heading, exact: true })
      ).toBeVisible();

      const emptyState = page.getByTestId("empty-state");
      await expect(emptyState).toBeVisible();

      const cta = emptyState
        .getByRole("link")
        .or(emptyState.getByRole("button"));
      await expect(cta.first()).toBeVisible();
    });
  }

  test("AC2: /ingredients renders its heading (S-301 supersedes the empty-state contract here — the seeded catalog means this route is never empty on a fresh install; see tests/e2e/ingredients.spec.ts for the real catalog assertions)", async ({
    page,
  }) => {
    const response = await page.goto("/ingredients");
    expect(response?.ok()).toBe(true);

    await expect(
      page.getByRole("heading", { level: 1, name: "Ingredients", exact: true })
    ).toBeVisible();
  });

  test("AC2: /pantry empty-state CTA matches FR-29's example copy", async ({
    page,
  }) => {
    await page.goto("/pantry");
    const emptyState = page.getByTestId("empty-state");
    const cta = emptyState
      .getByRole("link", { name: "Add your first pantry item" })
      .or(emptyState.getByRole("button", { name: "Add your first pantry item" }));
    await expect(cta).toBeVisible();
  });

  test("AC2: persistent nav reaches all four primary sections", async ({
    page,
  }) => {
    await page.goto("/what-can-i-cook");

    for (const { path, heading } of SECTIONS) {
      const nav = await openNav(page);
      const link = nav.getByRole("link", { name: heading, exact: true });
      await expect(link).toBeVisible();

      await link.click();

      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(
        page.getByRole("heading", { level: 1, name: heading, exact: true })
      ).toBeVisible();
    }
  });

  // Deferred: /recipes/[id] doesn't exist until S-403. Kept as a fixme so
  // the not-found.tsx boundary isn't silently forgotten, per S-105's own
  // task list. Do NOT make this pass by hand-wiring a fake detail route —
  // it should start passing only once S-403 builds the real one.
  test.fixme(
    "AC4: /recipes/999999 renders not-found.tsx (formal coverage lands with S-403)",
    async ({ page }) => {
      await page.goto("/recipes/999999");
      await expect(page.getByText(/not found/i)).toBeVisible();
    }
  );
});

test.describe("S-105 app shell at 375px (NFR-8)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-375",
      "375px assertions run only in the mobile-375 project"
    );
  });

  for (const { path, heading } of SECTIONS) {
    test(`AC3: ${path} has no horizontal scroll at 375px`, async ({ page }) => {
      const response = await page.goto(path);
      // Guard against a false-positive pass on Next's default 404 page
      // (which happens to have no overflow) — the page under test must
      // actually be the real route, not a not-found fallback.
      expect(response?.ok()).toBe(true);
      await expect(
        page.getByRole("heading", { level: 1, name: heading, exact: true })
      ).toBeVisible();

      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth
      );
      expect(scrollWidth).toBeLessThanOrEqual(375);
    });
  }

  test("AC3: nav controls are tappable at 375px", async ({ page }) => {
    await page.goto("/what-can-i-cook");
    const nav = await openNav(page);

    for (const { heading } of SECTIONS) {
      const link = nav.getByRole("link", { name: heading, exact: true });
      await expect(link).toBeVisible();

      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(0);
      expect(box!.height).toBeGreaterThanOrEqual(24);
    }
  });
});
