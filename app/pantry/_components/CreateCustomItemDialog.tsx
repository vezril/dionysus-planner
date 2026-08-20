"use client";

/**
 * openspec: custom-pantry-items — the one-step "Create custom item" dialog
 * on /pantry: product identity + nutrition + initial quantity (zero
 * allowed), submitted to `createCustomPantryItem` which writes the CUSTOM
 * ingredient and pantry row atomically. Same react-hook-form + zodResolver
 * + server-fieldErrors-via-setError pattern as the other forms (ADR-005).
 * Nutrition is entered per reference quantity (100 g / 100 mL / 1) like
 * every other ingredient — label-to-per-100g conversion is deliberately
 * the user's arithmetic this phase (design.md non-goal).
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm, type Resolver } from "react-hook-form";
import { createCustomPantryItem } from "@/app/actions/custom-pantry-item-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UNITS } from "@/domain/units";
import { referenceBasisFor, unitsForClass } from "@/domain/nutritionBasis";
import { MICRONUTRIENTS } from "@/domain/micronutrients";
import {
  customPantryItemSchema,
  type CustomPantryItemSchemaInput,
} from "@/domain/validation/customPantryItem.schema";

type FormValues = {
  name: string;
  unitClass: CustomPantryItemSchemaInput["unitClass"] | undefined;
  caloriesPerRef: number | undefined;
  proteinPerRef: number | undefined;
  carbsPerRef: number | undefined;
  fatPerRef: number | undefined;
  fiberPerRef: number | undefined;
  sugarPerRef: number | undefined;
  sodiumMgPerRef: number | undefined;
  alcoholGPerRef: number | undefined;
  micronutrients: Array<{ key: string; amountPerRef: number | undefined }>;
  brand: string | undefined;
  barcode: string | undefined;
  packageQuantity: number | undefined;
  packageUnit: string | undefined;
  initialQuantity: number | undefined;
  unit: string | undefined;
  nutritionBasisQuantity: number | undefined;
  nutritionBasisUnit: string | undefined;
};

const toOptionalNumber = (raw: string): number | undefined => (raw === "" ? undefined : Number(raw));
const emptyToUndefined = (raw: string): string | undefined => (raw.trim() === "" ? undefined : raw);

const UNIT_CLASS_OPTIONS = [
  { value: "MASS", label: "Mass" },
  { value: "VOLUME", label: "Volume" },
  { value: "COUNT", label: "Count" },
] as const;

const DEFAULT_VALUES: FormValues = {
  name: "",
  unitClass: undefined,
  caloriesPerRef: undefined,
  proteinPerRef: undefined,
  carbsPerRef: undefined,
  fatPerRef: undefined,
  fiberPerRef: undefined,
  sugarPerRef: undefined,
  sodiumMgPerRef: undefined,
  alcoholGPerRef: undefined,
  micronutrients: [],
  brand: undefined,
  barcode: undefined,
  packageQuantity: undefined,
  packageUnit: undefined,
  initialQuantity: undefined,
  unit: undefined,
  nutritionBasisQuantity: undefined,
  nutritionBasisUnit: undefined,
};

const NUTRITION_FIELDS: Array<{ name: keyof FormValues & string; label: string }> = [
  { name: "caloriesPerRef", label: "Calories" },
  { name: "proteinPerRef", label: "Protein" },
  { name: "carbsPerRef", label: "Carbs" },
  { name: "fatPerRef", label: "Fat" },
  { name: "fiberPerRef", label: "Fiber" },
  { name: "sugarPerRef", label: "Sugar" },
  { name: "sodiumMgPerRef", label: "Sodium" },
  { name: "alcoholGPerRef", label: "Alcohol" },
];

export function CreateCustomItemDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(customPantryItemSchema) as unknown as Resolver<FormValues>,
    defaultValues: DEFAULT_VALUES,
  });

  // openspec: vitamin-tracking — repeatable micronutrient rows (D3).
  const micronutrientRows = useFieldArray({ control, name: "micronutrients" });

  // openspec: nutrition-basis-and-edit — basis follows the selected class,
  // defaulting to its reference so an untouched form behaves as before.
  const watchedUnitClass = watch("unitClass");
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
    const result = await createCustomPantryItem(values);

    if (result.ok) {
      reset(DEFAULT_VALUES);
      setOpen(false);
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
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Create custom item
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create custom item</DialogTitle>
          </DialogHeader>

          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="custom-item-name" className="text-sm font-medium">
                Name
              </label>
              <Input id="custom-item-name" type="text" {...register("name")} />
              {errors.name ? (
                <p data-testid="field-error-name" className="text-sm text-destructive">
                  {errors.name.message}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="flex min-w-36 flex-1 flex-col gap-1">
                <label htmlFor="custom-item-brand" className="text-sm font-medium">
                  Brand (optional)
                </label>
                <Input id="custom-item-brand" type="text" {...register("brand", { setValueAs: emptyToUndefined })} />
              </div>
              <div className="flex min-w-36 flex-1 flex-col gap-1">
                <label htmlFor="custom-item-barcode" className="text-sm font-medium">
                  Barcode (optional)
                </label>
                <Input id="custom-item-barcode" type="text" inputMode="numeric" {...register("barcode", { setValueAs: emptyToUndefined })} />
                {errors.barcode ? (
                  <p data-testid="field-error-barcode" className="text-sm text-destructive">
                    {errors.barcode.message}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="flex min-w-28 flex-col gap-1">
                <label htmlFor="custom-item-package-quantity" className="text-sm font-medium">
                  Package size (optional)
                </label>
                <Input
                  id="custom-item-package-quantity"
                  type="number"
                  step="any"
                  {...register("packageQuantity", { setValueAs: toOptionalNumber })}
                />
              </div>
              <div className="flex min-w-20 flex-col gap-1">
                {/* openspec: count-via-package-size — a real unit key (any
                    class); drives COUNT↔MASS/VOLUME resolution. */}
                <span className="text-sm font-medium">Package unit</span>
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

            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Unit class</span>
              <Controller
                control={control}
                name="unitClass"
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger aria-label="Unit class">
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

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">
                Nutrition{" "}
                <span data-testid="nutrition-basis-label" className="font-normal text-muted-foreground">
                  (per {watchedBasisQuantity ?? "…"} {watchedBasisUnit ?? "— pick a unit class"})
                </span>
              </legend>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex min-w-24 flex-col gap-1">
                  <label htmlFor="custom-item-nutritionBasisQuantity" className="text-sm font-medium">
                    Values are per
                  </label>
                  <Input
                    id="custom-item-nutritionBasisQuantity"
                    type="number"
                    step="any"
                    {...register("nutritionBasisQuantity", { setValueAs: toOptionalNumber })}
                  />
                </div>
                <div className="flex min-w-24 flex-col gap-1">
                  <span className="text-sm font-medium">Basis unit</span>
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {NUTRITION_FIELDS.map(({ name, label }) => (
                  <div key={name} className="flex flex-col gap-1">
                    <label htmlFor={`custom-item-${name}`} className="text-sm font-medium">
                      {label}
                    </label>
                    <Input
                      id={`custom-item-${name}`}
                      type="number"
                      step="any"
                      {...register(name, { setValueAs: toOptionalNumber })}
                    />
                    {errors[name] ? (
                      <p data-testid={`field-error-${name}`} className="text-sm text-destructive">
                        {errors[name]?.message}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
              {/* openspec: vitamin-tracking — sparse rows, same basis as the
                  macros above. */}
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Micronutrients</span>
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
                      className="w-24"
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
              </div>
            </fieldset>

            <div className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-28 flex-col gap-1">
                <label htmlFor="custom-item-initial-quantity" className="text-sm font-medium">
                  On hand now (0 is fine)
                </label>
                <Input
                  id="custom-item-initial-quantity"
                  type="number"
                  step="any"
                  min="0"
                  {...register("initialQuantity", { setValueAs: toOptionalNumber })}
                />
              </div>
              <div className="flex min-w-24 flex-col gap-1">
                <span className="text-sm font-medium">Unit</span>
                <Controller
                  control={control}
                  name="unit"
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <SelectTrigger aria-label="Pantry unit">
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
              </div>
            </div>
            {errors.initialQuantity ? (
              <p data-testid="field-error-initialQuantity" className="text-sm text-destructive">
                {errors.initialQuantity.message}
              </p>
            ) : null}
            {errors.unit ? (
              <p data-testid="field-error-unit" className="text-sm text-destructive">
                {errors.unit.message}
              </p>
            ) : null}
            {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create item</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
