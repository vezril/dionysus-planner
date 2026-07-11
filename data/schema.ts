import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

/**
 * Placeholder table only — the real domain schema (Ingredient,
 * PantryItem, Recipe, RecipeLine, RecipeTag per architecture.md §4)
 * lands in S-201. This exists to prove /data/** is the sole
 * drizzle-orm import site (architecture.md §5 boundary rule) and that
 * `pnpm drizzle-kit generate` / the migration pipeline is wired up.
 */
export const meta = sqliteTable("meta", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull(),
  value: text("value"),
});
