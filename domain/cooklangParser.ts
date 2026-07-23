/**
 * Cooklang-inspired recipe body parser (architecture.md-style domain
 * module — pure, framework-free, no next/react/drizzle-orm/better-sqlite3
 * imports, ESLint-enforced). openspec: cooklang-recipe-editor.
 *
 * Mention grammar (design.md Decision 1): `@Name(id)` optionally followed
 * by `{quantity%unit}` or a bare `{quantity}` (COUNT class, implicit
 * "each"). The catalog id is embedded directly in the text — captured
 * once, at authoring time, via the editor's autocomplete (Decision 3).
 * This module never does name-based/fuzzy matching to resolve a mention;
 * it only extracts what's already explicitly encoded in the text.
 *
 * Every mention requires a quantity block (Decision 2) — a deliberate
 * deviation from stock Cooklang, which permits a bare `@ingredient` with
 * no amount. This app's nutrition/matching engines require a canonical
 * quantity per line (FR-17/FR-20), so a missing `{...}` is a parse error,
 * not silently accepted.
 *
 * Cookware (`#tool{}`) and timers (`~{duration}`) are non-goals (design.md)
 * — never parsed, left as inert plain text.
 */
import { UNITS } from "./units";

const MENTION_PATTERN = /@([^(]+?)\((\d+)\)(?:\{([^}]*)\})?/g;

export interface ParsedRecipeLine {
  ingredientId: number;
  quantity: number;
  unit: string;
}

export interface ParseRecipeBodyResult {
  lines: ParsedRecipeLine[];
  errors: string[];
}

/**
 * Extracts `{ingredientId, quantity, unit}` lines from a recipe body.
 * Pure — depends only on its argument, no external catalog lookup.
 */
export function parseRecipeBody(body: string): ParseRecipeBodyResult {
  const lines: ParsedRecipeLine[] = [];
  const errors: string[] = [];

  for (const match of body.matchAll(MENTION_PATTERN)) {
    const name = match[1].trim();
    const ingredientId = Number(match[2]);
    const quantityBlock = match[3];

    if (quantityBlock === undefined) {
      errors.push(`"${name}" is missing a quantity — every ingredient needs a {quantity} or {quantity%unit}.`);
      continue;
    }

    const trimmedBlock = quantityBlock.trim();
    const percentIndex = trimmedBlock.indexOf("%");
    const quantityText = percentIndex === -1 ? trimmedBlock : trimmedBlock.slice(0, percentIndex);
    const unit = percentIndex === -1 ? "each" : trimmedBlock.slice(percentIndex + 1).trim();

    const quantity = Number(quantityText);
    if (quantityText === "" || Number.isNaN(quantity) || quantity <= 0) {
      errors.push(`"${name}" has an invalid quantity ("${quantityText}") — it must be a positive number.`);
      continue;
    }

    if (!(unit in UNITS)) {
      errors.push(`"${name}" uses an unknown unit ("${unit}").`);
      continue;
    }

    lines.push({ ingredientId, quantity, unit });
  }

  return { lines, errors };
}

/**
 * Strips the `(id)` annotation from every mention for read-only display,
 * leaving the rest of the text (including a bare, unlinked `@`) untouched.
 */
export function stripMentionIds(body: string): string {
  return body.replace(MENTION_PATTERN, (fullMatch, name: string, _id: string, quantityBlock: string | undefined) =>
    quantityBlock === undefined ? `@${name}` : `@${name}{${quantityBlock}}`,
  );
}
