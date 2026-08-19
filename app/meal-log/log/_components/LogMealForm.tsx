"use client";

/**
 * openspec: meal-log-integration — log a meal. Each line is either a
 * portion of an existing batch or a directly-loggable ingredient (design.md
 * Decision 6 — a two-mode picker matching dionysus-service's `MealLine` sum
 * type 1:1). Surfaces server-side rejections (over-portioning a batch,
 * logging a non-directly-loggable ingredient) as a submit error, since
 * those are cross-field/stateful checks the client schema can't perform.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { logMeal } from "@/app/actions/meal-log-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mealLogMealSchema } from "@/domain/validation/mealLog.schema";
import type { BatchJson, IngredientJson } from "@/services/dionysusService";

type LineFormValues = {
  mode: "batch_portion" | "direct_consumable";
  batchId: number | undefined;
  portions: number | undefined;
  ingredientId: number | undefined;
  quantity: number | undefined;
  unit: string;
};

type FormValues = {
  eatenAt: string;
  lines: LineFormValues[];
};

const toOptionalNumber = (raw: string): number | undefined => (raw === "" ? undefined : Number(raw));

function nowLocalDatetimeValue(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

const emptyLine: LineFormValues = {
  mode: "batch_portion",
  batchId: undefined,
  portions: undefined,
  ingredientId: undefined,
  quantity: undefined,
  unit: "each",
};

export function LogMealForm({
  batches,
  ingredients,
  recipeNameByBatchId,
}: {
  batches: BatchJson[];
  ingredients: IngredientJson[];
  recipeNameByBatchId: Map<number, string>;
}) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const { register, control, handleSubmit, formState: { errors } } = useForm<FormValues>({
    defaultValues: { eatenAt: nowLocalDatetimeValue(), lines: [emptyLine] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    setConfirmation(null);

    const payload = {
      eatenAt: values.eatenAt ? new Date(values.eatenAt).toISOString() : values.eatenAt,
      lines: values.lines.map((line) =>
        line.mode === "batch_portion"
          ? { lineType: "batch_portion" as const, batchId: line.batchId, portions: line.portions }
          : {
              lineType: "direct_consumable" as const,
              ingredientId: line.ingredientId,
              quantity: line.quantity,
              unit: line.unit,
            },
      ),
    };

    const parsed = mealLogMealSchema.safeParse(payload);
    if (!parsed.success) {
      setSubmitError(parsed.error.issues[0]?.message ?? "Check the line fields and try again.");
      return;
    }

    const result = await logMeal(parsed.data);
    if (result.ok) {
      setConfirmation(`Meal logged — ${result.data.totalNutrition.sodiumMg}mg sodium.`);
      router.refresh();
      return;
    }

    setSubmitError(result.error.message);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="log-meal-eaten-at" className="text-sm font-medium text-foreground">
          Eaten at
        </label>
        <Input id="log-meal-eaten-at" type="datetime-local" className="max-w-sm" {...register("eatenAt")} />
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium text-foreground">Lines</span>
        {fields.map((field, index) => (
          <Controller
            key={field.id}
            control={control}
            name={`lines.${index}.mode`}
            render={({ field: modeField }) => (
              <div
                className="flex flex-col gap-2 rounded-md border border-border p-3"
                data-testid="log-meal-line-row"
              >
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      checked={modeField.value === "batch_portion"}
                      onChange={() => modeField.onChange("batch_portion")}
                    />
                    Portion of a batch
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      checked={modeField.value === "direct_consumable"}
                      onChange={() => modeField.onChange("direct_consumable")}
                    />
                    Direct consumable
                  </label>
                </div>

                {modeField.value === "batch_portion" ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <Controller
                      control={control}
                      name={`lines.${index}.batchId`}
                      render={({ field: batchField }) => (
                        <Select
                          value={batchField.value ? String(batchField.value) : ""}
                          onValueChange={(v) => batchField.onChange(Number(v))}
                        >
                          <SelectTrigger aria-label={`Batch for line ${index + 1}`} className="w-56">
                            <SelectValue placeholder="Select batch" />
                          </SelectTrigger>
                          <SelectContent>
                            {batches.map((batch) => (
                              <SelectItem key={batch.id} value={String(batch.id)}>
                                {recipeNameByBatchId.get(batch.recipeId) ?? `Recipe #${batch.recipeId}`} —{" "}
                                {batch.remainingPortions} remaining
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <Input
                      type="number"
                      step="any"
                      placeholder="Portions"
                      className="w-28"
                      aria-label={`Portions for line ${index + 1}`}
                      {...register(`lines.${index}.portions`, { setValueAs: toOptionalNumber })}
                    />
                  </div>
                ) : (
                  <div className="flex flex-wrap items-end gap-2">
                    <Controller
                      control={control}
                      name={`lines.${index}.ingredientId`}
                      render={({ field: ingredientField }) => (
                        <Select
                          value={ingredientField.value ? String(ingredientField.value) : ""}
                          onValueChange={(v) => ingredientField.onChange(Number(v))}
                        >
                          <SelectTrigger aria-label={`Ingredient for line ${index + 1}`} className="w-56">
                            <SelectValue placeholder="Select ingredient" />
                          </SelectTrigger>
                          <SelectContent>
                            {ingredients
                              .filter((ingredient) => ingredient.directlyLoggable)
                              .map((ingredient) => (
                                <SelectItem key={ingredient.id} value={String(ingredient.id)}>
                                  {ingredient.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <Input
                      type="number"
                      step="any"
                      placeholder="Quantity"
                      className="w-24"
                      aria-label={`Quantity for line ${index + 1}`}
                      {...register(`lines.${index}.quantity`, { setValueAs: toOptionalNumber })}
                    />
                    <Input
                      type="text"
                      placeholder="Unit"
                      className="w-20"
                      aria-label={`Unit for line ${index + 1}`}
                      {...register(`lines.${index}.unit`)}
                    />
                  </div>
                )}

                <div>
                  <Button type="button" variant="outline" onClick={() => remove(index)} disabled={fields.length === 1}>
                    Remove line
                  </Button>
                </div>
              </div>
            )}
          />
        ))}
        {errors.lines?.message ? (
          <p data-testid="field-error-lines" className="text-sm text-destructive">
            {errors.lines.message}
          </p>
        ) : null}
        <div>
          <Button type="button" variant="outline" onClick={() => append(emptyLine)}>
            Add line
          </Button>
        </div>
      </div>

      {submitError ? (
        <p data-testid="log-meal-error" className="text-sm text-destructive">
          {submitError}
        </p>
      ) : null}
      {confirmation ? (
        <p data-testid="log-meal-confirmation" className="text-sm text-primary">
          {confirmation}
        </p>
      ) : null}

      <div>
        <Button type="submit">Log meal</Button>
      </div>
    </form>
  );
}
