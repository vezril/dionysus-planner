import { sqliteTable, integer, text, real, uniqueIndex, primaryKey, check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Drizzle SQLite schema (architecture.md §4 — the entity/field/constraint
 * tables there are authoritative). Five domain tables: ingredient,
 * pantry_item, recipe, recipe_line, recipe_tag. camelCase column names are
 * used verbatim per the story's naming instruction; `drizzle-kit generate`
 * produces the committed SQL migration in /drizzle from this file.
 */

export const ingredient = sqliteTable(
  "ingredient",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    seedKey: text("seedKey"),
    name: text("name").notNull(),
    unitClass: text("unitClass", { enum: ["MASS", "VOLUME", "COUNT"] }).notNull(),
    densityGPerMl: real("densityGPerMl"),
    caloriesPerRef: real("caloriesPerRef").notNull(),
    proteinPerRef: real("proteinPerRef").notNull(),
    carbsPerRef: real("carbsPerRef").notNull(),
    fatPerRef: real("fatPerRef").notNull(),
    fiberPerRef: real("fiberPerRef"),
    sugarPerRef: real("sugarPerRef"),
    sodiumMgPerRef: real("sodiumMgPerRef"),
    // openspec: alcohol-tracking — optional, grams per reference (null = not recorded).
    alcoholGPerRef: real("alcoholGPerRef"),
    // openspec: expanded-nutrients — optional label values (null = not recorded).
    saturatedFatGPerRef: real("saturatedFatGPerRef"),
    transFatGPerRef: real("transFatGPerRef"),
    cholesterolMgPerRef: real("cholesterolMgPerRef"),
    source: text("source", { enum: ["SEEDED", "CUSTOM"] }).notNull(),
    // openspec: drinks-and-abv — what kind of consumable this is.
    category: text("category", { enum: ["FOOD", "DRINK", "SUPPLEMENT"] }).notNull().default("FOOD"),
    // openspec: pantry-freshness — optional label shelf life.
    shelfLifeDays: real("shelfLifeDays"),
    // openspec: generic-products — a branded product's generic ("Butter").
    genericOfId: integer("genericOfId"),
    // openspec: pantry-quick-eat — eatable straight from the pantry.
    readyToEat: integer("readyToEat", { mode: "boolean" }).notNull().default(false),
    overridden: integer("overridden", { mode: "boolean" }).notNull().default(false),
    // openspec: custom-pantry-items — product identity for branded items
    // (design.md Decision 1: a branded product IS a custom ingredient, no
    // parallel product table). barcode is the future scanner app's lookup
    // key; unique when present (SQLite unique indexes treat NULLs as
    // distinct, so barcode-less rows are unlimited).
    brand: text("brand"),
    barcode: text("barcode"),
    packageQuantity: real("packageQuantity"),
    packageUnit: text("packageUnit"),
    createdAt: text("createdAt").notNull(),
    updatedAt: text("updatedAt").notNull(),
  },
  (table) => [
    uniqueIndex("ingredient_seedKey_unique").on(table.seedKey),
    uniqueIndex("ingredient_barcode_unique").on(table.barcode),
  ],
);

export const pantryItem = sqliteTable("pantry_item", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ingredientId: integer("ingredientId")
    .notNull()
    .unique()
    .references(() => ingredient.id, { onDelete: "restrict" }),
  quantityCanonical: real("quantityCanonical").notNull(),
  entryUnitClass: text("entryUnitClass", { enum: ["MASS", "VOLUME", "COUNT"] }).notNull(),
  displayQuantity: real("displayQuantity").notNull(),
  displayUnit: text("displayUnit").notNull(),
  // openspec: pantry-freshness — when this stock (most recently) arrived.
  stockedAt: text("stockedAt"),
  updatedAt: text("updatedAt").notNull(),
});

/**
 * openspec: pantry-item-detail — purchase history, keyed by INGREDIENT (not
 * pantry_item): price history is durable fact that must survive pantry
 * churn, and the future Demeter integration looks prices up by ingredient
 * (design.md Decision 1). CASCADE: history for a deliberately deleted
 * custom ingredient has no future value, and purchases must not join the
 * "cannot delete because referenced" list for what is only metadata.
 * displayQuantity/displayUnit are verbatim (FR-9 pattern), no canonical
 * conversion — purchases are never matched against recipes (Decision 3).
 */
