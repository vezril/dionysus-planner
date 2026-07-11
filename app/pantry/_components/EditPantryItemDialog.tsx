"use client";

/**
 * S-305 pantry item edit dialog (client component, ADR-002/ADR-006).
 * Reuses `PantryItemForm`'s conventions (react-hook-form + zod resolver,
 * shadcn Dialog/Select) but in "edit" mode: only quantity/unit are
 * editable, the ingredient itself is fixed by the row being edited
 * (docs/stories/S-305-pantry-edit-remove.md Dev Notes) and pre-filled with
 * the row's CURRENT display quantity/unit (AC1).
 *
 * `pantryItemUpdateSchema` (ADR-005) drives client-side validation; the
 * `updatePantryItem` Server Action independently re-validates the same
 * schema (defense in depth).
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { updatePantryItem } from "@/app/actions/pantry-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UNITS } from "@/domain/units";
import { pantryItemUpdateSchema } from "@/domain/validation/pantryItem.schema";

const UNIT_KEYS = Object.keys(UNITS);

export interface EditablePantryItem {
  id: number;
  ingredientName: string;
  displayQuantity: number;
  displayUnit: string;
}

/** Raw form-field shape: blank inputs mid-typing type-check as `undefined`
 * (same convention as `PantryItemForm`) so a blank required field fails
 * validation as "required"/"positive", not as `0`. */
type FormValues = { quantity: number | undefined; unit: string | undefined };

const toOptionalNumber = (raw: string): number | undefined => (raw === "" ? undefined : Number(raw));

export function EditPantryItemDialog({
  item,
  open,
  onOpenChange,
}: {
  item: EditablePantryItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(pantryItemUpdateSchema) as unknown as Resolver<FormValues>,
    defaultValues: { quantity: item.displayQuantity, unit: item.displayUnit },
  });

  // Re-sync the form with this row's CURRENT display quantity/unit every
  // time the dialog opens (AC1) — covers both the first open and any
  // subsequent reopen after the row's values changed underneath it.
  useEffect(() => {
    if (open) {
      reset({ quantity: item.displayQuantity, unit: item.displayUnit });
    }
  }, [open, item.displayQuantity, item.displayUnit, reset]);

  const onSubmit = handleSubmit(async (values) => {
    const result = await updatePantryItem(item.id, {
      quantity: values.quantity!,
      unit: values.unit!,
    });

    if (!result.ok) {
      for (const [field, messages] of Object.entries(result.error.fieldErrors ?? {})) {
        if (messages && messages.length > 0 && (field === "quantity" || field === "unit")) {
          setError(field as keyof FormValues, { type: "server", message: messages[0] });
        }
      }
      return;
    }

    onOpenChange(false);
    router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit pantry item</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <p className="text-sm font-medium text-foreground">{item.ingredientName}</p>

          <div className="flex flex-col gap-1">
            <label htmlFor="pantry-edit-quantity" className="text-sm font-medium text-foreground">
              Quantity
            </label>
            <Input
              id="pantry-edit-quantity"
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

          <div>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
