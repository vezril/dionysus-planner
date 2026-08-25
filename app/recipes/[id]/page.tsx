import Link from "next/link";
import { previewCook } from "@/app/actions/cook-actions";
import { CreateVariationButton } from "./_components/CreateVariationButton";
import { RecipeRating } from "./_components/RecipeRating";
import { notFound } from "next/navigation";
import { getRecipeDetail } from "@/data/recipes";
import { getResolvedTargets } from "@/data/nutritionTargets";
import { percentOfTarget } from "@/domain/nutritionTargets";
import type { NutritionTotals } from "@/domain/nutrition";
import { splitInstructionSegments } from "@/domain/cooklangParser";
import { computeRecipeAbv } from "@/domain/abv";
import { DeleteRecipeButton } from "@/app/recipes/_components/delete-recipe-button";
import { PortionScaler } from "./_components/PortionScaler";

/**
 * Recipe detail with computed nutrition (docs/stories/S-403-recipe-detail-
 * nutrition.md, architecture.md §6 Flow B). RSC — one query
 * (`recipeRepo.getWithLinesAndIngredients` via `data/recipes#
 * getRecipeDetail`) folded straight into `domain/nutrition
 * .computeRecipeNutrition`, computed fresh on every request (no
 * caching/invalidation step, ADR-011 — hence `force-dynamic` below).
 *
 * A bad/missing id renders the app's `not-found.tsx` boundary
 * (architecture.md §6), mirroring `/app/ingredients/[id]/edit/page.tsx`.
 */
export const dynamic = "force-dynamic";

