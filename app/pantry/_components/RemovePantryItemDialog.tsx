"use client";

/**
 * S-305 pantry item remove confirmation (client component, ADR-006). A
 * plain shadcn `Dialog` (Radix `role="dialog"`) rather than a dedicated
 * AlertDialog primitive — the story's Dev Notes only ask for "remove
 * button + confirmation," and tests/e2e/pantry-edit.spec.ts's pinned
 * contract explicitly accepts either role ("or the Radix `alertdialog`
 * role — either satisfies 'a confirmation'").
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deletePantryItem } from "@/app/actions/pantry-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function RemovePantryItemDialog({
  item,
  open,
  onOpenChange,
}: {
  item: { id: number; ingredientName: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    const result = await deletePantryItem(item.id);
    setPending(false);
    if (result.ok) {
      onOpenChange(false);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove pantry item</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-foreground">
          Remove <span className="font-medium">{item.ingredientName}</span> from your pantry? This
          cannot be undone.
        </p>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={handleConfirm}>
            Confirm remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
