"use client";

/**
 * openspec: meal-log-integration — "cook a recipe" form: creates a
 * dionysus-service batch (cook event). Batches are immutable once created —
 * no edit form exists here, matching dionysus-service's own no-update
 * contract.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { createMealLogBatch } from "@/app/actions/meal-log-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mealLogBatchSchema } from "@/domain/validation/mealLog.schema";
import type { RecipeJson } from "@/services/dionysusService";

type FormValues = {
  recipeId: number | undefined;
  cookedAt: string;
  servingsMade: number | undefined;
};

const toOptionalNumber = (raw: string): number | undefined => (raw === "" ? undefined : Number(raw));

function nowLocalDatetimeValue(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export function CookBatchForm({ recipes }: { recipes: RecipeJson[] }) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(mealLogBatchSchema) as unknown as Resolver<FormValues>,
    defaultValues: {
      recipeId: undefined,
      cookedAt: nowLocalDatetimeValue(),
      servingsMade: undefined,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    const result = await createMealLogBatch({
      ...values,
      cookedAt: values.cookedAt ? new Date(values.cookedAt).toISOString() : values.cookedAt,
    });

    if (result.ok) {
      router.refresh();
      return;
    }

    if (result.error.fieldErrors) {
      for (const [field, messages] of Object.entries(result.error.fieldErrors)) {
        if (messages && messages.length > 0) {
          setError(field as keyof FormValues, { type: "server", message: messages[0] });
        }
      }
    } else {
      setSubmitError(result.error.message);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">Recipe</span>
        <Controller
          control={control}
          name="recipeId"
          render={({ field }) => (
            <Select value={field.value ? String(field.value) : ""} onValueChange={(v) => field.onChange(Number(v))}>
              <SelectTrigger aria-label="Recipe" className="max-w-sm">
                <SelectValue placeholder="Select recipe" />
              </SelectTrigger>
              <SelectContent>
                {recipes.map((recipe) => (
                  <SelectItem key={recipe.id} value={String(recipe.id)}>
                    {recipe.name} ({recipe.servings} servings)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.recipeId ? (
          <p data-testid="field-error-recipeId" className="text-sm text-destructive">
            {errors.recipeId.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="cook-batch-servings-made" className="text-sm font-medium text-foreground">
          Servings made
        </label>
        <Input
          id="cook-batch-servings-made"
          type="number"
          step="any"
          className="max-w-sm"
          {...register("servingsMade", { setValueAs: toOptionalNumber })}
        />
        {errors.servingsMade ? (
          <p data-testid="field-error-servingsMade" className="text-sm text-destructive">
            {errors.servingsMade.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="cook-batch-cooked-at" className="text-sm font-medium text-foreground">
          Cooked at
        </label>
        <Input
          id="cook-batch-cooked-at"
          type="datetime-local"
          className="max-w-sm"
          {...register("cookedAt")}
        />
      </div>

      {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

      <div>
        <Button type="submit">Cook batch</Button>
      </div>
    </form>
  );
}
