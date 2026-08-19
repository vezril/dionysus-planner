"use client";

/**
 * openspec: pantry-item-detail — log-a-purchase form. Same react-hook-form
 * + zodResolver + server-fieldErrors-via-setError pattern as
 * `ingredient-form.tsx` (ADR-005: one schema, client parse for UX, action
 * re-parse as the authority).
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { createPurchase } from "@/app/actions/purchase-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { purchaseSchema } from "@/domain/validation/purchase.schema";

type FormValues = {
  ingredientId: number;
  price: number | undefined;
  store: string | undefined;
  displayQuantity: number | undefined;
  displayUnit: string | undefined;
  purchasedAt: string;
};

const toOptionalNumber = (raw: string): number | undefined => (raw === "" ? undefined : Number(raw));
// Empty text inputs are "" on the DOM; the shared schema treats the fields
// as absent-or-non-empty (`.min(1).nullish()`), so normalize BEFORE the
// zodResolver sees the value — not in onSubmit, which runs after it.
const emptyToUndefined = (raw: string): string | undefined => (raw.trim() === "" ? undefined : raw);

function todayLocalDate(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

export function AddPurchaseForm({ ingredientId }: { ingredientId: number }) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(purchaseSchema) as unknown as Resolver<FormValues>,
    defaultValues: {
      ingredientId,
      price: undefined,
      store: undefined,
      displayQuantity: undefined,
      displayUnit: undefined,
      purchasedAt: todayLocalDate(),
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    const result = await createPurchase(values);

    if (result.ok) {
      // Reset to undefined, not "" — setValueAs only runs on input events,
      // so a reset-to-"" value would reach the schema raw on the next submit.
      reset({
        ingredientId,
        price: undefined,
        store: undefined,
        displayQuantity: undefined,
        displayUnit: undefined,
        purchasedAt: todayLocalDate(),
      });
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
      <input type="hidden" {...register("ingredientId", { valueAsNumber: true })} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="purchase-price" className="text-sm font-medium text-foreground">
            Price ($)
          </label>
          <Input
            id="purchase-price"
            type="number"
            step="0.01"
            min="0"
            className="w-28"
            {...register("price", { setValueAs: toOptionalNumber })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="purchase-store" className="text-sm font-medium text-foreground">
            Store (optional)
          </label>
          <Input id="purchase-store" type="text" className="w-40" {...register("store", { setValueAs: emptyToUndefined })} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="purchase-quantity" className="text-sm font-medium text-foreground">
            Quantity (optional)
          </label>
          <Input
            id="purchase-quantity"
            type="number"
            step="any"
            className="w-28"
            {...register("displayQuantity", { setValueAs: toOptionalNumber })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="purchase-unit" className="text-sm font-medium text-foreground">
            Unit
          </label>
          <Input id="purchase-unit" type="text" className="w-20" {...register("displayUnit", { setValueAs: emptyToUndefined })} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="purchase-date" className="text-sm font-medium text-foreground">
            Date
          </label>
          <Input id="purchase-date" type="date" className="w-40" {...register("purchasedAt")} />
        </div>
      </div>

      {errors.price ? (
        <p data-testid="field-error-price" className="text-sm text-destructive">
          {errors.price.message}
        </p>
      ) : null}
      {errors.displayUnit ? (
        <p data-testid="field-error-displayUnit" className="text-sm text-destructive">
          {errors.displayUnit.message}
        </p>
      ) : null}
      {errors.purchasedAt ? (
        <p data-testid="field-error-purchasedAt" className="text-sm text-destructive">
          {errors.purchasedAt.message}
        </p>
      ) : null}
      {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

      <div>
        <Button type="submit">Log purchase</Button>
      </div>
    </form>
  );
}
