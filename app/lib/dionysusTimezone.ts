/**
 * App-layer timezone resolution for the Meal Log section (same one-reader
 * pattern as `app/lib/threshold.ts` / `dionysusServiceConfig.ts`). The
 * server container runs in UTC, but "today" and displayed meal times must
 * follow the user's home timezone — otherwise the day view's date rolls
 * over at 8pm in Montreal and evening meals render as next-day 1 AM
 * (found in cross-validation review). Reads `DIONYSUS_TZ` (an IANA zone
 * like "America/Toronto") at CALL time; falls back to UTC when unset or
 * invalid. dionysus-service reads the same variable for its day-boundary
 * grouping — set both deployments to the same zone.
 */

export function resolveDionysusTimezone(): string {
  const raw = process.env.DIONYSUS_TZ;
  if (!raw || raw.trim() === "") {
    return "UTC";
  }
  try {
    // Throws RangeError on an unknown zone name.
    new Intl.DateTimeFormat("en-CA", { timeZone: raw });
    return raw;
  } catch {
    return "UTC";
  }
}

/** Today's calendar date (YYYY-MM-DD) in the given IANA timezone. */
export function todayIsoDateIn(timeZone: string): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Render an ISO instant as a local wall-clock string in the given zone. */
export function formatInstantIn(isoInstant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoInstant));
}
