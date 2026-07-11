"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Shared implementation behind every `error.tsx` boundary (root + one per
 * primary route, per S-105's task list / architecture.md §6 "Error
 * handling strategy"). Must be a client component — Next.js's error.tsx
 * convention requires it (error boundaries only work in client trees).
 */
export function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        An unexpected error occurred. You can try again, or head back to a
        different section using the navigation above.
      </p>
      <Button onClick={() => reset()}>Try again</Button>
    </div>
  );
}
