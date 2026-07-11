"use client";

/**
 * S-402 delete affordance for a recipe's edit page (docs/stories/S-402-
 * recipe-edit-delete.md, FR-15). Mirrors `/app/ingredients/_components/
 * delete-ingredient-button.tsx`'s S-303 pattern.
 *
 * Trigger renders `data-testid="delete-recipe"` AND is reachable as
 * `getByRole("button", { name: /delete/i })` — the dual-selector shape
 * tests/e2e/recipe-edit.spec.ts pins. Confirming opens a `role="dialog"`
 * (name matches /delete/i via `DialogTitle`) with exactly two actions:
 * "Confirm delete" and "Cancel" (both exact accessible names). Cancel only
 * closes the dialog — no navigation, no delete. Confirm invokes
 * `deleteRecipe`:
 *   - success => navigate to `/recipes` (the row disappears from the
 *     catalog).
 *   - failure => dialog closes, the edit page stays put, and the Server
 *     Action's message is rendered on the page — never a raw error, never
 *     a silent navigate-away.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteRecipe } from "@/app/actions/recipe-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function DeleteRecipeButton({ recipeId }: { recipeId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleConfirm() {
    const result = await deleteRecipe(recipeId);
    if (result.ok) {
      router.push("/recipes");
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
          <Button type="button" variant="destructive" data-testid="delete-recipe" className="w-fit">
            Delete recipe
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete recipe?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently remove this recipe and its ingredient lines. This action is irreversible.
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
        <p data-testid="delete-recipe-error" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
