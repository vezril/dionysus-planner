import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * openspec: observability-logging — the wiring, not the logger itself:
 * a real route emits one http.request line, and an unreachable inventory
 * service is reported at error from the outbound choke point.
 */
describe("logging wiring", () => {
  let tmpDir: string;
  let dbPath: string;
  let out: string[];
  let err: string[];
  const originalDbPath = process.env.DB_PATH;
  const originalServiceUrl = process.env.DIONYSUS_SERVICE_URL;
  const originalLevel = process.env.DIONYSUS_LOG_LEVEL;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-logging-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    process.env.DIONYSUS_LOG_LEVEL = "debug";
    vi.resetModules();
    out = [];
    err = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      out.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      err.push(String(chunk));
      return true;
    });
    const sqlite = new Database(dbPath);
    runMigrations(sqlite);
    sqlite.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (originalServiceUrl === undefined) delete process.env.DIONYSUS_SERVICE_URL;
    else process.env.DIONYSUS_SERVICE_URL = originalServiceUrl;
    if (originalLevel === undefined) delete process.env.DIONYSUS_LOG_LEVEL;
    else process.env.DIONYSUS_LOG_LEVEL = originalLevel;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("a route handler emits exactly one http.request line with method, path and status", async () => {
    const { GET } = await import("@/app/api/ingredients/route");
    const response = await GET(new Request("http://planner.test/api/ingredients?q=test"));
    expect(response.status).toBe(200);

    const requestLines = out
      .map((line) => JSON.parse(line))
      .filter((entry) => entry.event === "http.request");
    expect(requestLines).toHaveLength(1);
    expect(requestLines[0]).toMatchObject({
      level: "info",
      method: "GET",
      path: "/api/ingredients",
      status: 200,
    });
    expect(typeof requestLines[0].durationMs).toBe("number");
  });

  it("an unreachable inventory service is reported once, at error, from the outbound choke point", async () => {
    // A port nothing listens on: fetch rejects, so `service.unreachable`.
    process.env.DIONYSUS_SERVICE_URL = "http://127.0.0.1:9";
    const { listBatches } = await import("@/services/dionysusService");
    await expect(listBatches("http://127.0.0.1:9")).rejects.toThrow();

    const failures = err
      .map((line) => JSON.parse(line))
      .filter((entry) => entry.event === "service.unreachable");
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ level: "error", method: "GET" });
    expect(typeof failures[0].error).toBe("string");
  });

  it("a 4xx response downgrades the request line to warn on stderr", async () => {
    const { GET } = await import("@/app/api/category-defaults/route");
    // No `categories` param → the route's own 400.
    const response = await GET(new Request("http://planner.test/api/category-defaults"));
    expect(response.status).toBeGreaterThanOrEqual(400);

    const warnings = err
      .map((line) => JSON.parse(line))
      .filter((entry) => entry.event === "http.request");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].level).toBe("warn");
  });
});
