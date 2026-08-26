import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openapiSpec } from "@/lib/openapi";

/**
 * openspec: api-docs — drift gate: every app/api route handler must be
 * documented in lib/openapi.ts, method by method, and the generated
 * Insomnia collection must cover every documented operation. A new
 * endpoint that skips the docs (or a stale collection) fails here.
 */
function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

const specPaths = openapiSpec.paths as Record<string, Record<string, unknown>>;

describe("OpenAPI coverage drift gate", () => {
  const files = routeFiles("app/api");

  it("documents every route file's exported methods", () => {
    const missing: string[] = [];
    for (const file of files) {
      const apiPath = "/" + file.replace(/^app\//, "").replace(/\/route\.ts$/, "");
      const spec = specPaths[apiPath];
      if (!spec) {
        missing.push(apiPath);
        continue;
      }
      const source = readFileSync(file, "utf8");
      for (const method of ["GET", "POST", "PUT", "DELETE", "PATCH"]) {
        const exported = new RegExp(`export (async )?function ${method}\\b`).test(source);
        if (exported && !(method.toLowerCase() in spec)) missing.push(`${method} ${apiPath}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("documents no phantom paths", () => {
    const real = new Set(files.map((file) => "/" + file.replace(/^app\//, "").replace(/\/route\.ts$/, "")));
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
