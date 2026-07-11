import type { ReactNode } from "react";

/**
 * Shared FR-29 empty-state container. Static placeholder per S-105 — the
 * real per-view empty states (with live data-driven copy) arrive in
 * S-304/S-404/S-501; this keeps the shape/testid contract stable across
 * that later swap.
 */
export function EmptyState({
  description,
  children,
}: {
  description: string;
  children: ReactNode;
}) {
  return (
    <div
      data-testid="empty-state"
      className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border p-6"
    >
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
