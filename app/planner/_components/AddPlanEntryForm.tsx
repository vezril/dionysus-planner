"use client";

/** openspec: weekly-planner — add a recipe to a day at a portion count.
 * Portions default to the selected recipe's servings. */
import { useState, useTransition } from "react";
import { addPlanEntry } from "@/app/actions/planner-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AddPlanEntryForm({
  dates,
  dayLabels,
  recipeOptions,
}: {
  dates: string[];
  dayLabels: string[];
  recipeOptions: Array<{ id: number; name: string; servings: number }>;
}) {
  const [recipeId, setRecipeId] = useState<string>("");
  const [date, setDate] = useState<string>(dates[0]);
  const [portions, setPortions] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = recipeOptions.find((option) => option.id.toString() === recipeId);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
      <div className="flex min-w-48 flex-col gap-1">
        <span className="text-sm font-medium">Recipe</span>
        <Select
          value={recipeId}
          onValueChange={(value) => {
            setRecipeId(value);
            const option = recipeOptions.find((candidate) => candidate.id.toString() === value);
            if (option && portions === "") setPortions(option.servings.toString());
          }}
        >
          <SelectTrigger aria-label="Plan recipe">
            <SelectValue placeholder="Pick a recipe" />
          </SelectTrigger>
          <SelectContent>
            {recipeOptions.map((option) => (
              <SelectItem key={option.id} value={option.id.toString()}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Day</span>
        <Select value={date} onValueChange={setDate}>
          <SelectTrigger aria-label="Plan day" className="min-w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dates.map((candidate, index) => (
              <SelectItem key={candidate} value={candidate}>
                {dayLabels[index]} {candidate.slice(5)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
            const result = await addPlanEntry({
              date,
              recipeId: Number(recipeId),
              portions: Number(portions),
            });
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
