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
import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm, type Resolver } from "react-hook-form";
import { createIngredient, overrideIngredientNutrition } from "@/app/actions/ingredient-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ingredientSchema, type IngredientSchemaInput } from "@/domain/validation/ingredient.schema";
import { gramsPer100MlToAbvPercent } from "@/domain/abv";
import { referenceBasisFor, unitsForClass } from "@/domain/nutritionBasis";
import { MICRONUTRIENTS } from "@/domain/micronutrients";
import { UNITS } from "@/domain/units";

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
  nutritionBasisQuantity: number | undefined;
  nutritionBasisUnit: string | undefined;
  caloriesPerRef: number | undefined;
  proteinPerRef: number | undefined;
  carbsPerRef: number | undefined;
  fatPerRef: number | undefined;
  fiberPerRef: number | undefined;
  sugarPerRef: number | undefined;
  sodiumMgPerRef: number | undefined;
  alcoholGPerRef: number | undefined;
  saturatedFatGPerRef: number | undefined;
  transFatGPerRef: number | undefined;
  cholesterolMgPerRef: number | undefined;
  category: "FOOD" | "DRINK" | "SUPPLEMENT" | undefined;
  shelfLifeDays: number | undefined;
  genericOfId: number | undefined;
  readyToEat: boolean;
  /** openspec: ingredient-categories-auto-tags — comma-separated entry. */
  categoriesText: string;
  /** openspec: ratings-variants-links — one URL per line. */
  merchantLinksText: string;
  alcoholAbvPercent: number | undefined;
  micronutrients: Array<{ key: string; amountPerRef: number | undefined }>;
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
  alcoholGPerRef: number | null;
  saturatedFatGPerRef: number | null;
  transFatGPerRef: number | null;
  cholesterolMgPerRef: number | null;
  category: "FOOD" | "DRINK" | "SUPPLEMENT";
  shelfLifeDays: number | null;
  genericOfId: number | null;
  readyToEat: boolean;
  categories?: string[];
  merchantLinks?: string[];
  micronutrients?: Array<{ key: string; amountPerRef: number }>;
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
      nutritionBasisQuantity: undefined,
      nutritionBasisUnit: undefined,
      caloriesPerRef: undefined,
      proteinPerRef: undefined,
      carbsPerRef: undefined,
      fatPerRef: undefined,
      fiberPerRef: undefined,
      sugarPerRef: undefined,
      sodiumMgPerRef: undefined,
      alcoholGPerRef: undefined,
      saturatedFatGPerRef: undefined,
      transFatGPerRef: undefined,
      cholesterolMgPerRef: undefined,
      category: "FOOD",
      shelfLifeDays: undefined,
      genericOfId: undefined,
      readyToEat: false,
      categoriesText: "",
      merchantLinksText: "",
      alcoholAbvPercent: undefined,
      micronutrients: [],
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
    // Stored values are per-reference; the edit form states that basis
    // explicitly (design.md: no original-basis reconstruction).
    nutritionBasisQuantity: referenceBasisFor(initial.unitClass).quantity,
    nutritionBasisUnit: referenceBasisFor(initial.unitClass).unit,
    caloriesPerRef: initial.caloriesPerRef,
    proteinPerRef: initial.proteinPerRef,
    carbsPerRef: initial.carbsPerRef,
    fatPerRef: initial.fatPerRef,
    fiberPerRef: initial.fiberPerRef ?? undefined,
    sugarPerRef: initial.sugarPerRef ?? undefined,
    sodiumMgPerRef: initial.sodiumMgPerRef ?? undefined,
    alcoholGPerRef: initial.alcoholGPerRef ?? undefined,
    saturatedFatGPerRef: initial.saturatedFatGPerRef ?? undefined,
    transFatGPerRef: initial.transFatGPerRef ?? undefined,
    cholesterolMgPerRef: initial.cholesterolMgPerRef ?? undefined,
    category: initial.category,
    shelfLifeDays: initial.shelfLifeDays ?? undefined,
    genericOfId: initial.genericOfId ?? undefined,
    readyToEat: initial.readyToEat,
    categoriesText: (initial.categories ?? []).join(", "),
    merchantLinksText: (initial.merchantLinks ?? []).join("\n"),
    // openspec: batch-nutrition-and-abv-entry — VOLUME drinks edit in ABV.
    alcoholAbvPercent:
      initial.unitClass === "VOLUME" && initial.category === "DRINK" && initial.alcoholGPerRef != null
        ? gramsPer100MlToAbvPercent(initial.alcoholGPerRef)
        : undefined,
    micronutrients: initial.micronutrients ?? [],
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
    | "alcoholGPerRef"
    | "saturatedFatGPerRef"
    | "transFatGPerRef"
    | "cholesterolMgPerRef"
    | "shelfLifeDays"
    | "densityGPerMl"
  );
  label: string;
}


