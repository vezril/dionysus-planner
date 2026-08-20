"use client";

/** openspec: ratings-variants-links — 1–5 stars; clicking the current
 * rating clears it. */
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { rateRecipe } from "@/app/actions/recipe-actions";

export function RecipeRating({ recipeId, rating }: { recipeId: number; rating: number | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div data-testid="recipe-rating" className="flex items-center gap-1" aria-label="Recipe rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          data-testid={`rate-star-${star}`}
          aria-label={star === rating ? `Clear rating` : `Rate ${star} star${star === 1 ? "" : "s"}`}
          aria-pressed={rating !== null && star <= rating}
          disabled={pending}
          className={`text-xl leading-none transition-colors ${
            rating !== null && star <= rating ? "text-status-near" : "text-muted-foreground/40 hover:text-status-near"
          }`}
          onClick={() =>
            startTransition(async () => {
              await rateRecipe(recipeId, star === rating ? null : star);
              router.refresh();
            })
          }
        >
          ★
        </button>
      ))}
    </div>
  );
}
