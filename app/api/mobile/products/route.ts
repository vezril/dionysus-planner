/** openspec: mobile-api — the scanner flow: look a barcode up locally
 * (404 when unknown), create a product (with optional initial stock)
 * through the same action as the web quick-create dialog. */
import { createCustomPantryItem } from "@/app/actions/custom-pantry-item-actions";
import { findIngredientByBarcode } from "@/data/customPantryItems";
import { withRouteLog } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withRouteLog(request, async () => {
    const barcode = new URL(request.url).searchParams.get("barcode");
    if (!barcode) return Response.json({ error: { code: "VALIDATION_ERROR", message: "barcode required" } }, { status: 400 });
    const ingredient = await findIngredientByBarcode(barcode);
    if (!ingredient) return Response.json({ error: { code: "NOT_FOUND", message: "No product with that barcode." } }, { status: 404 });
    return Response.json(ingredient, { status: 200 });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withRouteLog(request, async () => {
    const result = await createCustomPantryItem(await request.json().catch(() => null));
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    return Response.json(result.data, { status: 201 });
  });
}
