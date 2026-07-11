"use client";

/**
 * S-303 delete affordance for a `CUSTOM` ingredient's edit page
 * (docs/stories/S-303-ingredient-delete-rules.md, FR-4's UI half). Rendered
 * by `/app/ingredients/[id]/edit/page.tsx` only when `source === "CUSTOM"`
 * (architecture.md §4 — SEEDED rows never render a delete control at all,
 * per tests/e2e/ingredient-edit.spec.ts's own "no delete control" pin and
 * this story's own AC-3 UI coverage).
 *
 * Trigger renders `data-testid="delete-ingredient"` AND is reachable as
 * `getByRole("button", { name: /delete/i })` — the dual-selector shape
 * tests/e2e/ingredient-delete.spec.ts pins. Confirming opens a
 * `role="dialog"` (name matches /delete/i via `DialogTitle`) with exactly
 * two actions: "Confirm delete" and "Cancel" (both exact accessible
 * names). Cancel only closes the dialog — no navigation, no delete.
 * Confirm invokes `deleteIngredient`:
 *   - success => navigate to `/ingredients` (the row disappears from the
 *     catalog, per S-301's search box).
 *   - blocked (`REFERENCED`/any other error) => dialog closes, the edit
 *     page stays put, and the Server Action's friendly message (naming
 *     every referencing recipe, mentioning "pantry" when applicable) is
 *     rendered on the page — never a raw FK error, never a silent
 *     navigate-away.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteIngredient } from "@/app/actions/ingredient-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function DeleteIngredientButton({ ingredientId }: { ingredientId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleConfirm() {
    const result = await deleteIngredient(ingredientId);
    if (result.ok) {
      router.push("/ingredients");
      return;
    }
    setOpen(false);
    setErrorMessage(result.error.message);
  }

  return (
    <div className="flex flex-col gap-2">
      <Dialog
        open={open}
        onOpenChange={(next: boolean) => {
          setOpen(next);
          if (next) setErrorMessage(null);
        }}
      >
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="destructive"
            data-testid="delete-ingredient"
            className="w-fit"
          >
            Delete ingredient
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete ingredient?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently remove this ingredient from the catalog. This action is irreversible.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirm}>
              Confirm delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {errorMessage ? (
        <p data-testid="delete-ingredient-error" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
