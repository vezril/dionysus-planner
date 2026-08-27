"use client";

/**
 * openspec: pantry-quick-eat — Eat straight from the pantry: quantity
 * prefilled to 1 each (COUNT) or the package size; confirms through
 * eatPantryItem (service meal + pantry consume + today's plan entry).
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { eatPantryItem } from "@/app/actions/eat-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { PantryListRow } from "@/data/pantry";

export function EatItemButton({ item }: { item: PantryListRow }) {
  const router = useRouter();
  // openspec: ratings-variants-links — drink-aware wording.
  const verb = item.category === "DRINK" ? "Drink" : "Eat";
  const [open, setOpen] = useState(false);
  // openspec: pack-units — one INNER pack first (a 61 g pouch of the
  // 366 g box), then the package, then blank.
  const prefill =
    item.unitClass === "COUNT"
      ? { quantity: "1", unit: "each" }
      : item.packQuantity !== null && item.packUnit !== null
        ? { quantity: String(item.packQuantity), unit: item.packUnit }
        : item.packageQuantity !== null && item.packageUnit !== null
          ? { quantity: String(item.packageQuantity), unit: item.packageUnit }
          : { quantity: "", unit: item.displayUnit };
  const [quantity, setQuantity] = useState(prefill.quantity);
  const [unit] = useState(prefill.unit);
  // openspec: plan-pantry-backdate — log to an earlier day if forgotten.
  const todayIso = new Date().toLocaleDateString("en-CA");
  const [logDate, setLogDate] = useState(todayIso);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button type="button" size="sm" data-testid="eat-item" onClick={() => setOpen(true)}>
        {verb}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{verb} {item.ingredientName}</DialogTitle>
          </DialogHeader>
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="eat-quantity" className="text-sm font-medium">
                Quantity ({unit})
              </label>
              <Input
                id="eat-quantity"
                type="number"
                step="any"
                className="w-28"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>
            <span className="pb-2 text-sm text-muted-foreground">
              of {item.displayQuantity} {item.displayUnit} on hand
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="eat-date" className="text-sm font-medium">
              Log to day
            </label>
            <Input
              id="eat-date"
              type="date"
              className="w-40"
              max={todayIso}
              value={logDate}
              onChange={(event) => setLogDate(event.target.value)}
            />
            {logDate !== todayIso ? (
              <p className="text-xs text-status-near">Backdating to {logDate}.</p>
            ) : null}
          </div>
          {errorMessage ? (
            <p data-testid="eat-error" className="text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              data-testid="eat-confirm"
              disabled={pending || quantity === "" || Number(quantity) <= 0}
              onClick={() =>
                startTransition(async () => {
                  setErrorMessage(null);
                  const result = await eatPantryItem({
                    pantryItemId: item.id,
                    quantity: Number(quantity),
                    unit,
                    date: logDate,
                  });
                  if (!result.ok) {
                    setErrorMessage(result.error.message);
                    return;
                  }
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {pending ? "Logging…" : `${verb} it`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
