"use client";

/**
 * Near Match client island (docs/stories/S-502-near-match-threshold.md,
 * architecture.md ADR-002 "named client island", ADR-004, §6 Flow C). The
 * page's initial render stays RSC (S-501) — this component receives that
 * server-computed Near Match slice + missing-more count as props and, from
 * then on, owns the threshold control and re-fetches
 * `GET /api/what-can-i-cook?threshold=` on change, swapping its own content
 * in place. No navigation, no full-page reload: the `h1` and URL live
 * outside this component, in the server-rendered page shell.
 *
 * Mirrors S-501's `near-match-section`/`missing-more-tail` DOM contract
 * (`near-match-recipe-row`, `unsatisfied-line`, `missing-more-count`)
 * exactly, so `tests/e2e/what-can-i-cook.spec.ts` keeps passing unchanged.
 *
 * FR-29: an empty Near Match result (nothing to show at the active
 * threshold) renders the shared `EmptyState` with a real CTA (link to
 * `/recipes/new`) instead of descriptive-only prose with no actionable
 * control — the same bar `/pantry` and `/recipes` already hold themselves
 * to.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Slider } from "@/components/ui/slider";
import type { RankedRecipe, UnsatisfiedLine } from "@/domain/matching";

const MIN_THRESHOLD = 0;
const MAX_THRESHOLD = 20;

function formatQuantity(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function UnsatisfiedLineText({ line, nameFor }: { line: UnsatisfiedLine; nameFor: (id: number) => string }) {
  const name = nameFor(line.ingredientId);

  if (line.status === "UNRESOLVED") {
    return <>{`${name}: unresolved — cannot compare units`}</>;
  }

  return <>{`need ${formatQuantity(line.shortfallDisplayQuantity)} ${line.displayUnit} more ${name}`}</>;
}

function NearMatchRow({ recipe, nameFor }: { recipe: RankedRecipe; nameFor: (id: number) => string }) {
  return (
    <li data-testid="near-match-recipe-row" className="flex flex-col gap-2 rounded-lg border border-status-near/30 p-4">
      <Link href={`/recipes/${recipe.id}`} className="break-words font-medium underline underline-offset-2">
        {recipe.name}
      </Link>
      <ul className="flex flex-col gap-1 text-sm">
        {recipe.unsatisfiedLines.map((line) => (
          <li
            key={line.ingredientId}
            data-testid="unsatisfied-line"
            className={`font-mono tabular-nums ${line.status === "UNRESOLVED" ? "text-destructive" : "text-status-near"}`}
          >
            <UnsatisfiedLineText line={line} nameFor={nameFor} />
          </li>
        ))}
      </ul>
    </li>
  );
}

interface NearMatchApiResponse {
  nearMatch: RankedRecipe[];
  missingMoreCount: number;
}

export function NearMatchPanel({
  initialThreshold,
  initialNearMatch,
  initialMissingMoreCount,
  ingredientNames,
}: {
  initialThreshold: number;
  initialNearMatch: RankedRecipe[];
  initialMissingMoreCount: number;
  ingredientNames: Record<number, string>;
}) {
  const [threshold, setThreshold] = useState(initialThreshold);
  const [nearMatch, setNearMatch] = useState(initialNearMatch);
  const [missingMoreCount, setMissingMoreCount] = useState(initialMissingMoreCount);
  const latestRequestedThreshold = useRef(initialThreshold);

  const nameFor = (id: number) => ingredientNames[id] ?? "an ingredient";

  async function applyThreshold(next: number): Promise<void> {
    setThreshold(next);
    latestRequestedThreshold.current = next;

    const response = await fetch(`/api/what-can-i-cook?threshold=${next}`);
    if (!response.ok || latestRequestedThreshold.current !== next) {
      return;
    }

    const data = (await response.json()) as NearMatchApiResponse;
    setNearMatch(data.nearMatch);
    setMissingMoreCount(data.missingMoreCount);
  }

  return (
    <>
      <div data-testid="near-match-threshold-slider" className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted-foreground">Near match threshold: {threshold}</span>
        <Slider
          aria-label="Near match threshold"
          value={[threshold]}
          min={MIN_THRESHOLD}
          max={MAX_THRESHOLD}
          step={1}
          onValueChange={(values) => {
            void applyThreshold(values[0]);
          }}
        />
      </div>

      <section data-testid="near-match-section" className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-status-near">Near Match</h2>
        {nearMatch.length === 0 ? (
          <EmptyState description="No near matches right now — add a recipe or stock more of your pantry to see one here.">
            <Button asChild>
              <Link href="/recipes/new">Add your first recipe</Link>
            </Button>
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {nearMatch.map((recipe) => (
              <NearMatchRow key={recipe.id} recipe={recipe} nameFor={nameFor} />
            ))}
          </ul>
        )}
      </section>

      <div data-testid="missing-more-tail" className="text-sm text-muted-foreground">
        <span data-testid="missing-more-count">{missingMoreCount}</span>{" "}
        {missingMoreCount === 1 ? "recipe needs" : "recipes need"} too many ingredients to show here.
      </div>
    </>
  );
}
