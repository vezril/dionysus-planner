"use client";

/**
 * openspec: eat-now-and-quick-log — one-click "I ate a leftover portion"
 * on a batch row. Renders only for batches with remaining portions (the
 * server guards races); errors show inline on the row.
 */
import { useState, useTransition } from "react";
import { quickLogBatchPortion } from "@/app/actions/meal-log-actions";
import { Button } from "@/components/ui/button";

export function LogPortionButton({ batchId }: { batchId: number }) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="log-portion"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setErrorMessage(null);
            const result = await quickLogBatchPortion(batchId);
            if (!result.ok) setErrorMessage(result.error.message);
          })
        }
      >
        {pending ? "Logging…" : "Log 1 portion"}
      </Button>
      {errorMessage ? (
        <span data-testid="log-portion-error" className="text-xs text-destructive">
          {errorMessage}
        </span>
      ) : null}
    </span>
  );
}
