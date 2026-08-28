import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorMessage, log, withRouteLog } from "@/lib/logger";

/** openspec: observability-logging — level gating, JSON-line shape, and
 * the route wrapper's status/duration accounting. */
describe("logger", () => {
  let out: string[];
  let err: string[];
  const originalLevel = process.env.DIONYSUS_LOG_LEVEL;

  beforeEach(() => {
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalLevel === undefined) delete process.env.DIONYSUS_LOG_LEVEL;
    else process.env.DIONYSUS_LOG_LEVEL = originalLevel;
  });

  it("is silent under NODE_ENV=test unless a level is set explicitly", () => {
    delete process.env.DIONYSUS_LOG_LEVEL;
    log.error("should.not.appear");
    log.info("should.not.appear");
    expect(out).toEqual([]);
    expect(err).toEqual([]);
  });

  it("emits one JSON line per call with ts, level and event", () => {
    process.env.DIONYSUS_LOG_LEVEL = "info";
    log.info("cook.committed", { recipeId: 7, portions: 4 });
    expect(out).toHaveLength(1);
    expect(out[0].endsWith("\n")).toBe(true);
    const parsed = JSON.parse(out[0]);
    expect(parsed).toMatchObject({ level: "info", event: "cook.committed", recipeId: 7, portions: 4 });
    expect(typeof parsed.ts).toBe("string");
  });

  it("routes warn and error to stderr, info and debug to stdout", () => {
    process.env.DIONYSUS_LOG_LEVEL = "debug";
    log.error("a");
    log.warn("b");
    log.info("c");
    log.debug("d");
    expect(err.map((line) => JSON.parse(line).event)).toEqual(["a", "b"]);
    expect(out.map((line) => JSON.parse(line).event)).toEqual(["c", "d"]);
  });

  it("gates by level — quieter thresholds drop noisier lines", () => {
    process.env.DIONYSUS_LOG_LEVEL = "warn";
    log.error("kept");
    log.warn("kept");
    log.info("dropped");
    log.debug("dropped");
    expect(err).toHaveLength(2);
    expect(out).toHaveLength(0);
  });

  it("omits undefined fields rather than emitting nulls", () => {
    process.env.DIONYSUS_LOG_LEVEL = "info";
    log.info("partial", { present: 1, absent: undefined });
    const parsed = JSON.parse(out[0]);
    expect(parsed.present).toBe(1);
    expect("absent" in parsed).toBe(false);
  });

  it("errorMessage unwraps Errors and stringifies anything else", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("plain")).toBe("plain");
    expect(errorMessage(42)).toBe("42");
  });
});

describe("withRouteLog", () => {
  let out: string[];
  let err: string[];
  const originalLevel = process.env.DIONYSUS_LOG_LEVEL;

  beforeEach(() => {
    out = [];
    err = [];
    process.env.DIONYSUS_LOG_LEVEL = "info";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      out.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      err.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalLevel === undefined) delete process.env.DIONYSUS_LOG_LEVEL;
    else process.env.DIONYSUS_LOG_LEVEL = originalLevel;
  });

  it("logs method, path, status and duration for a success", async () => {
    const request = new Request("http://planner.test/api/mobile/pantry");
    const response = await withRouteLog(request, async () => Response.json({ ok: true }, { status: 200 }));
    expect(response.status).toBe(200);
    const parsed = JSON.parse(out[0]);
    expect(parsed).toMatchObject({
      event: "http.request",
      level: "info",
      method: "GET",
      path: "/api/mobile/pantry",
      status: 200,
    });
    expect(typeof parsed.durationMs).toBe("number");
  });

  it("a 4xx logs at warn, a 5xx at error — both on stderr", async () => {
    await withRouteLog(new Request("http://planner.test/api/x"), async () => new Response(null, { status: 404 }));
    await withRouteLog(new Request("http://planner.test/api/y"), async () => new Response(null, { status: 502 }));
    expect(err.map((line) => JSON.parse(line).level)).toEqual(["warn", "error"]);
  });

  it("an escaping error is logged as a 500 and rethrown unchanged", async () => {
    const boom = new Error("handler exploded");
    await expect(
      withRouteLog(new Request("http://planner.test/api/z"), async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    const parsed = JSON.parse(err[0]);
    expect(parsed).toMatchObject({ event: "http.request", level: "error", status: 500, error: "handler exploded" });
  });
});
