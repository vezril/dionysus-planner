/**
 * openspec: api-docs — generates public/insomnia-collection.json from
 * lib/openapi.ts (the single source of truth). Run after any API change:
 *   node scripts/generate-insomnia.mjs
 */
import { writeFileSync } from "node:fs";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const { openapiSpec } = await import("../lib/openapi.ts").catch(async () => {
  // ts import needs a loader in plain node — fall back to transpile-free
  // extraction via tsx if available, else instruct.
  throw new Error("Run with: npx tsx scripts/generate-insomnia.mjs");
});

const now = 1735689600000; // stable timestamps keep the file diff-clean
const workspaceId = "wrk_dionysus";
const envId = "env_dionysus";
const resources = [
  {
    _id: workspaceId,
    _type: "workspace",
    name: "Dionysus Planner API",
    description: openapiSpec.info.description,
    scope: "collection",
    created: now,
    modified: now,
  },
  {
    _id: envId,
    _type: "environment",
    parentId: workspaceId,
    name: "Base Environment",
    data: { base_url: "http://dionysus.lan:61642", tailnet_url: "http://mimir.tail783b49.ts.net:61642" },
    created: now,
    modified: now,
  },
];

let index = 0;
const folders = new Map();
for (const [path, methods] of Object.entries(openapiSpec.paths)) {
  for (const [method, op] of Object.entries(methods)) {
    const tag = op.tags?.[0] ?? "misc";
    if (!folders.has(tag)) {
      const folderId = `fld_${tag}`;
      folders.set(tag, folderId);
      resources.push({ _id: folderId, _type: "request_group", parentId: workspaceId, name: tag, created: now, modified: now });
    }
    index += 1;
    const parameters = (op.parameters ?? []).filter((parameter) => parameter.in === "query");
    const body =
      op.requestBody?.content?.["application/json"]?.schema?.properties
        ? {
            mimeType: "application/json",
            text: JSON.stringify(
              Object.fromEntries(
                Object.entries(op.requestBody.content["application/json"].schema.properties).map(([key, value]) => [
                  key,
                  value.example ?? (value.type === "integer" || value.type === "number" ? 0 : value.type === "boolean" ? false : value.type === "array" ? [] : ""),
                ]),
              ),
              null,
              2,
            ),
          }
        : undefined;
    resources.push({
      _id: `req_${String(index).padStart(3, "0")}`,
      _type: "request",
      parentId: folders.get(tag),
      name: `${method.toUpperCase()} ${path}`,
      description: [op.summary, op.description].filter(Boolean).join("\n\n"),
      method: method.toUpperCase(),
      url: `{{ _.base_url }}${path}`,
      parameters: parameters.map((parameter) => ({
        name: parameter.name,
        value: String(parameter.schema?.example ?? ""),
        disabled: !parameter.required,
      })),
      ...(body ? { body, headers: [{ name: "Content-Type", value: "application/json" }] } : {}),
      created: now,
      modified: now,
    });
  }
}

const collection = {
  _type: "export",
  __export_format: 4,
  __export_date: new Date(now).toISOString(),
  __export_source: "dionysus-planner/scripts/generate-insomnia.mjs",
  resources,
};
writeFileSync(new URL("../public/insomnia-collection.json", import.meta.url), JSON.stringify(collection, null, 2) + "\n");
console.log(`wrote public/insomnia-collection.json (${resources.length} resources)`);
