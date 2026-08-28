/** openspec: backup-export — the same bundle rendered as Obsidian-ready
 * markdown files ({files: [{path, content}]}). */
import { buildFullBackup } from "@/data/backup";
import { renderBackupMarkdown } from "@/domain/backupMarkdown";
import { withRouteLog } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withRouteLog(request, async () => {
    const bundle = await buildFullBackup();
    return Response.json({ exportedAt: bundle.exportedAt, files: renderBackupMarkdown(bundle) }, { status: 200 });
  });
}
