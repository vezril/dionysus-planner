/**
 * openspec: observability-logging — the planner's structured logger.
 *
 * One JSON object per line on stdout (stderr for warn/error), which is
 * what `kubectl logs` and `docker logs` want: greppable, parseable, no
 * dependency, no transport. Shape is always
 * `{ts, level, event, ...fields}` — `event` is a stable dotted key you
 * can grep for ("http.request", "service.call", "cook.committed"), the
 * rest is context.
 *
 * Level comes from DIONYSUS_LOG_LEVEL (error|warn|info|debug), default
 * info. Under NODE_ENV=test it defaults to SILENT so suites stay
 * readable — set DIONYSUS_LOG_LEVEL explicitly to see lines in a test.
 *
 * WHAT NOT TO LOG: request/response bodies wholesale. This app has no
 * auth and lives on a private network, but logs outlive requests and
 * get copied around — log ids, counts, statuses, and durations, not
 * payloads.
 */

export type LogLevel = "error" | "warn" | "info" | "debug";

const RANK: Record<LogLevel | "silent", number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

/** Read at CALL time, not module load — tests and the runtime both
 * change the env after import (same posture as dionysusServiceConfig). */
function threshold(): number {
  const configured = process.env.DIONYSUS_LOG_LEVEL?.toLowerCase();
  if (configured && configured in RANK) return RANK[configured as LogLevel | "silent"];
  if (process.env.NODE_ENV === "test") return RANK.silent;
  return RANK.info;
}

export type LogFields = Record<string, string | number | boolean | null | undefined>;

function emit(level: LogLevel, event: string, fields?: LogFields): void {
  if (RANK[level] > threshold()) return;
  const line: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    event,
  };
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (value !== undefined) line[key] = value;
  }
  const serialized = JSON.stringify(line);
  if (level === "error" || level === "warn") process.stderr.write(`${serialized}\n`);
  else process.stdout.write(`${serialized}\n`);
}

export const log = {
  error: (event: string, fields?: LogFields) => emit("error", event, fields),
  warn: (event: string, fields?: LogFields) => emit("warn", event, fields),
  info: (event: string, fields?: LogFields) => emit("info", event, fields),
  debug: (event: string, fields?: LogFields) => emit("debug", event, fields),
};

/** Message of an unknown thrown value, never the stack (noise in logs
 * that already carry the event and its context). */
export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Wraps an API route handler body: one line per request carrying
 * method, path, status and duration; escaping errors log at error and
 * rethrow unchanged. (Handlers used to need the
 * `export async function GET` shape for the drift gate to see them;
 * openspec: drift-gate-fail-closed removed that coupling — the gate now
 * imports the module and checks the export, so any shape works.)
 */
export async function withRouteLog(
  request: Request | undefined,
  handler: () => Promise<Response>,
): Promise<Response> {
  const started = Date.now();
  const method = request?.method ?? "GET";
  const path = (() => {
    if (!request) return "(unknown)";
    try {
      return new URL(request.url).pathname;
    } catch {
      return request.url;
    }
  })();

  try {
    const response = await handler();
    const fields: LogFields = {
      method,
      path,
      status: response.status,
      durationMs: Date.now() - started,
    };
    if (response.status >= 500) log.error("http.request", fields);
    else if (response.status >= 400) log.warn("http.request", fields);
    else log.info("http.request", fields);
    return response;
  } catch (cause) {
    log.error("http.request", {
      method,
      path,
      status: 500,
      durationMs: Date.now() - started,
      error: errorMessage(cause),
    });
    throw cause;
  }
}
