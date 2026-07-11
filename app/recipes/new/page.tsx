"use client";

/**
 * S-401 New Recipe editor (docs/stories/S-401-recipe-create.md), UJ-2.
 * Client component by design (ADR-002 — forms with local state); the
 * `createRecipe` Server Action re-validates everything independently
 * (ADR-005), so this client-side `recipeSchema.safeParse` call is UX-only,
 * never trusted as authorization to write.
 *
 * Pinned contract (tests/e2e/recipe-create.spec.ts):
 *   - `<h1>` "New Recipe".
 *   - "Recipe name" textbox, "Servings" spinbutton, "Instructions" textbox.
 *   - "Add ingredient line" button appends a `data-testid="recipe-line-row"`
 *     row; each row has an "Ingredient" search textbox (backed by
 *     `/api/ingredients?q=`, S-301's reusable picker backend) whose results
 *     render as `data-testid="recipe-ingredient-option"`, a "Quantity"
 *     spinbutton, and a "Unit" combobox (shadcn Select, FR-10 unit set).
 *   - "Save recipe" submits. 0 completed lines (or any other lines-level
 *     validation failure) blocks the save and renders an inline message
 *     matching /at least (one|1) ingredient/i, staying on `/recipes/new`.
 *   - A successful save redirects to `/recipes`.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { createRecipe } from "@/app/actions/recipe-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { recipeSchema } from "@/domain/validation/recipe.schema";
import { UNITS } from "@/domain/units";

const UNIT_KEYS = Object.keys(UNITS);

interface IngredientOption {
  id: number;
  name: string;
}

interface LineState {
  key: string;
  ingredientQuery: string;
  ingredientId: number | null;
  quantity: string;
  unit: string;
  options: IngredientOption[];
}

let nextLineKey = 0;
function newLine(): LineState {
  nextLineKey += 1;
  return {
    key: `line-${nextLineKey}`,
    ingredientQuery: "",
    ingredientId: null,
    quantity: "",
    unit: "",
    options: [],
  };
}

interface FormValues {
  name: string;
  servings: string;
  instructions: string;
}

export default function NewRecipePage() {
  const router = useRouter();
  const [lines, setLines] = useState<LineState[]>([]);
  const [linesError, setLinesError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { name: "", servings: "", instructions: "" },
  });

  function addLine() {
    setLines((previous) => [...previous, newLine()]);
  }

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((previous) => previous.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function handleIngredientQueryChange(key: string, query: string) {
    updateLine(key, { ingredientQuery: query, ingredientId: null });
    if (query.trim() === "") {
      updateLine(key, { options: [] });
      return;
    }
    try {
      const response = await fetch(`/api/ingredients?q=${encodeURIComponent(query)}`);
      const results = (await response.json()) as IngredientOption[];
      updateLine(key, { options: results });
    } catch {
      updateLine(key, { options: [] });
    }
  }

  function selectIngredient(key: string, option: IngredientOption) {
    updateLine(key, { ingredientId: option.id, ingredientQuery: option.name, options: [] });
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    setLinesError(null);

    const completedLines = lines
      .filter((line) => line.ingredientId !== null && line.quantity !== "" && line.unit !== "")
      .map((line) => ({
        ingredientId: line.ingredientId!,
        quantity: Number(line.quantity),
        unit: line.unit,
      }));

    const payload = {
      name: values.name,
      servings: Number(values.servings),
      instructions: values.instructions,
      lines: completedLines,
    };

    const parsed = recipeSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      applyFieldErrors(fieldErrors);
      return;
    }

    const result = await createRecipe(parsed.data);
    if (result.ok) {
      router.push("/recipes");
      return;
    }

    if (result.error.fieldErrors) {
      applyFieldErrors(result.error.fieldErrors);
    } else {
      setSubmitError(result.error.message);
    }
  });

  function applyFieldErrors(fieldErrors: Record<string, string[]>) {
    if (fieldErrors.lines?.length) {
      setLinesError(fieldErrors.lines[0]);
    }
    if (fieldErrors.name?.length) {
      setError("name", { type: "server", message: fieldErrors.name[0] });
    }
    if (fieldErrors.servings?.length) {
      setError("servings", { type: "server", message: fieldErrors.servings[0] });
    }
    if (fieldErrors.instructions?.length) {
      setError("instructions", { type: "server", message: fieldErrors.instructions[0] });
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">New Recipe</h1>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <label htmlFor="recipe-name" className="text-sm font-medium text-foreground">
            Recipe name
          </label>
          <Input id="recipe-name" type="text" className="max-w-sm" {...register("name")} />
          {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="recipe-servings" className="text-sm font-medium text-foreground">
            Servings
          </label>
          <Input id="recipe-servings" type="number" step="1" className="max-w-sm" {...register("servings")} />
          {errors.servings ? <p className="text-sm text-destructive">{errors.servings.message}</p> : null}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="recipe-instructions" className="text-sm font-medium text-foreground">
            Instructions
          </label>
          <Textarea id="recipe-instructions" className="w-full max-w-xl" {...register("instructions")} />
          {errors.instructions ? <p className="text-sm text-destructive">{errors.instructions.message}</p> : null}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">Ingredient lines</span>
            <Button type="button" variant="outline" onClick={addLine}>
              Add ingredient line
            </Button>
          </div>

          {lines.map((line) => (
            <div
              key={line.key}
              data-testid="recipe-line-row"
              className="flex w-full min-w-0 flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:flex-wrap sm:items-end"
            >
              <div className="relative flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Ingredient</span>
                <Input
                  type="text"
                  aria-label="Ingredient"
                  value={line.ingredientQuery}
                  onChange={(event) => {
                    void handleIngredientQueryChange(line.key, event.target.value);
                  }}
                  className="w-full"
                />
                {line.options.length > 0 ? (
                  <ul className="absolute top-full z-10 mt-1 w-full rounded-lg border border-border bg-popover shadow-md">
                    {line.options.map((option) => (
                      <li key={option.id}>
                        <button
                          type="button"
                          data-testid="recipe-ingredient-option"
                          className="block w-full px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                          onClick={() => selectIngredient(line.key, option)}
                        >
                          {option.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="flex min-w-0 flex-col gap-1 sm:w-28">
                <span className="text-xs font-medium text-muted-foreground">Quantity</span>
                <Input
                  type="number"
                  step="any"
                  aria-label="Quantity"
                  value={line.quantity}
                  onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                />
              </div>

              <div className="flex min-w-0 flex-col gap-1 sm:w-28">
                <span className="text-xs font-medium text-muted-foreground">Unit</span>
                <Select value={line.unit} onValueChange={(value) => updateLine(line.key, { unit: value })}>
                  <SelectTrigger aria-label="Unit" className="w-full">
                    <SelectValue placeholder="Unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_KEYS.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}

          {linesError ? <p className="text-sm text-destructive">{linesError}</p> : null}
        </div>

        {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

        <div>
          <Button type="submit">Save recipe</Button>
        </div>
      </form>
    </div>
  );
}
