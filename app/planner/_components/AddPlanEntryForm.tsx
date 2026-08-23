"use client";

/** openspec: weekly-planner — add a recipe to a day at a portion count.
 * Portions default to the selected recipe's servings. */
import { useState, useTransition } from "react";
import { addPlanEntry } from "@/app/actions/planner-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AddPlanEntryForm({
  selectedDate,
  selectedLabel,
  recipeOptions,
  batchOptions,
  pantryOptions,
}: {
  selectedDate: string;
  selectedLabel: string;
  recipeOptions: Array<{ id: number; name: string; servings: number }>;
  batchOptions: Array<{ batchId: number; label: string; availablePortions: number }>;
  /** openspec: plan-pantry-backdate — ready-to-eat pantry products. */
  pantryOptions: Array<{ ingredientId: number; name: string }>;
}) {
  const [recipeId, setRecipeId] = useState<string>("");
  const date = selectedDate;
  const [portions, setPortions] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // openspec: planner-ready-to-eat — one picker, two kinds: "cook:<id>"
  // recipes and "batch:<id>" ready-to-eat batches.
  const selectedRecipe = recipeId.startsWith("cook:")
    ? recipeOptions.find((option) => `cook:${option.id}` === recipeId)
    : undefined;
  const selectedBatch = recipeId.startsWith("batch:")
    ? batchOptions.find((option) => `batch:${option.batchId}` === recipeId)
    : undefined;
  // openspec: plan-pantry-backdate — "pantry:<ingredientId>" entries.
  const selectedPantry = recipeId.startsWith("pantry:")
    ? pantryOptions.find((option) => `pantry:${option.ingredientId}` === recipeId)
    : undefined;
  const selected = selectedRecipe ?? selectedBatch ?? selectedPantry;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
      <div className="flex min-w-48 flex-col gap-1">
        <span className="text-sm font-medium">Recipe</span>
        <Select
          value={recipeId}
          onValueChange={(value) => {
            setRecipeId(value);
            if (portions !== "") return;
            const recipe = recipeOptions.find((candidate) => `cook:${candidate.id}` === value);
            if (recipe) setPortions(recipe.servings.toString());
            else if (value.startsWith("batch:") || value.startsWith("pantry:")) setPortions("1");
          }}
        >
          <SelectTrigger aria-label="Plan recipe">
            <SelectValue placeholder="Pick a recipe or batch" />
          </SelectTrigger>
          <SelectContent>
            {batchOptions.map((option) => (
              <SelectItem key={`batch:${option.batchId}`} value={`batch:${option.batchId}`}>
                {option.label} — ready to eat ({option.availablePortions} left)
              </SelectItem>
            ))}
            {pantryOptions.map((option) => (
              <SelectItem key={`pantry:${option.ingredientId}`} value={`pantry:${option.ingredientId}`}>
                {option.name} — from pantry
              </SelectItem>
            ))}
            {recipeOptions.map((option) => (
              <SelectItem key={`cook:${option.id}`} value={`cook:${option.id}`}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Adding to</span>
        {/* openspec: planner-day-click-and-calories — the calendar IS the
            picker; click a day card to change this. */}
        <span data-testid="plan-target-day" className="rounded-md border border-primary/40 px-3 py-2 text-sm font-medium text-primary">
          {selectedLabel}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="plan-portions" className="text-sm font-medium">
          Portions
        </label>
        <Input
          id="plan-portions"
          type="number"
          step="any"
          className="w-24"
          value={portions}
          onChange={(event) => setPortions(event.target.value)}
        />
      </div>
      <Button
        type="button"
        data-testid="plan-add"
        disabled={pending || !selected || portions === ""}
        onClick={() =>
          startTransition(async () => {
            setErrorMessage(null);
            const result = await addPlanEntry(
              selectedBatch
                ? { kind: "eat_batch", date, batchId: selectedBatch.batchId, portions: Number(portions) }
                : selectedPantry
                  ? { kind: "eat_pantry", date, ingredientId: selectedPantry.ingredientId, portions: Number(portions) }
                  : { kind: "cook", date, recipeId: Number(recipeId.replace("cook:", "")), portions: Number(portions) },
            );
            if (!result.ok) setErrorMessage(result.error.message);
          })
        }
      >
        {pending ? "Adding…" : "Add to plan"}
      </Button>
      {errorMessage ? (
        <p data-testid="plan-add-error" className="w-full text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
