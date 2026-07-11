"use client";

/**
 * S-304 pantry add/upsert dialog (client component, ADR-002/ADR-006).
 * Rendered by `/app/pantry/page.tsx` from both the persistent header
 * trigger ("Add pantry item") and the FR-29 empty-state CTA ("Add your
 * first pantry item") — same dialog contract either way (accessible name
 * "Add pantry item", per tests/e2e/pantry.spec.ts's pinned UI contract).
 *
 * Ingredient picker is a hand-rolled accessible combobox (role="combobox"
 * text input + role="listbox"/"option" suggestions) over
 * `/api/ingredients?q=` (S-301's reusable search route) — not shadcn's
 * Command/Popover pattern, because that pattern's trigger is a *button*
 * (opening a separate search input inside a popover), while this suite's
 * pinned contract types directly into the combobox itself. Unit picker
 * reuses shadcn's `<Select>` (Radix gives its trigger `role="combobox"` by
 * construction, matching `ingredient-form.tsx`'s established pattern).
 *
 * `pantryItemSchema` (ADR-005) drives client-side validation via
 * `react-hook-form` + `@hookform/resolvers/zod`; the Server Action
 * independently re-validates the same schema (defense in depth). The
 * increment/replace choice UI surfaces the Server Action's `NEEDS_CHOICE`
 * / `INCREMENT_REJECTED_NO_DENSITY` error messages verbatim — a single
 * source of truth for that copy, per architecture.md §4's human-confirmed
 * "never a silent guess" rule.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { addOrUpdatePantryItem, type PantryActionResult } from "@/app/actions/pantry-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UNITS } from "@/domain/units";
import { pantryItemSchema } from "@/domain/validation/pantryItem.schema";

const UNIT_KEYS = Object.keys(UNITS);

interface IngredientOption {
  id: number;
  name: string;
}

/** Raw form-field shape: blank inputs mid-typing type-check as `undefined`
 * (same convention as `ingredient-form.tsx`) so a blank required field
 * fails validation as "required"/"select"/"positive", not as `0`. */
type FormValues = {
  ingredientId: number | undefined;
  quantity: number | undefined;
  unit: string | undefined;
};

const EMPTY_VALUES: FormValues = { ingredientId: undefined, quantity: undefined, unit: undefined };

const toOptionalNumber = (raw: string): number | undefined => (raw === "" ? undefined : Number(raw));

type Phase = "form" | "needs-choice" | "rejected";

