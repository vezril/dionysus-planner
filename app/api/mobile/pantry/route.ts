/** openspec: mobile-api — pantry rows for the companion app. */
import { getPantryList } from "@/data/pantry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(await getPantryList(), { status: 200 });
}
