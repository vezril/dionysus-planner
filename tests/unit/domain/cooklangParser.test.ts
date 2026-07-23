/**
 * cooklang-recipe-editor (openspec) — domain/cooklangParser.ts.
 *
 * Mention grammar (design.md Decision 1): `@Name(id)` optionally followed
 * by `{quantity%unit}` or a bare `{quantity}` (COUNT class, implicit
 * "each" — Decision 1). Every mention requires a quantity block (Decision
 * 2) — a mention with none is a parse error, not silently dropped. The ID
 * is captured verbatim from the text (Decision 3) — the parser never
 * does name-based/fuzzy matching. A bare, unlinked `@` (no `(id)`
 * immediately following) is inert plain text, never a parse error.
 */
import { describe, expect, it } from "vitest";
import { parseRecipeBody, stripMentionIds } from "@/domain/cooklangParser";

describe("parseRecipeBody", () => {
  it("parses a mass-unit mention", () => {
    const result = parseRecipeBody("Fry the @Onion, yellow, medium(11){1} in @Olive oil, extra virgin(42){2%tbsp}.");
    expect(result.errors).toEqual([]);
    expect(result.lines).toEqual([
      { ingredientId: 11, quantity: 1, unit: "each" },
      { ingredientId: 42, quantity: 2, unit: "tbsp" },
    ]);
  });

  it("parses a bare-count mention with no %unit as COUNT class (each)", () => {
    const result = parseRecipeBody("Crack @Egg, large, whole(7){2} into a bowl.");
    expect(result.errors).toEqual([]);
    expect(result.lines).toEqual([{ ingredientId: 7, quantity: 2, unit: "each" }]);
  });

  it("captures multi-word, comma-containing ingredient names correctly", () => {
    const result = parseRecipeBody("Add @Onion, yellow, medium(11){1}.");
    expect(result.lines).toEqual([{ ingredientId: 11, quantity: 1, unit: "each" }]);
  });

  it("errors on a mention with no quantity block at all", () => {
    const result = parseRecipeBody("Season with @Salt(3) to taste.");
    expect(result.lines).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/quantity/i);
  });

  it("errors on a zero quantity", () => {
    const result = parseRecipeBody("Add @Salt(3){0%g}.");
    expect(result.lines).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/positive/i);
  });

  it("errors on a negative quantity", () => {
    const result = parseRecipeBody("Add @Salt(3){-5%g}.");
    expect(result.lines).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/positive/i);
  });

  it("accepts a positive fractional quantity (e.g. 0.5)", () => {
    const result = parseRecipeBody("Add @Salt(3){0.5%g}.");
    expect(result.errors).toEqual([]);
    expect(result.lines).toEqual([{ ingredientId: 3, quantity: 0.5, unit: "g" }]);
  });

  it("errors on a malformed unit inside the quantity block", () => {
    const result = parseRecipeBody("Add @Flour(9){2%nonsenseunit}.");
    expect(result.lines).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/unit/i);
  });

  it("emits one line per occurrence when the same ingredient is mentioned twice (summed later by matching, not here)", () => {
    const result = parseRecipeBody(
      "Add half the @Rice, white, long-grain, cooked(5){100%g} now, and the rest @Rice, white, long-grain, cooked(5){100%g} later.",
    );
    expect(result.errors).toEqual([]);
    expect(result.lines).toEqual([
      { ingredientId: 5, quantity: 100, unit: "g" },
      { ingredientId: 5, quantity: 100, unit: "g" },
    ]);
  });

  it("leaves an unlinked bare @ as inert plain text — no line, no error", () => {
    const result = parseRecipeBody("Email me @ my-address for the full recipe.");
    expect(result.lines).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("returns no lines and no errors for a body with zero mentions", () => {
    const result = parseRecipeBody("Just mix everything together and serve.");
    expect(result.lines).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("does not mutate or depend on any external catalog lookup (pure function of the text alone)", () => {
    const a = parseRecipeBody("@Butter(1){10%g}");
    const b = parseRecipeBody("@Butter(1){10%g}");
    expect(a).toEqual(b);
  });

  it("treats cookware and timer tokens as inert plain text (non-goal, design.md)", () => {
    const result = parseRecipeBody("Heat the #pot{} and simmer ~{10%minutes} with @Water(1){500%mL}.");
    expect(result.errors).toEqual([]);
    expect(result.lines).toEqual([{ ingredientId: 1, quantity: 500, unit: "mL" }]);
  });
});

describe("stripMentionIds", () => {
  it("strips the (id) annotation from a mention, leaving the rest intact", () => {
    expect(stripMentionIds("Add @Onion, yellow, medium(11){1} to the pan.")).toBe(
      "Add @Onion, yellow, medium{1} to the pan.",
    );
  });

  it("strips multiple mentions in one body", () => {
    expect(stripMentionIds("@Egg(7){2} and @Flour(9){200%g}.")).toBe("@Egg{2} and @Flour{200%g}.");
  });

  it("leaves non-mention text, including a bare @, completely untouched", () => {
    const text = "Email me @ my-address, no ingredients here.";
    expect(stripMentionIds(text)).toBe(text);
  });

  it("leaves a mention with no quantity block untouched aside from stripping its id", () => {
    expect(stripMentionIds("@Salt(3) to taste")).toBe("@Salt to taste");
  });
});
