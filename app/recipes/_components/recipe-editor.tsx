"use client";

/**
 * Shared recipe editor client component (S-401 create, S-402 edit —
 * rewritten under openspec: cooklang-recipe-editor). ADR-002 — forms with
 * local state are client components; both `createRecipe` and
 * `updateRecipe` re-validate independently (ADR-005), so this client-side
 * `recipeSchema.safeParse` call is UX-only, never trusted as authorization
 * to write.
 *
 * The per-line ingredient picker form (S-401/S-402's original contract —
 * `data-testid="recipe-line-row"` rows with an Ingredient/Quantity/Unit
 * triple each) is GONE. Recipe name / Servings / Tags stay untouched. In
 * their place: a single "Instructions" textarea where the whole recipe is
 * typed as prose, with inline `@Name(id){quantity%unit}` mentions
 * (design.md Decisions 1-3). Typing `@` opens an autocomplete (backed by
 * the same `/api/ingredients?q=` endpoint the old picker used); selecting
 * a result inserts the ingredient's name plus its catalog id as one atomic
 * text operation — the mention's link to a real catalog row is captured
 * at that moment, never re-derived from text later (FR-24).
 *
 * The dropdown is anchored below the textarea, not caret-following
 * (design.md Decision 8 — true caret-coordinate tracking in a plain
 * `<textarea>` needs a text-metrics "mirror div"; deferred as polish).
 *
 * Pinned contract (tests/e2e/recipe-create.spec.ts, recipe-edit.spec.ts):
 *   - `<h1>` "New Recipe" (create) / matching /edit recipe/i (edit).
 *   - "Recipe name" textbox, "Servings" spinbutton, "Instructions"
 *     textbox (now the single mention-aware body field).
 *   - Typing `@query` in "Instructions" opens a
 *     `data-testid="mention-suggestions"` list of
 *     `data-testid="mention-option"` buttons (backed by
 *     `/api/ingredients?q=`); clicking one inserts `Name(id)` at the `@`
 *     position, replacing the typed query.
 *   - "Save recipe" submits. A body with zero valid mentions (or any
 *     parse error) blocks the save and renders an inline message matching
 *     /at least (one|1) ingredient/i, staying on the current page.
 *   - Create mode: success redirects to `/recipes`. Edit mode: success
 *     redirects to `/recipes/<recipeId>` (FR-14 AC2).
 *   - `initialValues` (edit mode) pre-fills name/servings/body verbatim
 *     (design.md Decision 6 — body IS the stored `instructions` text,
 *     mentions and all, no reconstruction).
 *
 * S-405 tags (tests/e2e/recipe-tags.spec.ts) — unchanged from before:
 *   - A "Tags" free-text textbox. Enter commits a
 *     `data-testid="recipe-tag-chip"` chip; each chip has a
 *     `getByRole("button", { name: \`Remove tag ${tag}\` })`.
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { createRecipe, updateRecipe } from "@/app/actions/recipe-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { recipeSchema } from "@/domain/validation/recipe.schema";

interface IngredientOption {
  id: number;
  name: string;
}

interface FormValues {
  name: string;
  servings: string;
  body: string;
}

export interface RecipeEditorInitialValues {
  name: string;
  servings: number;
  body: string;
  tags?: string[];
}

interface RecipeEditorProps {
  mode: "create" | "edit";
  recipeId?: number;
  initialValues?: RecipeEditorInitialValues;
}

/**
 * Finds the `@query` word the caret currently sits inside, if any — the
 * boundary is the start of the current line or the previous whitespace
 * character, whichever is closer, matching how `@mentions` are detected
 * in plain-textarea implementations elsewhere (e.g. GitHub's comment box).
 */
