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
    source: text("source", { enum: ["SEEDED", "CUSTOM"] }).notNull(),
    overridden: integer("overridden", { mode: "boolean" }).notNull().default(false),
    createdAt: text("createdAt").notNull(),
    updatedAt: text("updatedAt").notNull(),
  },
  (table) => [uniqueIndex("ingredient_seedKey_unique").on(table.seedKey)],
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
  updatedAt: text("updatedAt").notNull(),
});

export const recipe = sqliteTable(
  "recipe",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    servings: integer("servings").notNull(),
    instructions: text("instructions").notNull(),
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
