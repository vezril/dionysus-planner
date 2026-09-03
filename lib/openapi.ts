/**
 * openspec: api-docs — the planner's OpenAPI 3.1 description, the single
 * source of truth for /api-docs (web viewer), /api/openapi (raw JSON),
 * and the generated Insomnia collection
 * (scripts/generate-insomnia.mjs → public/insomnia-collection.json).
 *
 * DRIFT GATE: tests/integration/openapiCoverage.test.ts asserts every
 * app/api/**{@link}/route.ts has a path entry here — a new endpoint that
 * skips the docs fails CI. Add the path (and regenerate the Insomnia
 * collection) alongside any API change.
 */

const nutritionPer100 = {
  type: "object",
  description: "Per-100 g/mL (or per-1 count) nutrition values.",
  properties: {
    caloriesPerRef: { type: "number" },
    proteinPerRef: { type: "number" },
    carbsPerRef: { type: "number" },
    fatPerRef: { type: "number" },
  },
} as const;

export const openapiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Dionysus Planner API",
    version: "2.42.0",
    description:
      "The planner's HTTP surface: catalog reads, the mobile companion API, backup export, and category defaults. No authentication — the server is reachable only on the private LAN (dionysus.lan) and the Tailscale tailnet (mimir.tail783b49.ts.net); never expose it publicly.",
  },
  servers: [
    { url: "http://dionysus.lan:61642", description: "Home LAN" },
    { url: "http://mimir.tail783b49.ts.net:61642", description: "Tailscale" },
  ],
  tags: [
    { name: "core", description: "Health and catalog reads used by the web UI." },
    { name: "mobile", description: "The iOS companion surface — thin delegations to the web app's own actions." },
    { name: "backup", description: "Full-data export (JSON bundle + Obsidian markdown files)." },
    { name: "categories", description: "Category nutrition defaults." },
  ],
  paths: {
    "/api/health": {
      get: {
        tags: ["core"],
        summary: "Liveness probe",
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/ingredients": {
      get: {
        tags: ["core"],
        summary: "Search the product catalog by name",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "Substring; empty returns the full catalog." },
        ],
        responses: { "200": { description: "Array of product summaries (id, name, unitClass, nutrition, category, categories)." } },
      },
    },
    "/api/recipes": {
      get: {
        tags: ["core"],
        summary: "Search recipes by name (sub-recipe autocomplete)",
        parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
        responses: { "200": { description: "Up to 20 {id, name} rows." } },
      },
    },
    "/api/what-can-i-cook": {
      get: {
        tags: ["core"],
        summary: "Cookability of every recipe against current pantry stock",
        parameters: [
          { name: "threshold", in: "query", schema: { type: "number" }, description: "Near-match threshold (0–1)." },
        ],
        responses: { "200": { description: "Cookable / near-match / missing-more recipe groups." } },
      },
    },
    "/api/category-defaults": {
      get: {
        tags: ["categories"],
        summary: "Resolve nutrition defaults for a category list",
        description: "Deepest matching path wins (exact before ancestor, first-listed tie-break, case-insensitive).",
        parameters: [
          {
            name: "categories",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: 'Comma-separated category paths, e.g. "Rhum/Lightly Aged Pot Rhum".',
          },
        ],
        responses: {
          "200": { description: "Resolved defaults {displayPath, caloriesPerRef, proteinPerRef, carbsPerRef, fatPerRef, alcoholAbvPercent}." },
          "404": { description: "No defaults for those categories." },
        },
      },
    },
    "/api/mobile/pantry": {
      get: {
        tags: ["mobile"],
        summary: "Pantry rows",
        responses: { "200": { description: "Rows incl. displayQuantity/Unit, readyToEat, category, package info, stockedAt." } },
      },
    },
    "/api/mobile/eat": {
      post: {
        tags: ["mobile"],
        summary: "Quick-consume a ready-to-eat pantry item",
        description:
          "Service-first, all-or-nothing: logs the meal in the inventory service, consumes the pantry, records today's eat_item plan entry. Optional date (past or today) backdates the log.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["pantryItemId", "quantity", "unit"],
                properties: {
                  pantryItemId: { type: "integer" },
                  quantity: { type: "number" },
                  unit: { type: "string", example: "each" },
                  date: { type: "string", format: "date", description: "Optional; defaults to today; never future." },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "{consumed} — the amount removed from the row." },
          "400": { description: "Validation failure (incl. not ready-to-eat, future date)." },
          "404": { description: "Pantry item not found." },
          "502": { description: "Inventory service unreachable — nothing was consumed." },
        },
      },
    },
    "/api/mobile/products": {
      get: {
        tags: ["mobile"],
        summary: "Look a product up by barcode",
        parameters: [{ name: "barcode", in: "query", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "The product." }, "404": { description: "Unknown barcode — create it via POST." } },
      },
      post: {
        tags: ["mobile"],
        summary: "Create a product (scanner flow), optionally with initial stock",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "unitClass", "caloriesPerRef", "proteinPerRef", "carbsPerRef", "fatPerRef", "initialQuantity", "unit"],
                properties: {
                  name: { type: "string" },
                  unitClass: { type: "string", enum: ["MASS", "VOLUME", "COUNT"] },
                  category: { type: "string", enum: ["FOOD", "DRINK", "SUPPLEMENT"] },
                  barcode: { type: "string" },
                  brand: { type: "string" },
                  nutritionBasisQuantity: { type: "number", example: 100 },
                  nutritionBasisUnit: { type: "string", example: "mL" },
                  ...nutritionPer100.properties,
                  alcoholAbvPercent: { type: "number", description: "VOLUME drinks only." },
                  readyToEat: { type: "boolean" },
                  initialQuantity: { type: "number", description: "0 is fine (out of stock)." },
                  unit: { type: "string" },
                  packageQuantity: { type: "number" },
                  packageUnit: { type: "string" },
                  packQuantity: { type: "number", description: "Inner pre-portioned pack size (a 366 g box of 6×61 g packs → 61)." },
                  packUnit: { type: "string", description: "Required when packQuantity is set." },
                  categories: { type: "array", items: { type: "string" }, description: 'Paths nest with "/".' },
                  newGenericName: { type: "string", description: "Reuse-or-create a same-class generic and link to it." },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created." }, "400": { description: "Validation failure." } },
      },
    },
    "/api/mobile/planner": {
      get: {
        tags: ["mobile"],
        summary: "The week's plan",
        parameters: [
          { name: "weekStart", in: "query", schema: { type: "string", format: "date" }, description: "Any date; snapped to its Monday. Defaults to the current week." },
        ],
        responses: { "200": { description: "entriesByDate (each entry carries consumedAt — null while still planned), ready-to-eat batches (merged per recipe, FIFO batch id, availablePortions net of unconsumed plans + plannedPortions), pantryOptions, suggestions, shoppingList, recipeOptions." } },
      },
    },
    "/api/mobile/planner-entries": {
      post: {
        tags: ["mobile"],
        summary: "Add a plan entry",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["date", "portions"],
                properties: {
                  kind: { type: "string", enum: ["cook", "eat_batch", "eat_pantry"], description: "Defaults to cook." },
                  date: { type: "string", format: "date" },
                  recipeId: { type: "integer", description: "cook entries." },
                  batchId: { type: "integer", description: "eat_batch entries." },
                  ingredientId: { type: "integer", description: "eat_pantry entries (ready-to-eat products)." },
                  portions: { type: "number" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "The created entry." }, "400": { description: "Validation failure." } },
      },
      delete: {
        tags: ["mobile"],
        summary: "Remove a plan entry",
        description: "Removing an unconsumed entry frees its reservation; nothing is refunded service-side (planning never consumed).",
        parameters: [{ name: "id", in: "query", required: true, schema: { type: "integer" } }],
        responses: { "204": { description: "Removed." }, "400": { description: "Bad id or not found." } },
      },
    },
    "/api/mobile/planner-entries/consume": {
      post: {
        tags: ["mobile"],
        summary: "Eat/drink a planned entry on its own day",
        description:
          "Service-first, all-or-nothing: logs the meal with eatenAt on the ENTRY's date (noon UTC when backdated), draining the recipe's batches oldest-first for eat_batch or consuming package/basis-sized portions for eat_pantry, then marks the entry consumed. Future-dated entries are refused.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["id"], properties: { id: { type: "integer", description: "Plan entry id (eat_batch or eat_pantry, unconsumed)." } } },
            },
          },
        },
        responses: {
          "200": { description: "The entry, now with consumedAt set." },
          "400": { description: "Wrong kind, already consumed, future date, or insufficient portions." },
          "404": { description: "Entry, product, or batch not found." },
          "502": { description: "Inventory service unreachable — nothing was logged or consumed." },
        },
      },
    },
    "/api/mobile/log": {
      get: {
        tags: ["mobile"],
        summary: "A day's meal log (inventory-service proxy)",
        parameters: [{ name: "date", in: "query", schema: { type: "string", format: "date" }, description: "Defaults to today." }],
        responses: { "200": { description: "Totals + meals." }, "502": { description: "Inventory service unreachable." } },
      },
    },
    "/api/mobile/log-range": {
      get: {
        tags: ["mobile"],
        summary: "Per-day rollups for a range (HealthKit sync feed)",
        parameters: [
          { name: "from", in: "query", required: true, schema: { type: "string", format: "date" } },
          { name: "to", in: "query", required: true, schema: { type: "string", format: "date" } },
        ],
        responses: { "200": { description: "{days: [{date, totalNutrition, mealCount}]}." }, "400": { description: "Bad dates." }, "502": { description: "Service unreachable." } },
      },
    },
    "/api/mobile/log-portion": {
      post: {
        tags: ["mobile"],
        summary: "One-tap: eat one portion of a batch",
        description: "Logs the meal and records today's eat_item plan entry.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["batchId"], properties: { batchId: { type: "integer" } } } } },
        },
        responses: { "200": { description: "The logged meal." }, "400": { description: "Bad batch id." }, "502": { description: "Service unreachable." } },
      },
    },
    "/api/backup": {
      get: {
        tags: ["backup"],
        summary: "Lossless JSON bundle of everything the planner owns",
        responses: { "200": { description: "recipes, products, pantry, planEntries, nutritionTargets, best-effort 2-year mealLogDays, raw productRecords." } },
      },
    },
    "/api/backup/markdown": {
      get: {
        tags: ["backup"],
        summary: "The backup rendered as Obsidian-ready markdown files",
        responses: { "200": { description: "{exportedAt, files: [{path, content}]} — Recipes/*.md, Products/*.md, Pantry.md, README.md." } },
      },
    },
    "/api/openapi": {
      get: {
        tags: ["core"],
        summary: "This document",
        responses: { "200": { description: "The OpenAPI 3.1 spec as JSON." } },
      },
    },
  },
} as const;

export type OpenapiSpec = typeof openapiSpec;
