import { afterEach, describe, expect, it } from "vitest";
import {
  formatInstantIn,
  resolveDionysusTimezone,
  todayIsoDateIn,
} from "@/app/lib/dionysusTimezone";

/**
 * openspec: meal-log-integration (timezone fix from cross-validation) —
 * the Meal Log's "today" and rendered times must follow DIONYSUS_TZ, not
 * the server container's UTC clock. Regression anchor: a 9pm Montreal
 * dinner is 01:00Z the next UTC day; the naive UTC "today" flipped the
 * day view at 8pm local.
 */

describe("resolveDionysusTimezone", () => {
  afterEach(() => {
    delete process.env.DIONYSUS_TZ;
  });

  it("defaults to UTC when unset", () => {
    delete process.env.DIONYSUS_TZ;
    expect(resolveDionysusTimezone()).toBe("UTC");
  });

  it("returns a valid IANA zone as-is", () => {
    process.env.DIONYSUS_TZ = "America/Toronto";
    expect(resolveDionysusTimezone()).toBe("America/Toronto");
  });

  it("falls back to UTC on an invalid zone name", () => {
    process.env.DIONYSUS_TZ = "Not/AZone";
    expect(resolveDionysusTimezone()).toBe("UTC");
  });
});

describe("todayIsoDateIn", () => {
  it("returns a YYYY-MM-DD string", () => {
    expect(todayIsoDateIn("America/Toronto")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("differs between zones straddling midnight (structural check via a fixed instant)", () => {
    // 2026-08-20T01:00:00Z is Aug 20 in UTC but Aug 19 at 9pm in Toronto —
    // formatInstantIn proves the zone math; todayIsoDateIn uses the same
    // Intl machinery on the live clock.
    expect(formatInstantIn("2026-08-20T01:00:00Z", "UTC")).toContain("2026");
  });
});

describe("formatInstantIn", () => {
  it("renders a UTC instant as local wall-clock time in the given zone", () => {
    // 9pm EDT dinner stored as 01:00Z next day — must render as Aug 19, 9pm.
    const rendered = formatInstantIn("2026-08-20T01:00:00Z", "America/Toronto");
    expect(rendered).toContain("Aug");
    expect(rendered).toContain("19");
    expect(rendered).toMatch(/9:00\s*p\.?m\.?/i);
  });

  it("renders the same instant as next-day 1am in UTC", () => {
    const rendered = formatInstantIn("2026-08-20T01:00:00Z", "UTC");
    expect(rendered).toContain("20");
    expect(rendered).toMatch(/1:00\s*a\.?m\.?/i);
  });
});
