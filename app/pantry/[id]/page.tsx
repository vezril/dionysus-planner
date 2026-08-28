import Link from "next/link";
import { notFound } from "next/navigation";
import { getIngredientMerchantLinks, getIngredientRecordById } from "@/data/ingredients";
import { getPantryItemDetail } from "@/data/purchases";
import { gramsPer100MlToAbvPercent } from "@/domain/abv";
import { computeFreshness } from "@/domain/freshness";
import { MICRONUTRIENTS } from "@/domain/micronutrients";
import { computePriceStats } from "@/domain/priceStats";
import { REFERENCE_QUANTITY_BY_CLASS } from "@/domain/types";
import { AddPurchaseForm } from "./_components/AddPurchaseForm";
import { DeletePurchaseButton } from "./_components/DeletePurchaseButton";
import { formatQuantity } from "@/domain/quantityFormat";

/**
 * openspec: pantry-item-detail — nutrition facts + purchase history for one
 * pantry item. RSC, one facade call, `force-dynamic` (ADR-011 compute-
 * fresh), `notFound()` on a bad id (root not-found.tsx boundary, same as
 * `/recipes/[id]`). Purchases are keyed by the item's INGREDIENT — history
 * survives pantry churn and is the future Demeter seam (design.md D1).
 */
export const dynamic = "force-dynamic";

const REFERENCE_LABEL: Record<string, string> = {
  MASS: "per 100 g",
  VOLUME: "per 100 mL",
  COUNT: "per 1",
};

function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

