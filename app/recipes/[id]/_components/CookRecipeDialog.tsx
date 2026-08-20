"use client";

/**
 * openspec: cook-recipe-into-meals — the cook dialog (design D5). Opens at
 * the slider's current portion count, previews per-line consumption via
 * `previewCook`, requires an Ignore/Substitute choice on missing or
 * unresolved lines, and confirms through `cookRecipe`. Success shows what
 * was consumed/ignored/substituted and links to Meals › Batches.
 */
import Link from "next/link";
import { useState } from "react";
import { cookRecipe, previewCook, type CookPreview, type CookResult } from "@/app/actions/cook-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UNITS } from "@/domain/units";

type LineChoice =
  | { action: "consume" }
  | { action: "ignore" }
  | { action: "substitute"; substitutePantryItemId?: number; substituteQuantity?: number; substituteUnit?: string };

const STATUS_LABEL: Record<string, string> = {
  ok: "in stock",
  insufficient: "not enough — will consume to zero",
  missing: "not in pantry",
  unresolved: "cannot compare units",
};

export function CookRecipeDialog({ recipeId, portions }: { recipeId: number; portions: number }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<CookPreview | null>(null);
  const [choices, setChoices] = useState<Record<number, LineChoice>>({});
  const [result, setResult] = useState<CookResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [eatNow, setEatNow] = useState(1);

  async function loadPreview() {
    setPreview(null);
    setResult(null);
    setErrorMessage(null);
    const response = await previewCook(recipeId, portions);
    if (!response.ok) {
      setErrorMessage(response.error.message);
      return;
    }
    setPreview(response.data);
    setEatNow(Math.min(1, Math.floor(response.data.portions)));
    const initial: Record<number, LineChoice> = {};
    for (const line of response.data.lines) {
      initial[line.lineId] =
        line.status === "missing" || line.status === "unresolved" ? { action: "ignore" } : { action: "consume" };
    }
    setChoices(initial);
  }

  function setChoice(lineId: number, choice: LineChoice) {
    setChoices((current) => ({ ...current, [lineId]: choice }));
  }

  const substituteIncomplete =
    preview?.lines.some((line) => {
      const choice = choices[line.lineId];
      return (
        choice?.action === "substitute" &&
        (!choice.substitutePantryItemId || !choice.substituteQuantity || !choice.substituteUnit)
      );
    }) ?? false;

  async function handleConfirm() {
    if (!preview) return;
    setBusy(true);
    setErrorMessage(null);
    const response = await cookRecipe({
      recipeId,
      portions,
      eatNowPortions: eatNow,
      lines: preview.lines.map((line) => {
        const choice = choices[line.lineId] ?? { action: "consume" };
        return { lineId: line.lineId, ...choice };
      }),
    });
    setBusy(false);
    if (!response.ok) {
      setErrorMessage(response.error.message);
      return;
    }
    setResult(response.data);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        setOpen(next);
        if (next) void loadPreview();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" data-testid="cook-recipe" className="w-fit">
          Cook {portions} {portions === 1 ? "portion" : "portions"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cook {preview?.recipeName ?? "recipe"}</DialogTitle>
        </DialogHeader>

        {result ? (
          <div data-testid="cook-result" className="flex flex-col gap-3">
            <p className="text-sm">
              Cooked <span className="font-semibold">{result.portions}</span>{" "}
              {result.portions === 1 ? "portion" : "portions"} — pantry updated, batch logged
              {result.eatenNow > 0 ? (
                <span data-testid="cook-eaten-now">
                  , {result.eatenNow} logged as eaten now
                </span>
              ) : null}
              .
            </p>
            {result.warnings.map((warning) => (
              <p key={warning} data-testid="cook-warning" className="text-sm text-status-near">
                {warning}
              </p>
            ))}
            {result.consumed.length > 0 ? (
              <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                {result.consumed.map((entry) => (
                  <li key={entry.pantryItemId} data-testid="cook-consumed-row">
                    {entry.name}: consumed {Math.round(entry.consumed * 100) / 100}
                    {entry.shortfall > 0 ? (
                      <span className="text-status-near"> (short {Math.round(entry.shortfall * 100) / 100} — now at zero)</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {result.ignored.length > 0 ? (
              <p className="text-sm text-muted-foreground">Ignored: {result.ignored.join(", ")}</p>
            ) : null}
            {result.substituted.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {result.substituted.map((sub) => `${sub.substituteName} in place of ${sub.name}`).join("; ")}
              </p>
            ) : null}
            <Link href="/meal-log/batches" className="text-sm font-medium text-primary underline">
              View in Inventory › Batches
            </Link>
          </div>
        ) : preview ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Cooking {preview.portions} of a {preview.servings}-portion recipe. Pantry consumption:
            </p>
            <ul className="flex flex-col gap-3">
              {preview.lines.map((line) => {
                const choice = choices[line.lineId] ?? { action: "consume" };
                const needsChoice = line.status === "missing" || line.status === "unresolved";
                return (
                  <li key={line.lineId} data-testid="cook-line" className="flex flex-col gap-2 rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{line.ingredientName}</span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {line.scaledDisplayQuantity} {line.displayUnit}
                      </span>
                      <span
                        data-testid={`cook-line-status-${line.status}`}
                        className={`text-xs ${line.status === "ok" ? "text-status-cookable" : "text-status-near"}`}
                      >
                        {STATUS_LABEL[line.status]}
                      </span>
                    </div>
                    {needsChoice ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-1 text-sm">
                          <input
                            type="radio"
                            name={`cook-choice-${line.lineId}`}
                            checked={choice.action === "ignore"}
                            onChange={() => setChoice(line.lineId, { action: "ignore" })}
                          />
                          Ignore
                        </label>
                        <label className="flex items-center gap-1 text-sm">
                          <input
                            type="radio"
                            name={`cook-choice-${line.lineId}`}
                            checked={choice.action === "substitute"}
                            onChange={() => setChoice(line.lineId, { action: "substitute" })}
                          />
                          Substitute
                        </label>
                        {choice.action === "substitute" ? (
                          <div className="flex w-full flex-wrap items-center gap-2">
                            <Select
                              value={choice.substitutePantryItemId?.toString() ?? ""}
                              onValueChange={(value) =>
                                setChoice(line.lineId, { ...choice, substitutePantryItemId: Number(value) })
                              }
                            >
                              <SelectTrigger aria-label="Substitute item" className="min-w-40">
                                <SelectValue placeholder="Pantry item" />
                              </SelectTrigger>
                              <SelectContent>
                                {preview.pantryOptions.map((option) => (
                                  <SelectItem key={option.pantryItemId} value={option.pantryItemId.toString()}>
                                    {option.name} ({option.displayQuantity} {option.displayUnit})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              aria-label="Substitute quantity"
                              type="number"
                              step="any"
                              className="w-24"
                              value={choice.substituteQuantity ?? ""}
                              onChange={(event) =>
                                setChoice(line.lineId, {
                                  ...choice,
                                  substituteQuantity: event.target.value === "" ? undefined : Number(event.target.value),
                                })
                              }
                            />
                            <Select
                              value={choice.substituteUnit ?? ""}
                              onValueChange={(value) => setChoice(line.lineId, { ...choice, substituteUnit: value })}
                            >
                              <SelectTrigger aria-label="Substitute unit" className="min-w-20">
                                <SelectValue placeholder="Unit" />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.keys(UNITS).map((unit) => (
                                  <SelectItem key={unit} value={unit}>
                                    {unit}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {/* openspec: eat-now-and-quick-log — log this many portions as
                eaten in the same confirm (0 = just cook). */}
            <div className="flex items-center gap-2">
              <label htmlFor="cook-eat-now" className="text-sm font-medium">
                Eating now
              </label>
              <Input
                id="cook-eat-now"
                type="number"
                step="any"
                min={0}
                max={preview.portions}
                className="w-24"
                value={eatNow}
                onChange={(event) => setEatNow(event.target.value === "" ? 0 : Number(event.target.value))}
              />
              <span className="text-xs text-muted-foreground">of {preview.portions} portions (0 = just cook)</span>
            </div>
          </div>
        ) : errorMessage === null ? (
          <p className="text-sm text-muted-foreground">Checking the pantry…</p>
        ) : null}

        {errorMessage ? (
          <p data-testid="cook-error" className="text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}

        {result === null ? (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              data-testid="cook-confirm"
              disabled={preview === null || busy || substituteIncomplete}
              onClick={() => void handleConfirm()}
            >
              {busy ? "Cooking…" : "Confirm cook"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
