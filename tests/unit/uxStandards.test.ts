import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Drift gate: dionysus-planner is the REFERENCE IMPLEMENTATION for the
 * constellation's UX standards (codex/docs/ux-standards.md §1). The
 * shared-base tokens and the neon focus ring are pinned here verbatim —
 * a retheme that breaks the family standard fails this suite instead of
 * silently forking the system. Change the standard first, then this.
 */
const css = readFileSync("app/globals.css", "utf8");

const SHARED_BASE: Record<string, string> = {
  "--background": "oklch(0.13 0.02 280)",
  "--foreground": "oklch(0.93 0.01 280)",
  "--card": "oklch(0.17 0.03 280)",
  "--popover": "oklch(0.17 0.03 280)",
  "--secondary": "oklch(0.22 0.04 280)",
  "--muted": "oklch(0.2 0.03 280)",
  "--muted-foreground": "oklch(0.65 0.03 280)",
  "--border": "oklch(0.28 0.04 280)",
  "--input": "oklch(0.28 0.04 280)",
  "--destructive": "oklch(0.62 0.24 25)",
  "--radius": "0.15rem",
  // dionysus's god accent: family cyan + magenta (the flagship dual).
  "--primary": "oklch(0.85 0.2 195)",
  "--primary-foreground": "oklch(0.15 0.02 280)",
  "--accent": "oklch(0.7 0.28 340)",
  "--ring": "oklch(0.85 0.2 195)",
  // status colors are shared across every service, never accented.
  "--status-cookable": "oklch(0.8 0.25 145)",
  "--status-near": "oklch(0.8 0.16 85)",
  // chart-1 stays family cyan in every service.
  "--chart-1": "oklch(0.85 0.2 195)",
};

function tokenValue(token: string): string | null {
  const match = css.match(new RegExp(`^\\s*${token.replace(/[-[\]/{}()*+?.\\^$|]/g, "\\$&")}:\\s*([^;]+);`, "m"));
  return match ? match[1].trim() : null;
}

describe("UX standards drift gate (codex/docs/ux-standards.md)", () => {
  for (const [token, value] of Object.entries(SHARED_BASE)) {
    it(`${token} matches the shared base`, () => {
      expect(tokenValue(token)).toBe(value);
    });
  }

  it("keeps the neon focus ring verbatim", () => {
    expect(css).toContain("outline: 2px solid var(--ring)");
    expect(css).toContain("color-mix(in oklab, var(--ring) 55%, transparent)");
  });

  it("stays dark-only — no light-mode media query", () => {
    expect(css).not.toContain("prefers-color-scheme: light");
  });
});
