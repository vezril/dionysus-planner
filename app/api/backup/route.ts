/** openspec: backup-export — the lossless JSON bundle. */
import { buildFullBackup } from "@/data/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(await buildFullBackup(), { status: 200 });
}