const CATEGORY_OPTIONS = [
  { value: "FOOD", label: "Food" },
  { value: "DRINK", label: "Drink" },
  { value: "SUPPLEMENT", label: "Supplement" },
] as const;

const NUMBER_FIELDS: NumberFieldConfig[] = [
  { name: "caloriesPerRef", label: "Calories (kcal)" },
  { name: "proteinPerRef", label: "Protein (g)" },
  { name: "carbsPerRef", label: "Carbs (g)" },
  { name: "fatPerRef", label: "Fat (g)" },
  { name: "fiberPerRef", label: "Fiber (g)" },
  { name: "sugarPerRef", label: "Sugar (g)" },
  { name: "sodiumMgPerRef", label: "Sodium (mg)" },
  { name: "alcoholGPerRef", label: "Alcohol (g)" },
  { name: "saturatedFatGPerRef", label: "Saturated fat (g)" },
  { name: "transFatGPerRef", label: "Trans fat (g)" },
  { name: "cholesterolMgPerRef", label: "Cholesterol (mg)" },
  { name: "densityGPerMl", label: "Density (g/mL)" },
  { name: "shelfLifeDays", label: "Shelf life (days)" },
];

export function IngredientForm({
  mode,
  ingredientId,
  initialValues,
  genericOptions = [],
}: {
  mode: "create" | "edit";
  ingredientId?: number;
  initialValues?: IngredientFormInitialValues;
  genericOptions?: Array<{ id: number; name: string; unitClass: "MASS" | "VOLUME" | "COUNT" }>;
}) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  // openspec: category-defaults — on leaving the categories field, fill
  // EMPTY nutrition fields from the deepest matching category defaults.
  const [prefillNote, setPrefillNote] = useState<string | null>(null);
  async function prefillFromCategories(raw: string) {
    const categories = raw.split(",").map((value) => value.trim()).filter(Boolean);
    if (categories.length === 0) return;
    try {
      const response = await fetch(`/api/category-defaults?categories=${encodeURIComponent(categories.join(","))}`);
      if (!response.ok) return;
      const defaults = (await response.json()) as {
        displayPath: string;
        caloriesPerRef: number | null;
        proteinPerRef: number | null;
        carbsPerRef: number | null;
        fatPerRef: number | null;
        alcoholAbvPercent: number | null;
      };
      const fill = (field: string, value: number | null) => {
        if (value === null) return false;
        const current = getValues(field as never) as unknown;
        if (current !== undefined && current !== null && current !== "") return false;
        setValue(field as never, value as never, { shouldDirty: true });
        return true;
      };
      const filled = [
        fill("caloriesPerRef", defaults.caloriesPerRef),
        fill("proteinPerRef", defaults.proteinPerRef),
        fill("carbsPerRef", defaults.carbsPerRef),
        fill("fatPerRef", defaults.fatPerRef),
        fill("alcoholAbvPercent", defaults.alcoholAbvPercent),
      ].some(Boolean);
      if (filled) setPrefillNote(`Prefilled from ${defaults.displayPath} defaults (per 100 g/mL).`);
    } catch {
      // best-effort; the form stays as typed
    }
  }


  const {
    register,
    handleSubmit,
    control,
    setError,
    setValue,
    getValues,
    watch,
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

  // openspec: vitamin-tracking — repeatable micronutrient rows (D3).
  const micronutrientRows = useFieldArray({ control, name: "micronutrients" });

  // openspec: nutrition-basis-and-edit — the basis follows the selected
  // unit class, defaulting to that class's reference (100 g / 100 mL / 1)
  // so an untouched form behaves exactly as before.
  const watchedUnitClass = watch("unitClass");
  const watchedCategory = watch("category");
  const watchedBasisQuantity = watch("nutritionBasisQuantity");
  const watchedBasisUnit = watch("nutritionBasisUnit");
  useEffect(() => {
    if (!watchedUnitClass) return;
    const reference = referenceBasisFor(watchedUnitClass);
    const unitStillValid =
      watchedBasisUnit != null && unitsForClass(watchedUnitClass).includes(watchedBasisUnit);
    if (!unitStillValid) {
      setValue("nutritionBasisQuantity", reference.quantity);
      setValue("nutritionBasisUnit", reference.unit);
    }
  }, [watchedUnitClass, watchedBasisUnit, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    // zodResolver strips unknown keys from `values` — read the raw input.
    const payload = {
      ...values,
      categories: (getValues("categoriesText") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
      merchantLinks: (getValues("merchantLinksText") ?? "").split("\n").map((url) => url.trim()).filter(Boolean),
    };
    const result =
      mode === "create"
        ? await createIngredient(payload)
        : await overrideIngredientNutrition(ingredientId!, payload);

    if (result.ok) {
      router.push("/ingredients");
      return;
    }

    if (result.error.fieldErrors) {
      for (const [field, messages] of Object.entries(result.error.fieldErrors)) {
        if (messages && messages.length > 0) {
          // Text-entry fields validated server-side under their parsed names.
          const target = field === "merchantLinks" ? "merchantLinksText" : field === "categories" ? "categoriesText" : field;
          setError(target as keyof FormValues, { type: "server", message: messages[0] });
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

      {/* openspec: drinks-and-abv — what kind of consumable this is. */}
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">Category</span>
        <Controller
          control={control}
          name="category"
          render={({ field }) => (
            <Select value={field.value ?? "FOOD"} onValueChange={field.onChange}>
              <SelectTrigger aria-label="Category" className="max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {/* openspec: ingredient-categories-auto-tags */}
      <div className="flex max-w-sm flex-col gap-1">
        <label htmlFor="ingredient-categories" className="text-sm font-medium">
          Categories{" "}
          <span className="font-normal text-muted-foreground">(comma-separated; nest with / like Rhum/Agricole — recipes inherit every level)</span>
        </label>
        <input
          id="ingredient-categories"
          type="text"
          placeholder="Rhum/Lightly Aged Pot Rhum, fish"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          {...register("categoriesText")}
          onBlur={(event) => void prefillFromCategories(event.target.value)}
        />
        {prefillNote ? (
          <p data-testid="category-prefill-note" className="text-xs text-status-cookable">{prefillNote}</p>
        ) : null}
      </div>

      {/* openspec: ratings-variants-links — local stores carrying this
          product; future demeter deal-finding input. */}
      <div className="flex max-w-sm flex-col gap-1">
        <label htmlFor="ingredient-merchant-links" className="text-sm font-medium">
          Merchant links{" "}
          <span className="font-normal text-muted-foreground">(one URL per line)</span>
        </label>
        <textarea
          id="ingredient-merchant-links"
          rows={3}
          placeholder="https://store.example/salmon"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          {...register("merchantLinksText")}
        />
        {errors.merchantLinksText ? (
          <p data-testid="field-error-merchantLinks" className="text-sm text-destructive">
            {errors.merchantLinksText.message ?? "Invalid merchant link."}
          </p>
        ) : null}
      </div>

      {/* openspec: pantry-quick-eat — eatable straight from the pantry;
          still fully usable inside recipes. */}
      <label className="flex max-w-sm items-center gap-2 text-sm font-medium text-foreground">
        <input type="checkbox" {...register("readyToEat")} />
        Ready to consume (can be eaten or drunk straight from the pantry)
      </label>

      {/* openspec: generic-products — link a branded product to its
          generic ("Butter"); same-class generics only, none until a class
          is chosen. */}
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">Generic of (optional)</span>
        <Controller
          control={control}
          name="genericOfId"
          render={({ field }) => (
            <Select
              value={field.value?.toString() ?? "none"}
              onValueChange={(value) => field.onChange(value === "none" ? undefined : Number(value))}
              disabled={!watchedUnitClass}
            >
              <SelectTrigger aria-label="Generic of" className="max-w-sm">
                <SelectValue placeholder="None — this IS a generic" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None — this IS a generic</SelectItem>
                {genericOptions
                  .filter((option) => option.unitClass === watchedUnitClass && option.id !== ingredientId)
                  .map((option) => (
                    <SelectItem key={option.id} value={option.id.toString()}>
                      {option.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.genericOfId ? (
          <p data-testid="field-error-genericOfId" className="text-sm text-destructive">
            {errors.genericOfId.message}
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
          {/* openspec: count-via-package-size — a real unit key (any class),
              since the package size now drives COUNT↔MASS/VOLUME resolution. */}
          <span className="text-sm font-medium text-foreground">Package unit</span>
          <Controller
            control={control}
            name="packageUnit"
            render={({ field }) => (
              <Select value={field.value ?? ""} onValueChange={field.onChange}>
                <SelectTrigger aria-label="Package unit">
                  <SelectValue placeholder="Unit" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(UNITS).map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.packageUnit ? (
            <p data-testid="field-error-packageUnit" className="text-sm text-destructive">
              {errors.packageUnit.message}
            </p>
          ) : null}
        </div>
      </div>

      {/* openspec: nutrition-basis-and-edit — enter label values against
          any same-class basis; the action converts to per-reference. */}
      <div className="flex max-w-sm flex-wrap items-end gap-3">
        <div className="flex min-w-28 flex-1 flex-col gap-1">
          <label htmlFor="ingredient-nutritionBasisQuantity" className="text-sm font-medium text-foreground">
            Nutrition values are per
          </label>
          <Input
            id="ingredient-nutritionBasisQuantity"
            type="number"
            step="any"
            {...register("nutritionBasisQuantity", { setValueAs: toOptionalNumber })}
          />
        </div>
        <div className="flex min-w-24 flex-col gap-1">
          <span className="text-sm font-medium text-foreground">Basis unit</span>
          <Controller
            control={control}
            name="nutritionBasisUnit"
            render={({ field }) => (
              <Select
                value={field.value ?? ""}
                onValueChange={field.onChange}
                disabled={!watchedUnitClass}
              >
                <SelectTrigger aria-label="Basis unit">
                  <SelectValue placeholder="Unit" />
                </SelectTrigger>
                <SelectContent>
                  {(watchedUnitClass ? unitsForClass(watchedUnitClass) : []).map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>
      {errors.nutritionBasisUnit ? (
        <p data-testid="field-error-nutritionBasisUnit" className="text-sm text-destructive">
          {errors.nutritionBasisUnit.message}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Nutrition below is per{" "}
        <span data-testid="nutrition-basis-label" className="font-medium">
          {watchedBasisQuantity ?? "—"} {watchedBasisUnit ?? ""}
        </span>
        {" "}— stored per {watchedUnitClass === "COUNT" ? "1" : "100"}{" "}
        {watchedUnitClass === "VOLUME" ? "mL" : watchedUnitClass === "COUNT" ? "count" : "g"} automatically.
      </p>

      {/* openspec: batch-nutrition-and-abv-entry — VOLUME drinks enter
          label ABV instead of grams; stored as grams via ethanol density. */}
      {watchedUnitClass === "VOLUME" && watchedCategory === "DRINK" ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="ingredient-alcoholAbvPercent" className="text-sm font-medium text-foreground">
            Alcohol (% ABV)
          </label>
          <Input
            id="ingredient-alcoholAbvPercent"
            type="number"
            step="any"
            className="max-w-sm"
            {...register("alcoholAbvPercent", { setValueAs: toOptionalNumber })}
          />
          {errors.alcoholAbvPercent ? (
            <p data-testid="field-error-alcoholAbvPercent" className="text-sm text-destructive">
              {errors.alcoholAbvPercent.message}
            </p>
          ) : null}
        </div>
      ) : null}
      {NUMBER_FIELDS.filter(
        ({ name }) => !(name === "alcoholGPerRef" && watchedUnitClass === "VOLUME" && watchedCategory === "DRINK"),
      ).map(({ name, label }) => (
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
          {name === "alcoholGPerRef" ? (
            <p data-testid="abv-hint" className="text-xs text-muted-foreground">
              Drinks measured in volume enter % ABV instead — set Category to Drink and Unit class to Volume.
            </p>
          ) : null}
        </div>
      ))}

      {/* openspec: vitamin-tracking — sparse micronutrient rows, entered
          against the same basis as the macros above. */}
      <fieldset className="flex max-w-sm flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">Micronutrients</legend>
        {micronutrientRows.fields.map((row, index) => (
          <div key={row.id} className="flex flex-wrap items-center gap-2" data-testid="micronutrient-row">
            <Controller
              control={control}
              name={`micronutrients.${index}.key`}
              render={({ field }) => (
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Micronutrient" className="min-w-40">
                    <SelectValue placeholder="Nutrient" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(MICRONUTRIENTS).map(([key, def]) => (
                      <SelectItem key={key} value={key}>
                        {def.label} ({def.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <Input
              aria-label="Micronutrient amount"
              type="number"
              step="any"
              className="w-28"
              {...register(`micronutrients.${index}.amountPerRef`, { setValueAs: toOptionalNumber })}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => micronutrientRows.remove(index)}>
              Remove
            </Button>
            {errors.micronutrients?.[index]?.amountPerRef ? (
              <p className="w-full text-sm text-destructive">Enter a positive amount.</p>
            ) : null}
          </div>
        ))}
        {errors.micronutrients?.root?.message || errors.micronutrients?.message ? (
          <p data-testid="field-error-micronutrients" className="text-sm text-destructive">
            {errors.micronutrients?.root?.message ?? errors.micronutrients?.message}
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => micronutrientRows.append({ key: "", amountPerRef: undefined })}
        >
          Add micronutrient
        </Button>
      </fieldset>

      {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

      <div>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}
