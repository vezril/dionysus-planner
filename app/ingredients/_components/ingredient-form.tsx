"use client";

/**
 * S-302 shared create/override ingredient form (client component, ADR-002).
 * Used by both `/app/ingredients/new/page.tsx` (create) and
 * `/app/ingredients/[id]/edit/page.tsx` (override) — same field set, same
 * `ingredientSchema` (ADR-005) via `react-hook-form` + `@hookform/resolvers
 * /zod`, same "Save" contract, per tests/e2e/ingredient-edit.spec.ts's
 * pinned UI contract.
 *
 * Each violated field renders `data-testid="field-error-<schemaKey>"` —
 * the schema key verbatim — which is also what a rejected Server Action
 * response's `error.fieldErrors` is keyed by (ADR-005: same shape client
 * and server), so a server-side rejection (defense in depth, e.g. a race
 * the client validation didn't catch) maps onto the same inline slots via
 * `setError`.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { createIngredient, overrideIngredientNutrition } from "@/app/actions/ingredient-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ingredientSchema, type IngredientSchemaInput } from "@/domain/validation/ingredient.schema";

const UNIT_CLASS_OPTIONS: Array<{ value: IngredientSchemaInput["unitClass"]; label: string }> = [
  { value: "MASS", label: "Mass" },
  { value: "VOLUME", label: "Volume" },
  { value: "COUNT", label: "Count" },
];

/** Raw form-field shape: numeric inputs are strings on the DOM; empty
 * string is normalized to `undefined` before `ingredientSchema` sees it
 * (so a blank required field fails as "required", not as `0`, and a blank
 * optional field parses as absent, per A-1). */
type FormValues = {
  name: string;
  unitClass: IngredientSchemaInput["unitClass"] | undefined;
  brand: string | undefined;
  barcode: string | undefined;
  packageQuantity: number | undefined;
  packageUnit: string | undefined;
  caloriesPerRef: number | undefined;
  proteinPerRef: number | undefined;
  carbsPerRef: number | undefined;
  fatPerRef: number | undefined;
  fiberPerRef: number | undefined;
  sugarPerRef: number | undefined;
  sodiumMgPerRef: number | undefined;
  densityGPerMl: number | undefined;
};

export interface IngredientFormInitialValues {
  name: string;
  unitClass: IngredientSchemaInput["unitClass"];
  brand: string | null;
  barcode: string | null;
  packageQuantity: number | null;
  packageUnit: string | null;
  caloriesPerRef: number;
  proteinPerRef: number;
  carbsPerRef: number;
  fatPerRef: number;
  fiberPerRef: number | null;
  sugarPerRef: number | null;
  sodiumMgPerRef: number | null;
  densityGPerMl: number | null;
}

function toDefaultValues(initial?: IngredientFormInitialValues): FormValues {
  if (!initial) {
    return {
      name: "",
      unitClass: undefined,
      brand: undefined,
      barcode: undefined,
      packageQuantity: undefined,
      packageUnit: undefined,
      caloriesPerRef: undefined,
      proteinPerRef: undefined,
      carbsPerRef: undefined,
      fatPerRef: undefined,
      fiberPerRef: undefined,
      sugarPerRef: undefined,
      sodiumMgPerRef: undefined,
      densityGPerMl: undefined,
    };
  }
  return {
    name: initial.name,
    unitClass: initial.unitClass,
    brand: initial.brand ?? undefined,
    barcode: initial.barcode ?? undefined,
    packageQuantity: initial.packageQuantity ?? undefined,
    packageUnit: initial.packageUnit ?? undefined,
    caloriesPerRef: initial.caloriesPerRef,
    proteinPerRef: initial.proteinPerRef,
    carbsPerRef: initial.carbsPerRef,
    fatPerRef: initial.fatPerRef,
    fiberPerRef: initial.fiberPerRef ?? undefined,
    sugarPerRef: initial.sugarPerRef ?? undefined,
    sodiumMgPerRef: initial.sodiumMgPerRef ?? undefined,
    densityGPerMl: initial.densityGPerMl ?? undefined,
  };
}

const toOptionalNumber = (raw: string): number | undefined => (raw === "" ? undefined : Number(raw));
// openspec: custom-pantry-items — empty text inputs are "" on the DOM; the
// schema's optional strings are absent-or-non-empty, so normalize before
// the zodResolver runs.
const emptyToUndefined = (raw: string): string | undefined => (raw.trim() === "" ? undefined : raw);