export default async function PantryItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const detail = await getPantryItemDetail(id);
  if (!detail) notFound();

  const { item, ingredient, purchases, micronutrients } = detail;
  // openspec: generic-products
  const generic = ingredient.genericOfId !== null ? await getIngredientRecordById(ingredient.genericOfId) : null;
  // openspec: ratings-variants-links — local stores carrying this product.
  const merchantLinks = await getIngredientMerchantLinks(ingredient.id);
  // openspec: pantry-freshness
  const freshness = item.displayQuantity > 0 ? computeFreshness(item.stockedAt, ingredient.shelfLifeDays, new Date()) : null;

  const stats = computePriceStats(purchases);
  // Sanity: REFERENCE_QUANTITY_BY_CLASS backs the label (100/100/1).
  void REFERENCE_QUANTITY_BY_CLASS;

  const nutritionRows: Array<{ label: string; value: number | null; unit: string }> = [
    { label: "Calories", value: ingredient.caloriesPerRef, unit: "kcal" },
    { label: "Protein", value: ingredient.proteinPerRef, unit: "g" },
    { label: "Carbs", value: ingredient.carbsPerRef, unit: "g" },
    { label: "Fat", value: ingredient.fatPerRef, unit: "g" },
    { label: "Fiber", value: ingredient.fiberPerRef, unit: "g" },
    { label: "Sugar", value: ingredient.sugarPerRef, unit: "g" },
    { label: "Sodium", value: ingredient.sodiumMgPerRef, unit: "mg" },
    {
      label: "Alcohol",
      value: ingredient.alcoholGPerRef,
      unit:
        ingredient.unitClass === "VOLUME" && ingredient.category === "DRINK" && ingredient.alcoholGPerRef != null
          ? `g (${gramsPer100MlToAbvPercent(ingredient.alcoholGPerRef)}% ABV)`
          : "g",
    },
    { label: "Saturated fat", value: ingredient.saturatedFatGPerRef, unit: "g" },
    { label: "Trans fat", value: ingredient.transFatGPerRef, unit: "g" },
    { label: "Cholesterol", value: ingredient.cholesterolMgPerRef, unit: "mg" },
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">{ingredient.name}</h1>
        <div className="flex items-baseline gap-4">
          {ingredient.category !== "FOOD" ? (
            <span
              data-testid="category-badge"
              className="rounded-full border border-primary/40 px-2 py-0.5 text-xs font-medium text-primary"
            >
              {ingredient.category}
            </span>
          ) : null}
          <span data-testid="pantry-detail-on-hand" className="font-mono text-sm tabular-nums text-muted-foreground">
            {formatQuantity(item.displayQuantity)} {item.displayUnit} on hand
          </span>
          {freshness !== null ? (
            <span data-testid="pantry-detail-freshness" className="text-sm text-muted-foreground">
              stocked {freshness.daysSinceStocked === 0 ? "today" : `${freshness.daysSinceStocked}d ago`}
              {freshness.daysLeft !== null ? (
                freshness.status === "expired" ? (
                  <span className="ml-1 font-medium text-destructive">likely expired</span>
                ) : (
                  <span className={freshness.status === "expiring" ? "ml-1 font-medium text-status-near" : "ml-1"}>
                    · ~{freshness.daysLeft}d left
                  </span>
                )
              ) : null}
            </span>
          ) : null}
          {/* openspec: nutrition-basis-and-edit — one click from the pantry
              to editing nutrition/name/product identity. */}
          <Link
            href={`/ingredients/${ingredient.id}/edit`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Edit details
          </Link>
        </div>
      </div>

      {/* openspec: custom-pantry-items — product identity, only when at
          least one field is present; generic ingredients render as before. */}
      {ingredient.brand != null || ingredient.barcode != null || ingredient.packageQuantity != null || generic !== null ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Product</h2>
          <dl data-testid="product-panel" className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border border-border p-4 sm:grid-cols-3">
            {ingredient.brand != null ? (
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">Brand</dt>
                <dd data-testid="product-brand" className="text-sm font-medium">{ingredient.brand}</dd>
              </div>
            ) : null}
            {ingredient.barcode != null ? (
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">Barcode</dt>
                <dd data-testid="product-barcode" className="font-mono text-sm tabular-nums">{ingredient.barcode}</dd>
              </div>
            ) : null}
            {generic !== null ? (
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">Generic</dt>
                <dd data-testid="product-generic" className="text-sm font-medium">{generic.name}</dd>
              </div>
            ) : null}
            {ingredient.packageQuantity != null ? (
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">Package</dt>
                <dd data-testid="product-package" className="text-sm font-medium">
                  {ingredient.packageQuantity} {ingredient.packageUnit ?? ""}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">
          Nutrition facts{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({REFERENCE_LABEL[ingredient.unitClass]})
          </span>
        </h2>
        <dl data-testid="nutrition-facts" className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border border-border p-4 sm:grid-cols-4">
          {nutritionRows.map(({ label, value, unit }) => (
            <div key={label} className="flex flex-col">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd data-testid={`nutrition-${label.toLowerCase()}`} className="text-sm font-medium">
                {/* Optional fields absent on the ingredient render as "not recorded" — never a fake 0 (A-1). */}
                {value == null ? (
                  <span className="text-muted-foreground">not recorded</span>
                ) : (
                  `${value} ${unit}`
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* openspec: vitamin-tracking — only the nutrients present (D4). */}
      {micronutrients.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">
            Micronutrients{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({REFERENCE_LABEL[ingredient.unitClass]})
            </span>
          </h2>
          <dl data-testid="micronutrient-facts" className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border border-border p-4 sm:grid-cols-4">
            {micronutrients.map(({ key, amountPerRef }) => (
              <div key={key} className="flex flex-col">
                <dt className="text-xs text-muted-foreground">{MICRONUTRIENTS[key]?.label ?? key}</dt>
                <dd data-testid={`micronutrient-${key}`} className="text-sm font-medium">
                  {amountPerRef} {MICRONUTRIENTS[key]?.unit ?? ""}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Prices</h2>
        {stats === null ? (
          <p data-testid="price-stats-empty" className="text-sm text-muted-foreground">
            No purchases logged yet.
          </p>
        ) : (
          <div data-testid="price-stats" className="flex gap-8 rounded-md border border-border p-4">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Last paid</span>
              <span data-testid="price-stats-last-paid" className="text-lg font-semibold">
                {formatPrice(stats.lastPaid)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Lowest</span>
              <span data-testid="price-stats-lowest" className="text-lg font-semibold">
                {formatPrice(stats.lowest.price)}
                {stats.lowest.store ? (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    at {stats.lowest.store}
                  </span>
                ) : null}
              </span>
            </div>
          </div>
        )}

        {purchases.length > 0 ? (
          <ul data-testid="purchase-history" className="flex flex-col divide-y divide-border">
            {purchases.map((purchase) => (
              <li
                key={purchase.id}
                data-testid="purchase-row"
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2"
              >
                <span className="font-mono text-sm tabular-nums">{formatPrice(purchase.price)}</span>
                <span className="text-sm text-muted-foreground">
                  {purchase.purchasedAt}
                  {purchase.store ? ` · ${purchase.store}` : ""}
                  {purchase.displayQuantity != null
                    ? ` · ${formatQuantity(purchase.displayQuantity)} ${purchase.displayUnit ?? ""}`
                    : ""}
                </span>
                <DeletePurchaseButton purchaseId={purchase.id} />
              </li>
            ))}
          </ul>
        ) : null}

        <h3 className="text-base font-semibold">Log a purchase</h3>
        <AddPurchaseForm ingredientId={ingredient.id} />
      </section>

      {merchantLinks.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Where to buy</h2>
          <ul data-testid="merchant-links" className="flex flex-col gap-1 text-sm">
            {merchantLinks.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="merchant-link"
                  className="break-all font-medium text-primary hover:underline"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