function findMentionQueryAtCaret(text: string, caretIndex: number): { start: number; query: string } | null {
  const uptoCaret = text.slice(0, caretIndex);
  const atIndex = uptoCaret.lastIndexOf("@");
  if (atIndex === -1) {
    return null;
  }
  const between = uptoCaret.slice(atIndex + 1);
  if (/[\n(){}]/.test(between)) {
    // The @ is part of an already-completed mention (or unrelated text) —
    // not a live query.
    return null;
  }
  return { start: atIndex, query: between };
}

export function RecipeEditor({ mode, recipeId, initialValues }: RecipeEditorProps) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [bodyError, setBodyError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>(() => initialValues?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [mentionOptions, setMentionOptions] = useState<IngredientOption[]>([]);
  const [mentionQueryStart, setMentionQueryStart] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      name: initialValues?.name ?? "",
      servings: initialValues ? String(initialValues.servings) : "",
      body: initialValues?.body ?? "",
    },
  });

  const bodyRegistration = register("body");
  const bodyValue = watch("body");

  async function handleBodyChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    void bodyRegistration.onChange(event);
    const textarea = event.target;
    const caretIndex = textarea.selectionStart ?? textarea.value.length;
    const mentionQuery = findMentionQueryAtCaret(textarea.value, caretIndex);

    if (mentionQuery === null || mentionQuery.query.trim() === "") {
      setMentionOptions([]);
      setMentionQueryStart(null);
      return;
    }

    setMentionQueryStart(mentionQuery.start);
    try {
      const response = await fetch(`/api/ingredients?q=${encodeURIComponent(mentionQuery.query)}`);
      const results = (await response.json()) as IngredientOption[];
      setMentionOptions(results);
    } catch {
      setMentionOptions([]);
    }
  }

  function insertMention(option: IngredientOption) {
    const textarea = textareaRef.current;
    if (mentionQueryStart === null || !textarea) {
      return;
    }
    const caretIndex = textarea.selectionStart ?? bodyValue.length;
    const before = bodyValue.slice(0, mentionQueryStart);
    const after = bodyValue.slice(caretIndex);
    const inserted = `@${option.name}(${option.id})`;
    const nextValue = `${before}${inserted}${after}`;

    // Synchronous: setting textarea.value imperatively (in addition to the
    // controlled React state below) guarantees the DOM reflects the new
    // text and the cursor lands in the right place in THIS tick — a
    // requestAnimationFrame-deferred reposition races with whatever the
    // caller (a fast typist, or a test) does next.
    textarea.value = nextValue;
    const cursor = before.length + inserted.length;
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor);

    setValue("body", nextValue, { shouldDirty: true });
    setMentionOptions([]);
    setMentionQueryStart(null);
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
    setBodyError(null);
    setTagsError(null);

    const payload = {
      name: values.name,
      servings: Number(values.servings),
      body: values.body,
      tags,
    };

    const parsed = recipeSchema.safeParse(payload);
    if (!parsed.success) {
      applyFieldErrors(parsed.error.flatten().fieldErrors);
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
    if (fieldErrors.body?.length) {
      setBodyError(fieldErrors.body[0]);
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

        <div className="relative flex flex-col gap-1">
          <label htmlFor="recipe-instructions" className="text-sm font-medium text-foreground">
            Instructions
          </label>
          <Textarea
            id="recipe-instructions"
            className="min-h-40 w-full max-w-2xl font-mono"
            placeholder={"Fry the @onion in butter...\nType @ to link an ingredient."}
            {...bodyRegistration}
            ref={(node) => {
              bodyRegistration.ref(node);
              textareaRef.current = node;
            }}
            onChange={handleBodyChange}
          />
          {mentionOptions.length > 0 ? (
            <ul
              data-testid="mention-suggestions"
              className="w-full max-w-2xl rounded-lg border border-border bg-popover shadow-md"
            >
              {mentionOptions.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    data-testid="mention-option"
                    className="block w-full px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => insertMention(option)}
                  >
                    {option.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {bodyError ? <p className="text-sm text-destructive">{bodyError}</p> : null}
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
