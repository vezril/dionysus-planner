"use server";

/**
 * openspec: pantry-item-detail — purchase Server Actions, following the
 * app-wide `ActionError`/`{ ok, data | error }` contract (architecture.md
 * §6) with shared-Zod re-validation (ADR-005). No drizzle imports —
 * persistence goes through `data/purchases.ts` (§5 boundary rule).
 */
import { revalidatePath } from "next/cache";
import { purchaseSchema } from "@/domain/validation/purchase.schema";
import type { PurchaseRecord } from "@/data/purchases";
import {
  createPurchaseRecord,
  getPurchaseRecordById,
  ingredientExists,
  removePurchaseRecord,
} from "@/data/purchases";

export interface ActionError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

function validationError(fieldErrors: Record<string, string[]>): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Purchase input failed validation.",
      fieldErrors,
    },
  };
}

/**
 * Re-parses `input` with `purchaseSchema` (ADR-005); an unknown
 * `ingredientId` is `NOT_FOUND` before any write. Optional fields persist
 * as `null` (same A-1 pattern as ingredient creation). Revalidates every
 * pantry detail page — the path is dynamic, so the whole `/pantry` subtree
 * is the safe target.
 */
export async function createPurchase(input: unknown): Promise<ActionResult<PurchaseRecord>> {
  const parsed = purchaseSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.flatten().fieldErrors);
  }

  const data = parsed.data;
  if (!(await ingredientExists(data.ingredientId))) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: `Ingredient ${data.ingredientId} was not found.` },
    };
  }

  try {
    const record = await createPurchaseRecord({
      ingredientId: data.ingredientId,
      price: data.price,
      store: data.store ?? null,
      displayQuantity: data.displayQuantity ?? null,
      displayUnit: data.displayQuantity != null ? (data.displayUnit ?? null) : null,
      purchasedAt: data.purchasedAt,
    });

    revalidatePath("/pantry", "layout");
    return { ok: true, data: record };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "PERSISTENCE_ERROR",
        message: error instanceof Error ? error.message : "Failed to save the purchase.",
      },
    };
  }
}

/** A nonexistent `id` is `NOT_FOUND`; deletion is idempotent otherwise. */
export async function deletePurchase(id: number): Promise<ActionResult<{ id: number }>> {
  const existing = await getPurchaseRecordById(id);
  if (!existing) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: `Purchase ${id} was not found.` },
    };
  }

  await removePurchaseRecord(id);

  revalidatePath("/pantry", "layout");
  return { ok: true, data: { id } };
}
