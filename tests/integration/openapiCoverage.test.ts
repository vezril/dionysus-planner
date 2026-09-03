import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { openapiSpec } from "@/lib/openapi";

/**
 * openspec: api-docs — drift gate: every app/api route handler must be
 * documented in lib/openapi.ts, method by method, and the generated
 * Insomnia collection must cover every documented operation.
 *
 * openspec: drift-gate-fail-closed — handlers are detected by IMPORTING
 * each route module and asking which method names it exports as
 * functions. The previous version grepped the source for
 * `export async function GET`, which failed OPEN: rewrite a handler as
 * `export const GET = wrap(...)` and the gate silently checked nothing
 * while CI stayed green. Declaration style is now irrelevant, and a
 * route file yielding NO detected handler fails the suite rather than
 * passing quietly.
 *
 * SCOPE LIMIT, deliberately: this proves an operation EXISTS and is
 * exported. It does NOT prove the spec describes it correctly — wrong
 * parameters, wrong status codes, and a drifted response schema all
 * pass. Existence drift, not shape drift.
 *
 * Lives in `integration` rather than `unit` because importing route
 * modules pulls the data layer, which the unit project excludes.
 */
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

function apiPathOf(file: string): string {
  return "/" + file.replace(/^app\//, "").replace(/\/route\.ts$/, "");
}

async function exportedMethods(file: string): Promise<string[]> {
  const handlers = (await import(pathToFileURL(resolve(file)).href)) as Record<string, unknown>;
  return HTTP_METHODS.filter((method) => typeof handlers[method] === "function");
}

const specPaths = openapiSpec.paths as Record<string, Record<string, unknown>>;

describe("OpenAPI coverage drift gate", () => {
  const files = routeFiles("app/api");

  it("finds route files at all", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  // The fail-CLOSED guard. Without it, a detection failure looks
  // identical to "nothing is undocumented".
  it("detects at least one handler in every route file", async () => {
    const silent: string[] = [];
    for (const file of files) {
      if ((await exportedMethods(file)).length === 0) silent.push(file);
    }
    expect(silent).toEqual([]);
  });

  it("documents every exported handler", async () => {
    const missing: string[] = [];
    for (const file of files) {
      const apiPath = apiPathOf(file);
      const spec = specPaths[apiPath];
      if (!spec) {
        missing.push(apiPath);
        continue;
      }
      for (const method of await exportedMethods(file)) {
        if (!(method.toLowerCase() in spec)) missing.push(`${method} ${apiPath}`);
      }
    }
    expect(missing).toEqual([]);
  });

  // The direction people forget: a route deleted but left in the docs is
  // worse than an undocumented one, because a client builds against
  // something that will 404.
  it("documents no phantom paths", () => {
    const real = new Set(files.map(apiPathOf));
    const phantom = Object.keys(specPaths).filter((path) => !real.has(path));
    expect(phantom).toEqual([]);
  });

  it("the Insomnia collection covers every documented operation", () => {
    const collection = JSON.parse(readFileSync("public/insomnia-collection.json", "utf8")) as {
      resources: Array<{ _type: string; name?: string }>;
    };
    const requestNames = new Set(
      collection.resources.filter((resource) => resource._type === "request").map((resource) => resource.name),
    );
    const missing: string[] = [];
    for (const [path, methods] of Object.entries(specPaths)) {
      for (const method of Object.keys(methods)) {
        const name = `${method.toUpperCase()} ${path}`;
        if (!requestNames.has(name)) missing.push(name);
      }
    }
    expect(missing).toEqual([]);
  });
});
