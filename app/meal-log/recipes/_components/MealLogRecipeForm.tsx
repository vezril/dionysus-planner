"use client";

/**
 * openspec: meal-log-integration — create form for a dionysus-service
 * recipe: a flat list of `{ingredientId, quantity, unit}` lines (design.md
 * Decision 5 — no Cooklang mention editor here, since this API has no
 * free-text recipe body to author).
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useFieldArray, useForm, type Resolver } from "react-hook-form";
import { createMealLogRecipe } from "@/app/actions/meal-log-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mealLogRecipeSchema } from "@/domain/validation/mealLog.schema";
import type { IngredientJson } from "@/services/dionysusService";

type FormValues = {
  name: string;
  servings: number | undefined;
  lines: Array<{ ingredientId: number | undefined; quantity: number | undefined; unit: string }>;
};

const toOptionalNumber = (raw: string): number | undefined => (raw === "" ? undefined : Number(raw));

export function MealLogRecipeForm({ ingredients }: { ingredients: IngredientJson[] }) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(mealLogRecipeSchema) as unknown as Resolver<FormValues>,
    defaultValues: {
      name: "",
      servings: undefined,
      lines: [{ ingredientId: undefined, quantity: undefined, unit: "g" }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    const result = await createMealLogRecipe(values);

    if (result.ok) {
      router.refresh();
      return;
    }

    if (result.error.fieldErrors) {
      const linesError = result.error.fieldErrors.lines;
      if (linesError && linesError.length > 0) {
        setError("lines", { type: "server", message: linesError[0] });
      }
      for (const [field, messages] of Object.entries(result.error.fieldErrors)) {
        if (field !== "lines" && messages && messages.length > 0) {
          setError(field as "name" | "servings", { type: "server", message: messages[0] });
        }
      }
    } else {
      setSubmitError(result.error.message);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="meal-log-recipe-name" className="text-sm font-medium text-foreground">
          Recipe name
        </label>
        <Input id="meal-log-recipe-name" type="text" className="max-w-sm" {...register("name")} />
        {errors.name ? (
          <p data-testid="field-error-name" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="meal-log-recipe-servings" className="text-sm font-medium text-foreground">
          Servings
        </label>
        <Input
          id="meal-log-recipe-servings"
          type="number"
          step="1"
          className="max-w-sm"
          {...register("servings", { setValueAs: toOptionalNumber })}
        />
        {errors.servings ? (
          <p data-testid="field-error-servings" className="text-sm text-destructive">
            {errors.servings.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Ingredient lines</span>
        {fields.map((field, index) => (
          <div key={field.id} className="flex flex-wrap items-end gap-2" data-testid="meal-log-recipe-line-row">
            <Controller
              control={control}
              name={`lines.${index}.ingredientId`}
              render={({ field: controllerField }) => (
                <Select
                  value={controllerField.value ? String(controllerField.value) : ""}
                  onValueChange={(value) => controllerField.onChange(Number(value))}
                >
                  <SelectTrigger aria-label={`Ingredient for line ${index + 1}`} className="w-48">
                    <SelectValue placeholder="Select ingredient" />
                  </SelectTrigger>
                  <SelectContent>
                    {ingredients.map((ingredient) => (
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
              className="w-28"
              aria-label={`Quantity for line ${index + 1}`}
              {...register(`lines.${index}.quantity`, { setValueAs: toOptionalNumber })}
            />
            <Input
              type="text"
              placeholder="Unit"
              className="w-24"
              aria-label={`Unit for line ${index + 1}`}
              {...register(`lines.${index}.unit`)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => remove(index)}
              disabled={fields.length === 1}
            >
              Remove
            </Button>
          </div>
        ))}
        {errors.lines?.message ? (
          <p data-testid="field-error-lines" className="text-sm text-destructive">
            {errors.lines.message}
          </p>
        ) : null}
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => append({ ingredientId: undefined, quantity: undefined, unit: "g" })}
          >
            Add line
          </Button>
        </div>
      </div>

      {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

      <div>
        <Button type="submit">Save recipe</Button>
      </div>
    </form>
  );
}