const NUTRIENT_ROWS: Array<{
  key: keyof NutritionTotals;
  testid: string;
  label: string;
  kind: "kcal" | "g" | "mg";
}> = [
  { key: "calories", testid: "calories", label: "Calories", kind: "kcal" },
  { key: "protein", testid: "protein", label: "Protein", kind: "g" },
  { key: "carbs", testid: "carbs", label: "Carbs", kind: "g" },
  { key: "fat", testid: "fat", label: "Fat", kind: "g" },
  { key: "fiber", testid: "fiber", label: "Fiber", kind: "g" },
  { key: "sugar", testid: "sugar", label: "Sugar", kind: "g" },
  { key: "sodiumMg", testid: "sodium", label: "Sodium", kind: "mg" },
  { key: "alcoholG", testid: "alcohol", label: "Alcohol", kind: "g" },
  { key: "saturatedFatG", testid: "saturated-fat", label: "Saturated fat", kind: "g" },
  { key: "transFatG", testid: "trans-fat", label: "Trans fat", kind: "g" },
  { key: "cholesterolMg", testid: "cholesterol", label: "Cholesterol", kind: "mg" },
];

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipeId = Number(id);

  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    notFound();
  }

  const detail = await getRecipeDetail(recipeId);
  if (!detail) {
    notFound();
  }

  const { recipe, lines, nutrition, tags, derivedTags, variantOf, variations } = detail;
  // openspec: recipe-missing-highlight — the cook preview's per-line
  // pantry plan (grouped generic/product matching, local-only) at the
  // authored servings tells us which lines the pantry can't cover.
  const preview = await previewCook(recipe.id, recipe.servings);
  const pantryStatusByLineId = new Map<number, string>(
    preview.ok ? preview.data.lines.map((line) => [line.lineId, line.status]) : [],
  );
  // openspec: nutrition-targets-guide — per-serving % of the daily target.
  const targets = await getResolvedTargets();
  const TARGET_KEY_BY_ROW: Record<string, string> = {
    calories: "caloriesKcal",
    protein: "proteinG",
    carbs: "carbsG",
    fat: "fatG",
    fiber: "fiberG",
    sugar: "sugarG",
    sodiumMg: "sodiumMg",
    saturatedFatG: "saturatedFatG",
    cholesterolMg: "cholesterolMg",
  };
  // openspec: drinks-and-abv — estimate; null renders nothing.
  const abv = computeRecipeAbv(
    lines.map((line) => ({
      quantityCanonical: line.quantityCanonical,
      entryUnitClass: line.entryUnitClass,
      ingredient: line.ingredient,
    })),
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{recipe.name}</h1>
        <div className="flex items-center gap-3">
          <CreateVariationButton recipeId={recipe.id} />
          <Link href={`/recipes/${recipe.id}/edit`} className="text-sm font-medium text-primary underline">
            Edit recipe
          </Link>
        </div>
      </div>
      {/* openspec: ratings-variants-links */}
      <RecipeRating recipeId={recipe.id} rating={recipe.rating} />
      {variantOf !== null ? (
        <p data-testid="variant-of" className="text-sm text-muted-foreground">
          Variation of{" "}
          <Link href={`/recipes/${variantOf.id}`} className="font-medium text-primary hover:underline">
            {variantOf.name}
          </Link>
        </p>
      ) : null}
      {variations.length > 0 ? (
        <p data-testid="variations" className="text-sm text-muted-foreground">
          Variations:{" "}
          {variations.map((variation, index) => (
            <span key={variation.id}>
              {index > 0 ? ", " : ""}
              <Link href={`/recipes/${variation.id}`} className="font-medium text-primary hover:underline">
                {variation.name}
              </Link>
            </span>
          ))}
        </p>
      ) : null}
      <p data-testid="recipe-servings" className="text-sm text-muted-foreground">
        Servings: {recipe.servings}
        {abv !== null ? (
          <span data-testid="recipe-abv" className="ml-3 font-medium text-primary">
            ~{Math.round(abv.abvPercent * 10) / 10}% ABV
            <span className="ml-1 font-normal text-muted-foreground">(estimated)</span>
          </span>
        ) : null}
      </p>
      {/* openspec: recipe-display-polish — mentions render as plain prose;
          quantities live in the ingredient list below. */}
      <p data-testid="recipe-instructions" className="whitespace-pre-wrap text-sm">
        {/* openspec: subrecipes-consume-qol — [[sub-recipe]] refs render
            as links to their recipe pages. */}
        {splitInstructionSegments(recipe.instructions).map((segment, index) =>
          segment.type === "recipeRef" ? (
            <Link
              key={index}
              href={`/recipes/${segment.recipeId}`}
              data-testid="subrecipe-link"
              className="font-medium text-primary hover:underline"
            >
              {segment.text}
            </Link>
          ) : (
            <span key={index}>{segment.text}</span>
          ),
        )}
      </p>

      {tags.length > 0 || derivedTags.length > 0 ? (
        <div data-testid="recipe-tags" className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              data-testid="recipe-tag"
              className="rounded-full border border-border bg-muted px-2.5 py-1 text-sm"
            >
              {tag}
            </span>
          ))}
          {/* openspec: ingredient-categories-auto-tags — inherited from
              ingredient categories; muted, not editable on the recipe. */}
          {derivedTags.map((tag) => (
            <span
              key={`derived-${tag}`}
              data-testid="recipe-derived-tag"
              title="Inherited from an ingredient's categories"
              className="rounded-full border border-dashed border-border px-2.5 py-1 text-sm text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {/* openspec: qol-nav-scale-delete — slider + lines + nutrition move
          into one client component so the factor rescales them together
          (design D2); per-serving values pass through factor-independent. */}
      <PortionScaler
        recipeId={recipe.id}
        servings={recipe.servings}
        lines={lines.map((line) => ({
          id: line.id,
          name: line.ingredient.name,
          displayQuantity: line.displayQuantity,
          displayUnit: line.displayUnit,
          unresolved: nutrition.unresolvedLineIds.includes(line.id),
          pantryStatus: pantryStatusByLineId.get(line.id) ?? "ok",
        }))}
        totalRows={NUTRIENT_ROWS.map((row) => ({
          key: row.key,
          testid: row.testid,
          label: row.label,
          kind: row.kind,
          totalValue: nutrition.totals[row.key].value,
          perServingValue: nutrition.perServing[row.key].value,
          perServingPercent:
            nutrition.perServing[row.key].value !== null && TARGET_KEY_BY_ROW[row.key] !== undefined
              ? percentOfTarget(nutrition.perServing[row.key].value!, targets.values[TARGET_KEY_BY_ROW[row.key]])
              : null,
        }))}
      />

      {/* openspec: qol-nav-scale-delete — same confirm-dialog delete as the
          edit page (design D3). */}
      <DeleteRecipeButton recipeId={recipe.id} />
    </div>
  );
}
