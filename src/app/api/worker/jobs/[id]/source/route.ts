import { sql } from "drizzle-orm";
import { db } from "@/db";
import { isWorker, notFoundJson, unauthorized } from "@/lib/api-auth";
import { streamFile } from "@/lib/file-delivery";

/** GET → original file bytes for a job the worker currently holds. */
export async function GET(req: Request, ctx: RouteContext<"/api/worker/jobs/[id]/source">) {
  if (!isWorker(req)) return unauthorized();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return notFoundJson();
  const { rows } = await db.execute(sql`SELECT file_id FROM ingest_jobs WHERE id = ${id} AND status = 'processing'`);
  const fileId = (rows[0] as { file_id: string } | undefined)?.file_id;
  if (!fileId) return notFoundJson();
  const out = await streamFile(fileId, { download: true });
  return out?.response ?? notFoundJson();
}
