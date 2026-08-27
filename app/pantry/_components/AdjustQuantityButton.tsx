"use client";

/** openspec: subrecipes-consume-qol — fast quantity correction for
 * "someone used some": ¾ / ½ / ¼ of the current amount, or Out. Exact
 * amounts stay in the Edit dialog. */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updatePantryItem } from "@/app/actions/pantry-actions";
import { Button } from "@/components/ui/button";
import type { PantryListRow } from "@/data/pantry";
import { UNITS } from "@/domain/units";

const PRESETS: Array<{ label: string; factor: number }> = [
  { label: "¾", factor: 0.75 },
  { label: "½", factor: 0.5 },
  { label: "¼", factor: 0.25 },
  { label: "Out", factor: 0 },
];

/** openspec: pack-units — one inner pack expressed in the row's display
 * unit (null when no pack size, or the classes don't line up). */
function packInDisplayUnits(item: PantryListRow): number | null {
  if (item.packQuantity === null || item.packQuantity <= 0 || item.packUnit === null) return null;
  const pack = UNITS[item.packUnit];
  const display = UNITS[item.displayUnit];
  if (!pack || !display || pack.class !== display.class) return null;
  return (item.packQuantity * pack.toCanonicalFactor) / display.toCanonicalFactor;
}

export function AdjustQuantityButton({ item }: { item: PantryListRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const packSize = packInDisplayUnits(item);

  const applyQuantity = (quantity: number) =>
    startTransition(async () => {
      setErrorMessage(null);
      const result = await updatePantryItem(item.id, { quantity, unit: item.displayUnit });
      if (!result.ok) {
        setErrorMessage(result.error.message ?? "Adjust failed.");
        return;
      }
      setOpen(false);
      router.refresh();
    });

  const apply = (factor: number) => applyQuantity(Math.round(item.displayQuantity * factor * 100) / 100);

  return (
    <span className="relative inline-flex">
      <Button
        type="button"
        size="sm"
        variant="outline"
        data-testid="adjust-quantity"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Adjust
      </Button>
      {open ? (
        <span
          data-testid="adjust-presets"
          className="absolute right-0 top-full z-10 mt-1 flex items-center gap-1 rounded-md border border-border bg-popover p-1 shadow-md"
        >
          {packSize !== null ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="adjust-pack"
              disabled={pending || item.displayQuantity <= 0}
              onClick={() =>
                applyQuantity(Math.max(0, Math.round((item.displayQuantity - packSize) * 100) / 100))
              }
            >
              −1 pack
            </Button>
          ) : null}
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              size="sm"
              variant={preset.factor === 0 ? "destructive" : "secondary"}
              data-testid={`adjust-${preset.factor === 0 ? "out" : preset.label}`}
              disabled={pending}
              onClick={() => apply(preset.factor)}
            >
              {preset.label}
            </Button>
          ))}
          {errorMessage ? <span className="px-1 text-xs text-destructive">{errorMessage}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
