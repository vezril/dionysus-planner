import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * S-503 test-only infrastructure: spins up a SEPARATE `next start`
 * process on its own port against its own throwaway `DB_PATH`, so
 * `tests/e2e/journeys.spec.ts` and `tests/e2e/scale.spec.ts` can assert
 * genuine first-run/fresh-DB behavior and a controlled scale dataset
 * without touching (or racing) the shared, persistent DB every other
 * e2e spec writes into via playwright.config.ts's single `webServer`
 * (see tests/e2e/shell.spec.ts's own comments on why that shared-DB
 * constraint means "/what-can-i-cook is empty" etc. can't be asserted
 * there).
 *
 * `instrumentation.ts` (architecture.md §6 Flow A) applies migrations
 * and runs the seed at server *boot*, reading `DB_PATH` at call time via
 * `data/db.ts#createDb()` — so pointing a freshly spawned server at a
 * brand-new, nonexistent file path yields a fully-migrated,
 * seed-only ("fresh install") database once `/api/health` reports
 * `{ status: "ok" }` (docs/architecture.md §6 Flow A Risk #6 /
 * `data/health.ts#isSeedComplete`).
 *
 * Deliberately spawns the existing `pnpm start` script (== `next start`)
 * rather than `node .next/standalone/server.js` — this repo's `.next`
 * build output already exists from the standard dev workflow, and
 * `next start` picks up `PORT`/`DB_PATH` env vars identically for this
 * test's purposes (ADR-007: e2e drives a built `next start`, no Docker
 * in this story).
 */

export interface IsolatedServerHandle {
  child: ChildProcessWithoutNullStreams;
  baseURL: string;
  dbPath: string;
  tmpDir: string;
  port: number;
}

function getOutputBuffer(child: ChildProcessWithoutNullStreams): { text: () => string } {
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  return { text: () => output };
}

async function waitForHealthy(
  baseURL: string,
  child: ChildProcessWithoutNullStreams,
  outputText: () => string,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  let lastError: unknown;

  while (Date.now() - start < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(
        `isolated server process exited early (code ${child.exitCode}) before becoming healthy.\n--- output ---\n${outputText()}`,
      );
    }
    try {
      const response = await fetch(`${baseURL}/api/health`);
      if (response.ok) {
        const body = (await response.json()) as { status?: string };
        if (body.status === "ok") return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(
    `isolated server at ${baseURL} did not report healthy within ${timeoutMs}ms (last error: ${String(lastError)}).\n--- output ---\n${outputText()}`,
  );
}

/** Creates a fresh temp directory + (not-yet-existing) sqlite file path for an isolated run. */
export function createTempDb(prefix = "dionysus-e2e-"): { tmpDir: string; dbPath: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), prefix));
  const dbPath = join(tmpDir, "dionysus.db");
  return { tmpDir, dbPath };
}

/**
 * Spawns `pnpm start -p <port>` with `DB_PATH` pointed at `dbPath` and
 * waits for `/api/health` to report ready. Reusable across a stop/
 * repopulate/restart cycle against the SAME `dbPath` (see
 * `tests/e2e/scale.spec.ts`).
 */
export async function startIsolatedServer(
  port: number,
  dbPath: string,
  options: { envOverrides?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<IsolatedServerHandle> {
  // Default `stdio` (all three streams piped) so `child` types as
  // `ChildProcessWithoutNullStreams` — stdin is simply never written to.
  const child = spawn("pnpm", ["start", "-p", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, DB_PATH: dbPath, ...options.envOverrides },
  });

  const output = getOutputBuffer(child);
  const baseURL = `http://127.0.0.1:${port}`;

  await waitForHealthy(baseURL, child, output.text, options.timeoutMs ?? 60_000);

  return { child, baseURL, dbPath, tmpDir: join(dbPath, ".."), port };
}

/** Kills the server process only — leaves the sqlite file on disk so it can be repopulated and the server restarted against it. */
export async function stopIsolatedServerProcess(handle: Pick<IsolatedServerHandle, "child">): Promise<void> {
  if (handle.child.exitCode !== null) return;

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      handle.child.kill("SIGKILL");
    }, 5_000);
    handle.child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    handle.child.kill("SIGTERM");
  });
}

/** Kills the process (if still running) and removes the whole temp directory. */
export async function stopIsolatedServer(handle: IsolatedServerHandle): Promise<void> {
  await stopIsolatedServerProcess(handle);
  rmSync(handle.tmpDir, { recursive: true, force: true });
}