export function PantryItemForm({ triggerLabel }: { triggerLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [ingredientQuery, setIngredientQuery] = useState("");
  const [ingredientOptions, setIngredientOptions] = useState<IngredientOption[]>([]);
  const [listboxOpen, setListboxOpen] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    getValues,
    setValue,
    setError,
    clearErrors,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(pantryItemSchema) as unknown as Resolver<FormValues>,
    defaultValues: EMPTY_VALUES,
  });

  const selectedIngredientId = watch("ingredientId");

  useEffect(() => {
    if (!open || !ingredientQuery) {
      setIngredientOptions([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/ingredients?q=${encodeURIComponent(ingredientQuery)}`)
      .then((res) => res.json())
      .then((data: IngredientOption[]) => {
        if (!cancelled) setIngredientOptions(data);
      })
      .catch(() => {
        if (!cancelled) setIngredientOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ingredientQuery, open]);

  function resetAll() {
    reset(EMPTY_VALUES);
    setIngredientQuery("");
    setIngredientOptions([]);
    setListboxOpen(false);
    setPhase("form");
    setStatusMessage(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      resetAll();
    }
  }

  function closeAndRefresh() {
    setOpen(false);
    resetAll();
    router.refresh();
  }

  function handleIngredientInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setIngredientQuery(value);
    setValue("ingredientId", undefined);
    clearErrors("ingredientId");
    setListboxOpen(true);
  }

  function selectIngredient(option: IngredientOption) {
    setValue("ingredientId", option.id, { shouldValidate: true });
    setIngredientQuery(option.name);
    setListboxOpen(false);
    clearErrors("ingredientId");
  }

  async function handleResult(result: PantryActionResult) {
    if (result.ok) {
      closeAndRefresh();
      return;
    }

    if (result.error.code === "VALIDATION_ERROR") {
      for (const [field, messages] of Object.entries(result.error.fieldErrors ?? {})) {
        if (messages && messages.length > 0 && (field === "ingredientId" || field === "quantity" || field === "unit")) {
          setError(field as keyof FormValues, { type: "server", message: messages[0] });
        }
      }
      return;
    }

    if (result.error.code === "NEEDS_CHOICE") {
      setPhase("needs-choice");
      setStatusMessage(result.error.message);
      return;
    }

    // INCREMENT_REJECTED_NO_DENSITY
    setPhase("rejected");
    setStatusMessage(result.error.message);
  }

  const onSubmit = handleSubmit(async (values) => {
    const result = await addOrUpdatePantryItem({
      ingredientId: values.ingredientId!,
      quantity: values.quantity!,
      unit: values.unit!,
    });
    await handleResult(result);
  });

  async function submitWithMode(mode: "increment" | "replace") {
    const values = getValues();
    if (values.ingredientId === undefined || values.quantity === undefined || values.unit === undefined) {
      return;
    }
    const result = await addOrUpdatePantryItem({
      ingredientId: values.ingredientId,
      quantity: values.quantity,
      unit: values.unit,
      mode,
    });
    await handleResult(result);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add pantry item</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="relative flex flex-col gap-1">
            <label htmlFor="pantry-ingredient" className="text-sm font-medium text-foreground">
              Ingredient
            </label>
            <input
              id="pantry-ingredient"
              role="combobox"
              aria-expanded={listboxOpen}
              aria-controls="pantry-ingredient-listbox"
              aria-autocomplete="list"
              autoComplete="off"
              className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
              value={ingredientQuery}
              onChange={handleIngredientInputChange}
              onFocus={() => {
                if (ingredientOptions.length > 0) setListboxOpen(true);
              }}
            />
            {listboxOpen && ingredientOptions.length > 0 ? (
              <ul
                id="pantry-ingredient-listbox"
                role="listbox"
                className="absolute top-full z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-input bg-popover text-popover-foreground shadow-md"
              >
                {ingredientOptions.map((option) => (
                  <li
                    key={option.id}
                    role="option"
                    aria-selected={selectedIngredientId === option.id}
                    className="cursor-pointer px-2.5 py-1.5 text-sm hover:bg-muted"
                    onClick={() => selectIngredient(option)}
                  >
                    {option.name}
                  </li>
                ))}
              </ul>
            ) : null}
            {errors.ingredientId ? (
              <p data-testid="field-error-ingredientId" className="text-sm text-destructive">
                {errors.ingredientId.message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="pantry-quantity" className="text-sm font-medium text-foreground">
              Quantity
            </label>
            <Input
              id="pantry-quantity"
              type="number"
              step="any"
              className="max-w-sm"
              {...register("quantity", { setValueAs: toOptionalNumber })}
            />
            {errors.quantity ? (
              <p data-testid="field-error-quantity" className="text-sm text-destructive">
                {errors.quantity.message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">Unit</span>
            <Controller
              control={control}
              name="unit"
              render={({ field }) => (
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Unit" className="max-w-sm">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_KEYS.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.unit ? (
              <p data-testid="field-error-unit" className="text-sm text-destructive">
                {errors.unit.message}
              </p>
            ) : null}
          </div>

          {phase !== "form" && statusMessage ? (
            <p role="status" className="text-sm text-muted-foreground">
              {statusMessage}
            </p>
          ) : null}

          {phase === "form" ? (
            <div>
              <Button type="submit">Save</Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button type="button" onClick={() => submitWithMode("increment")}>
                Increment
              </Button>
              <Button type="button" variant="outline" onClick={() => submitWithMode("replace")}>
                Replace
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
