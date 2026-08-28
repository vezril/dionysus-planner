"use client";

/**
 * openspec: weekly-planner — cookability suggestions against the
 * plan-depleted pantry; expiring-users float to the top of their tier.
 */
import Link from "next/link";
import type { Suggestion } from "@/domain/planner";
import { formatQuantity } from "@/domain/quantityFormat";

export function SuggestionList({
  suggestions,
  readyToEat,
  serviceAvailable,
}: {
  suggestions: Suggestion[];
  readyToEat: Array<{ batchId: number; label: string; availablePortions: number; plannedPortions: number }>;
  serviceAvailable: boolean;
}) {
  const cookable = suggestions.filter((suggestion) => suggestion.tier === "cookable");
  const near = suggestions.filter((suggestion) => suggestion.tier === "near");

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">
        Suggestions{" "}
        <span className="text-sm font-normal text-muted-foreground">
          (pantry minus this week&apos;s plan)
        </span>
      </h2>
      {/* openspec: planner-ready-to-eat — leftovers first; degrade quietly
          when the meal service is unreachable. */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-primary">Ready to eat</h3>
        {!serviceAvailable ? (
          <p data-testid="planner-service-down" className="text-sm text-muted-foreground">
            Inventory service unreachable — cook planning still works.
          </p>
        ) : readyToEat.length === 0 ? (
          <p data-testid="planner-ready-empty" className="text-sm text-muted-foreground">
            No batches with portions left this week.
          </p>
        ) : (
          <ul data-testid="planner-ready-to-eat" className="flex flex-col gap-1">
            {readyToEat.map((batch) => (
              <li key={batch.batchId} data-testid="planner-ready-batch" className="flex items-center gap-2 text-sm">
                <span className="font-medium">{batch.label}</span>
                <span className="text-xs text-muted-foreground">
                  {formatQuantity(batch.availablePortions)} portions available
                  {batch.plannedPortions > 0 ? (
                    <span data-testid="planner-ready-planned"> · {formatQuantity(batch.plannedPortions)} planned</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {suggestions.length === 0 ? (
        <p data-testid="planner-suggestions-empty" className="text-sm text-muted-foreground">
          Nothing cookable with what would be left — restock or lighten the week.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-status-cookable">Cookable with what&apos;s left</h3>
            <ul data-testid="planner-suggestions-cookable" className="flex flex-col gap-1">
              {cookable.length === 0 ? (
                <li className="text-sm text-muted-foreground">None this week.</li>
              ) : (
                cookable.map((suggestion) => (
                  <SuggestionRow key={suggestion.recipeId} suggestion={suggestion} />
                ))
              )}
            </ul>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-status-near">Almost — shop a little</h3>
            <ul data-testid="planner-suggestions-near" className="flex flex-col gap-1">
              {near.length === 0 ? (
                <li className="text-sm text-muted-foreground">None.</li>
              ) : (
                near.map((suggestion) => <SuggestionRow key={suggestion.recipeId} suggestion={suggestion} />)
              )}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

function SuggestionRow({ suggestion }: { suggestion: Suggestion }) {
  return (
    <li data-testid="planner-suggestion" className="flex flex-wrap items-center gap-2 text-sm">
      <Link href={`/recipes/${suggestion.recipeId}`} className="font-medium hover:text-primary hover:underline">
        {suggestion.name}
      </Link>
      {suggestion.usesExpiring ? (
        <span
          data-testid="uses-expiring"
          className="rounded-sm border border-status-near/50 px-1.5 py-0.5 text-xs font-medium text-status-near"
        >
          uses expiring
        </span>
      ) : null}
      {suggestion.tier === "near" ? (
        <span className="text-xs text-muted-foreground">missing {suggestion.missingCount}</span>
      ) : null}
    </li>
  );
}
