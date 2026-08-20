"use client";

/**
 * openspec: meal-log-integration — create form for a dionysus-service
 * ingredient. Same react-hook-form + zodResolver + `setError`-from-fieldErrors
 * pattern as `app/ingredients/_components/ingredient-form.tsx`, over the
 * Meal Log schema instead.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { createMealLogIngredient } from "@/app/actions/meal-log-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mealLogIngredientSchema } from "@/domain/validation/mealLog.schema";

type FormValues = {
  name: string;
  caloriesKcal: number | undefined;
  proteinG: number | undefined;
  carbsG: number | undefined;
  fatG: number | undefined;
  sodiumMg: number | undefined;
  abvPercent: number | undefined;
  directlyLoggable: boolean;
};

const toOptionalNumber = (raw: string): number | undefined => (raw === "" ? undefined : Number(raw));

const NUMBER_FIELDS: Array<{ name: keyof FormValues & string; label: string }> = [
  { name: "caloriesKcal", label: "Calories (kcal)" },
  { name: "proteinG", label: "Protein (g)" },
  { name: "carbsG", label: "Carbs (g)" },
  { name: "fatG", label: "Fat (g)" },
  { name: "sodiumMg", label: "Sodium (mg)" },
  { name: "abvPercent", label: "ABV % (optional, for alcohol)" },
];

export function MealLogIngredientForm() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(mealLogIngredientSchema) as unknown as Resolver<FormValues>,
    defaultValues: {
      name: "",
      caloriesKcal: undefined,
      proteinG: undefined,
      carbsG: undefined,
      fatG: undefined,
      sodiumMg: undefined,
      abvPercent: undefined,
      directlyLoggable: false,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    const result = await createMealLogIngredient(values);

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
        <label htmlFor="meal-log-ingredient-name" className="text-sm font-medium text-foreground">
          Name
        </label>
        <Input id="meal-log-ingredient-name" type="text" className="max-w-sm" {...register("name")} />
        {errors.name ? (
          <p data-testid="field-error-name" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        ) : null}
      </div>

      {NUMBER_FIELDS.map(({ name, label }) => (
        <div key={name} className="flex flex-col gap-1">
          <label htmlFor={`meal-log-ingredient-${name}`} className="text-sm font-medium text-foreground">
            {label}
          </label>
          <Input
            id={`meal-log-ingredient-${name}`}
            type="number"
            step="any"
            className="max-w-sm"
            {...register(name, { setValueAs: toOptionalNumber })}
          />
          {errors[name] ? (
            <p data-testid={`field-error-${name}`} className="text-sm text-destructive">
              {errors[name]?.message}
            </p>
          ) : null}
        </div>
      ))}

      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
        <input type="checkbox" {...register("directlyLoggable")} />
        Directly loggable (can be logged in a meal on its own, e.g. a beer or a protein bar)
      </label>

      {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

      <div>
        <Button type="submit">Add product</Button>
      </div>
    </form>
  );
}
