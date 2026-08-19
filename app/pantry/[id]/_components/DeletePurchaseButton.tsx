"use client";

/**
 * openspec: pantry-item-detail — delete a purchase (typo correction; edits
 * are deliberately unsupported). Same confirm-dialog pattern as
 * RemovePantryItemDialog (plain shadcn Dialog, ADR-006).
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deletePurchase } from "@/app/actions/purchase-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function DeletePurchaseButton({ purchaseId }: { purchaseId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    const result = await deletePurchase(purchaseId);
    setPending(false);
    if (result.ok) {
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="destructive" onClick={() => setOpen(true)}>
        Delete
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete purchase</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground">
            Delete this purchase from the history? This cannot be undone.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={handleConfirm}>
              Confirm delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