interface NumberFieldConfig {
  name: keyof FormValues & (
    | "caloriesPerRef"
    | "proteinPerRef"
    | "carbsPerRef"
    | "fatPerRef"
    | "fiberPerRef"
    | "sugarPerRef"
    | "sodiumMgPerRef"
    | "densityGPerMl"
  );
  label: string;
}

const NUMBER_FIELDS: NumberFieldConfig[] = [
  { name: "caloriesPerRef", label: "Calories" },
  { name: "proteinPerRef", label: "Protein" },
  { name: "carbsPerRef", label: "Carbs" },
  { name: "fatPerRef", label: "Fat" },
  { name: "fiberPerRef", label: "Fiber" },
  { name: "sugarPerRef", label: "Sugar" },
  { name: "sodiumMgPerRef", label: "Sodium" },
  { name: "densityGPerMl", label: "Density" },
];

export function IngredientForm({
  mode,
  ingredientId,
  initialValues,
}: {
  mode: "create" | "edit";
  ingredientId?: number;
  initialValues?: IngredientFormInitialValues;
}) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    // `FormValues` intentionally widens every schema-required field to
    // `| undefined` (so blank inputs mid-typing type-check) — `zodResolver`'s
    // inferred type otherwise requires the post-parse shape. The runtime
    // contract is unaffected: `ingredientSchema.safeParse` still re-checks
    // every value, undefined-or-not.
    resolver: zodResolver(ingredientSchema) as unknown as Resolver<FormValues>,
    defaultValues: toDefaultValues(initialValues),
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    const result =
      mode === "create"
        ? await createIngredient(values)
        : await overrideIngredientNutrition(ingredientId!, values);

    if (result.ok) {
      router.push("/ingredients");
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
        <label htmlFor="ingredient-name" className="text-sm font-medium text-foreground">
          Name
        </label>
        <Input id="ingredient-name" type="text" className="max-w-sm" {...register("name")} />
        {errors.name ? (
          <p data-testid="field-error-name" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">Unit class</span>
        <Controller
          control={control}
          name="unitClass"
          render={({ field }) => (
            <Select value={field.value ?? ""} onValueChange={field.onChange}>
              <SelectTrigger aria-label="Unit class" className="max-w-sm">
                <SelectValue placeholder="Select unit class" />
              </SelectTrigger>
              <SelectContent>
                {UNIT_CLASS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.unitClass ? (
          <p data-testid="field-error-unitClass" className="text-sm text-destructive">
            {errors.unitClass.message}
          </p>
        ) : null}
      </div>

      {/* openspec: custom-pantry-items — optional product identity, for
          branded items (barcode = the future scanner app's lookup key). */}
      <div className="flex flex-col gap-1">
        <label htmlFor="ingredient-brand" className="text-sm font-medium text-foreground">
          Brand (optional)
        </label>
        <Input id="ingredient-brand" type="text" className="max-w-sm" {...register("brand", { setValueAs: emptyToUndefined })} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="ingredient-barcode" className="text-sm font-medium text-foreground">
          Barcode (optional)
        </label>
        <Input id="ingredient-barcode" type="text" inputMode="numeric" className="max-w-sm" {...register("barcode", { setValueAs: emptyToUndefined })} />
        {errors.barcode ? (
          <p data-testid="field-error-barcode" className="text-sm text-destructive">
            {errors.barcode.message}
          </p>
        ) : null}
      </div>
      <div className="flex max-w-sm flex-wrap gap-3">
        <div className="flex min-w-32 flex-1 flex-col gap-1">
          <label htmlFor="ingredient-packageQuantity" className="text-sm font-medium text-foreground">
            Package size (optional)
          </label>
          <Input
            id="ingredient-packageQuantity"
            type="number"
            step="any"
            {...register("packageQuantity", { setValueAs: toOptionalNumber })}
          />
        </div>
        <div className="flex min-w-24 flex-col gap-1">
          <label htmlFor="ingredient-packageUnit" className="text-sm font-medium text-foreground">
            Package unit
          </label>
          <Input id="ingredient-packageUnit" type="text" {...register("packageUnit", { setValueAs: emptyToUndefined })} />
          {errors.packageUnit ? (
            <p data-testid="field-error-packageUnit" className="text-sm text-destructive">
              {errors.packageUnit.message}
            </p>
          ) : null}
        </div>
      </div>

      {NUMBER_FIELDS.map(({ name, label }) => (
        <div key={name} className="flex flex-col gap-1">
          <label htmlFor={`ingredient-${name}`} className="text-sm font-medium text-foreground">
            {label}
          </label>
          <Input
            id={`ingredient-${name}`}
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

      {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

      <div>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}
