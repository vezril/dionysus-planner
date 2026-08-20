/**
 * Week shopping list (openspec: shopping-list). Pure, framework-free —
 * composes `planCookConsumption` exactly like plan depletion does, but
 * COLLECTS what the pantry can't cover instead of discarding it.
 *
 * Units: a shortfall against an existing pantry row is expressed in that
 * row's canonical basis; a wholly-missing ingredient in its own canonical
 * class. The same ingredient aggregates per unit class (a VOLUME-row
 * shortfall and MASS-canonical miss stay separate lines — rare, honest).
 */
import { canonicalUnitForClass, planCookConsumption, type CookLine } from "@/domain/cooking";
import type { DepletableRow, PlannedConsumption } from "@/domain/planner";
import { resolveQuantityForComparison } from "@/domain/units";

export interface ShoppingListItem {
  ingredientId: number;
  name: string;
  quantity: number;
  unit: string;
}

export interface ShoppingList {
  items: ShoppingListItem[];
  /** Line ingredients whose units could not be quantified — check the recipe. */
  unresolved: string[];
}

export function buildShoppingList(
  pantryRows: DepletableRow[],
  planned: PlannedConsumption[],
): ShoppingList {
  const rows = pantryRows.map((row) => ({ ...row }));
  const byIngredientId = new Map(rows.map((row) => [row.ingredientId, row]));

  const needed = new Map<string, ShoppingListItem>(); // key: ingredientId|unit
  const unresolved = new Set<string>();

  const addNeed = (ingredientId: number, name: string, quantity: number, unit: string) => {
    if (quantity <= 0) return;
    const key = `${ingredientId}|${unit}`;
    const existing = needed.get(key);
    if (existing) existing.quantity += quantity;
    else needed.set(key, { ingredientId, name, quantity, unit });
  };

  const missingRequirement = (line: CookLine, factor: number): { quantity: number; unit: string } | null => {
    // Prefer the ingredient's own class; fall back to the line's entry class.
    const inIngredientClass = resolveQuantityForComparison(
      line.quantityCanonical * factor,
      line.entryUnitClass,
      line.ingredient.unitClass,
      line.ingredient.densityGPerMl,
      line.ingredient.packageQuantity ?? null,
      line.ingredient.packageUnit ?? null,
    );
    if (inIngredientClass !== "UNRESOLVED") {
      return { quantity: inIngredientClass, unit: canonicalUnitForClass(line.ingredient.unitClass) };
    }
    return { quantity: line.quantityCanonical * factor, unit: canonicalUnitForClass(line.entryUnitClass) };
  };

  for (const entry of planned) {
    const factor = entry.portions / entry.servings;
    const plans = planCookConsumption(entry.lines, byIngredientId, factor);
    for (const plan of plans) {
      const line = entry.lines.find((candidate) => candidate.id === plan.lineId)!;
      switch (plan.status) {
        case "ok": {
          const row = byIngredientId.get(plan.ingredientId)!;
          row.quantityCanonical -= plan.requiredInPantryBasis!;
          break;
        }
        case "insufficient": {
          const row = byIngredientId.get(plan.ingredientId)!;
          const shortfall = plan.requiredInPantryBasis! - row.quantityCanonical;
          addNeed(plan.ingredientId, plan.ingredientName, shortfall, canonicalUnitForClass(row.entryUnitClass));
          row.quantityCanonical = 0;
          break;
        }
        case "missing": {
          const requirement = missingRequirement(line, factor);
          if (requirement) addNeed(plan.ingredientId, plan.ingredientName, requirement.quantity, requirement.unit);
          break;
        }
        case "unresolved":
          unresolved.add(plan.ingredientName);
          break;
      }
    }
  }

  const items = [...needed.values()]
    .map((item) => ({ ...item, quantity: Math.round(item.quantity * 100) / 100 }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.unit.localeCompare(b.unit));
  return { items, unresolved: [...unresolved].sort() };
}

/** Plain-text rendering for the clipboard. */
export function shoppingListText(list: ShoppingList): string {
  const lines = list.items.map((item) => `- ${item.name}: ${item.quantity} ${item.unit}`);
  for (const name of list.unresolved) lines.push(`- ${name}: check recipe (units unresolved)`);
  return lines.join("\n");
}
