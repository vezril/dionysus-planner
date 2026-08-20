"use client";

/**
 * openspec: shopping-list — what the week's plan needs that the pantry
 * can't cover, with a plain-text clipboard copy for the store.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { shoppingListText, type ShoppingList } from "@/domain/shoppingList";

export function ShoppingListPanel({ list }: { list: ShoppingList }) {
  const [copied, setCopied] = useState(false);
  const empty = list.items.length === 0 && list.unresolved.length === 0;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-medium">
          Shopping list{" "}
          <span className="text-sm font-normal text-muted-foreground">(for this week&apos;s plan)</span>
        </h2>
        {!empty ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="shopping-list-copy"
            onClick={() => {
              void navigator.clipboard.writeText(shoppingListText(list)).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
          >
            {copied ? "Copied!" : "Copy list"}
          </Button>
        ) : null}
      </div>

      {empty ? (
        <p data-testid="shopping-list-empty" className="text-sm text-muted-foreground">
          Nothing to buy — the pantry covers the whole plan.
        </p>
      ) : (
        <ul data-testid="shopping-list" className="flex flex-col gap-1 rounded-md border border-border p-3">
          {list.items.map((item) => (
            <li
              key={`${item.ingredientId}-${item.unit}`}
              data-testid="shopping-list-item"
              className="flex items-baseline justify-between gap-4 text-sm"
            >
              <span className="font-medium">{item.name}</span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {item.quantity} {item.unit}
              </span>
            </li>
          ))}
          {list.unresolved.map((name) => (
            <li key={name} data-testid="shopping-list-unresolved" className="text-sm text-status-near">
              {name} — check recipe (units unresolved)
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
