"use client";

/**
 * Shared recipe editor client component (S-401 create, S-402 edit —
 * docs/stories/S-401-recipe-create.md, docs/stories/S-402-recipe-edit-
 * delete.md Dev Notes: "Reuses S-401's schema and editor component — do
 * not fork a second editor"). ADR-002 — forms with local state are client
 * components; both `createRecipe` and `updateRecipe` re-validate
 * independently (ADR-005), so this client-side `recipeSchema.safeParse`
 * call is UX-only, never trusted as authorization to write.
 *
 * Pinned contract (tests/e2e/recipe-create.spec.ts, tests/e2e/recipe-edit
 * .spec.ts):
 *   - `<h1>` "New Recipe" (create mode) / matching /edit recipe/i (edit
 *     mode).
 *   - "Recipe name" textbox, "Servings" spinbutton, "Instructions"
 *     textbox.
 *   - "Add ingredient line" button appends a `data-testid="recipe-line-row"`
 *     row; each row has an "Ingredient" search textbox (backed by
 *     `/api/ingredients?q=`, S-301's reusable picker backend) whose results
 *     render as `data-testid="recipe-ingredient-option"`, a "Quantity"
 *     spinbutton, and a "Unit" combobox (shadcn Select, FR-10 unit set).
 *   - "Save recipe" submits (also reachable via /save/i, per the edit
 *     spec). 0 completed lines (or any other lines-level validation
 *     failure) blocks the save and renders an inline message matching
 *     /at least (one|1) ingredient/i, staying on the current page.
 *   - Create mode: a successful save redirects to `/recipes`. Edit mode: a
 *     successful save redirects to `/recipes/<recipeId>` (FR-14 AC2).
 *   - `initialValues` (edit mode only) pre-fills name/servings/
 *     instructions and renders exactly one `recipe-line-row` per existing
 *     line, pre-filled with that line's ingredient name/displayQuantity/
 *     displayUnit (FR-14 AC1).
 *
 * S-405 (docs/stories/S-405-recipe-tags.md, tests/e2e/recipe-tags.spec.ts):
 *   - A "Tags" free-text textbox. Pressing Enter while it is focused and
 *     non-empty commits its trimmed value as a `data-testid=
 *     "recipe-tag-chip"` chip and clears the input; each chip has a
 *     `getByRole("button", { name: \`Remove tag ${tag}\` })` inside it.
 *   - Saving submits every currently-committed chip as `tags`.
 *   - `initialValues.tags` (edit mode) pre-fills the committed chip list.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { createRecipe, updateRecipe } from "@/app/actions/recipe-actions";
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
function newLine(seed?: Partial<Pick<LineState, "ingredientQuery" | "ingredientId" | "quantity" | "unit">>): LineState {
  nextLineKey += 1;
  return {
    key: `line-${nextLineKey}`,
    ingredientQuery: seed?.ingredientQuery ?? "",
    ingredientId: seed?.ingredientId ?? null,
    quantity: seed?.quantity ?? "",
    unit: seed?.unit ?? "",
    options: [],
  };
}

interface FormValues {
  name: string;
  servings: string;
  instructions: string;
}

export interface RecipeEditorInitialLine {
  ingredientId: number;
  ingredientName: string;
  quantity: number;
  unit: string;
}

export interface RecipeEditorInitialValues {
  name: string;
  servings: number;
  instructions: string;
  lines: RecipeEditorInitialLine[];
  tags?: string[];
}

interface RecipeEditorProps {
  mode: "create" | "edit";
  recipeId?: number;
  initialValues?: RecipeEditorInitialValues;
}

export function RecipeEditor({ mode, recipeId, initialValues }: RecipeEditorProps) {
  const router = useRouter();
  const [lines, setLines] = useState<LineState[]>(() =>
    initialValues
      ? initialValues.lines.map((line) =>
          newLine({
            ingredientQuery: line.ingredientName,
            ingredientId: line.ingredientId,
            quantity: String(line.quantity),
            unit: line.unit,
          }),
        )
      : [],
  );
  const [linesError, setLinesError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>(() => initialValues?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [tagsError, setTagsError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      name: initialValues?.name ?? "",
      servings: initialValues ? String(initialValues.servings) : "",
      instructions: initialValues?.instructions ?? "",
    },
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

  function commitTagDraft() {
    const trimmed = tagDraft.trim();
    if (trimmed === "") {
      return;
    }
    setTags((previous) => (previous.includes(trimmed) ? previous : [...previous, trimmed]));
    setTagDraft("");
  }

  function removeTag(tag: string) {
    setTags((previous) => previous.filter((existing) => existing !== tag));
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    setLinesError(null);
    setTagsError(null);

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
      tags,
    };

    const parsed = recipeSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      applyFieldErrors(fieldErrors);
      return;
    }

    const result = mode === "create" ? await createRecipe(parsed.data) : await updateRecipe(recipeId!, parsed.data);
    if (result.ok) {
      router.push(mode === "create" ? "/recipes" : `/recipes/${recipeId}`);
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
    if (fieldErrors.tags?.length) {
      setTagsError(fieldErrors.tags[0]);
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
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{mode === "create" ? "New Recipe" : "Edit recipe"}</h1>

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

        <div className="flex flex-col gap-1">
          <label htmlFor="recipe-tags" className="text-sm font-medium text-foreground">
            Tags
          </label>
          <Input
            id="recipe-tags"
            type="text"
            aria-label="Tags"
            className="max-w-sm"
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitTagDraft();
              }
            }}
          />
          {tags.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <li
                  key={tag}
                  data-testid="recipe-tag-chip"
                  className="flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-sm"
                >
                  <span>{tag}</span>
                  <button
                    type="button"
                    aria-label={`Remove tag ${tag}`}
                    onClick={() => removeTag(tag)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {tagsError ? <p className="text-sm text-destructive">{tagsError}</p> : null}
        </div>

        {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

        <div>
          <Button type="submit">Save recipe</Button>
        </div>
      </form>
    </div>
  );
}
