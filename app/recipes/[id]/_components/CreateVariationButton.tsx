"use client";

/** openspec: ratings-variants-links — duplicate as a linked variation
 * and jump straight into editing the copy. */
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createRecipeVariation } from "@/app/actions/recipe-actions";
import { Button } from "@/components/ui/button";

export function CreateVariationButton({ recipeId }: { recipeId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-testid="create-variation"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await createRecipeVariation(recipeId);
          if (result.ok && result.newId !== null) router.push(`/recipes/${result.newId}/edit`);
        })
      }
    >
      {pending ? "Creating…" : "Create variation"}
    </Button>
  );
}