export const purchase = sqliteTable("purchase", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ingredientId: integer("ingredientId")
    .notNull()
    .references(() => ingredient.id, { onDelete: "cascade" }),
  price: real("price").notNull(),
  store: text("store"),
  displayQuantity: real("displayQuantity"),
  displayUnit: text("displayUnit"),
  purchasedAt: text("purchasedAt").notNull(),
  createdAt: text("createdAt").notNull(),
});

export const recipe = sqliteTable(
  "recipe",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    servings: integer("servings").notNull(),
    instructions: text("instructions").notNull(),
    /** openspec: ratings-variants-links — 1–5 stars, null = unrated. */
    rating: integer("rating"),
    /** openspec: ratings-variants-links — root recipe this is a variation
     * of (no FK constraint, same posture as ingredient.genericOfId). */
    variantOfId: integer("variantOfId"),
    createdAt: text("createdAt").notNull(),
    updatedAt: text("updatedAt").notNull(),
  },
  (table) => [check("recipe_servings_check", sql`${table.servings} >= 1`)],
);

export const recipeLine = sqliteTable("recipe_line", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recipeId: integer("recipeId")
    .notNull()
    .references(() => recipe.id, { onDelete: "cascade" }),
  ingredientId: integer("ingredientId")
    .notNull()
    .references(() => ingredient.id, { onDelete: "restrict" }),
  quantityCanonical: real("quantityCanonical").notNull(),
  entryUnitClass: text("entryUnitClass", { enum: ["MASS", "VOLUME", "COUNT"] }).notNull(),
  displayQuantity: real("displayQuantity").notNull(),
  displayUnit: text("displayUnit").notNull(),
});

export const recipeTag = sqliteTable(
  "recipe_tag",
  {
    recipeId: integer("recipeId")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (table) => [primaryKey({ columns: [table.recipeId, table.tag] })],
);

/** openspec: ratings-variants-links — merchant URLs for a product
 * (local stores that carry it; future demeter deal-finding input). */
export const ingredientLink = sqliteTable("ingredient_link", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ingredientId: integer("ingredientId")
    .notNull()
    .references(() => ingredient.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
});

/** openspec: ingredient-categories-auto-tags — user-defined category
 * labels on products/generics; recipes derive tags from them at read
 * time. Replace-set semantics, same posture as recipe_tag. */
export const ingredientTag = sqliteTable(
  "ingredient_tag",
  {
    ingredientId: integer("ingredientId")
      .notNull()
      .references(() => ingredient.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (table) => [primaryKey({ columns: [table.ingredientId, table.tag] })],
);

/** openspec: vitamin-tracking — sparse per-ingredient micronutrient rows
 * (keys from domain/micronutrients.ts MICRONUTRIENTS, amounts per the
 * ingredient's reference quantity). */
export const ingredientMicronutrient = sqliteTable(
  "ingredient_micronutrient",
  {
    ingredientId: integer("ingredientId")
      .notNull()
      .references(() => ingredient.id, { onDelete: "cascade" }),
    nutrientKey: text("nutrientKey").notNull(),
    amountPerRef: real("amountPerRef").notNull(),
  },
  (table) => [primaryKey({ columns: [table.ingredientId, table.nutrientKey] })],
);

/** openspec: weekly-planner — a planned meal: recipe at a portion count on
 * a calendar day (date = YYYY-MM-DD). Plans are intentions, planner-local;
 * deleting a recipe takes its plan entries with it. */
export const planEntry = sqliteTable("plan_entry", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  // openspec: planner-ready-to-eat — cook a recipe OR eat a service batch.
  kind: text("kind", { enum: ["cook", "eat_batch", "eat_item"] }).notNull().default("cook"),
  recipeId: integer("recipeId").references(() => recipe.id, { onDelete: "cascade" }),
  // Service-side batch id (cross-system — no FK) + label snapshotted at
  // plan time so rendering never depends on the service being up.
  batchId: integer("batchId"),
  batchLabel: text("batchLabel"),
  portions: real("portions").notNull(),
  createdAt: text("createdAt").notNull(),
});

/** openspec: nutrition-targets-guide — personal daily targets keyed by
 * domain/nutritionTargets.ts TARGET_DEFS (+ micronutrient registry keys
 * prefixed "micro:"). Rows exist only for values Calvin changed; defaults
 * live in code. */
export const nutritionTarget = sqliteTable("nutrition_target", {
  key: text("key").primaryKey(),
  value: real("value").notNull(),
});
