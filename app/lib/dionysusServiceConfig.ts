/**
 * App-layer `DIONYSUS_SERVICE_URL` resolution (openspec: meal-log-integration
 * design.md Decision 2), mirroring `app/lib/threshold.ts`'s pattern exactly.
 * `services/dionysusService.ts` never reads `process.env` itself — this is
 * the one place that does, and callers (Server Actions) pass the resolved
 * base URL down explicitly. Reads at CALL time, not module-load time.
 *
 * Unlike the near-match threshold, there is no sane default: a Meal Log
 * action with no configured service has nothing to call.
 */

export class DionysusServiceUrlMissingError extends Error {
  constructor() {
    super("DIONYSUS_SERVICE_URL is not set — the Meals section has no dionysus-service to call.");
    this.name = "DionysusServiceUrlMissingError";
  }
}

export function resolveDionysusServiceUrl(): string {
  const raw = process.env.DIONYSUS_SERVICE_URL;
  if (!raw || raw.trim() === "") {
    throw new DionysusServiceUrlMissingError();
  }
  return raw.replace(/\/+$/, "");
}
