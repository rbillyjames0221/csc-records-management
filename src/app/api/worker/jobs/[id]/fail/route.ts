import { sql } from "drizzle-orm";
import { db } from "@/db";
import { isWorker, json, notFoundJson, unauthorized, WORKER_ACTOR } from "@/lib/api-auth";
import { refreshRecordOcrStats } from "@/lib/records";
import { audit } from "@/lib/audit";

/** POST {error, retry?} – requeues until max_attempts, then marks failed. */
export async function POST(req: Request, ctx: RouteContext<"/api/worker/jobs/[id]/fail">) {
  if (!isWorker(req)) return unauthorized();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return notFoundJson();
  const b = (await req.json().catch(() => ({}))) as { error?: string; retry?: boolean };
  const { rows } = await db.execute(sql`
    UPDATE ingest_jobs SET error = ${String(b.error ?? "unknown").slice(0, 2000)}, updated_at = now(), lease_expires_at = NULL, locked_by = NULL,
      status = CASE WHEN ${b.retry !== false} AND attempts < max_attempts THEN 'queued'::job_status ELSE 'failed'::job_status END,
      finished_at = CASE WHEN ${b.retry !== false} AND attempts < max_attempts THEN NULL ELSE now() END
    WHERE id = ${id} AND status = 'processing' RETURNING record_id, status`);
  const r = rows[0] as { record_id: string; status: string } | undefined;
  if (!r) return notFoundJson();
  await refreshRecordOcrStats(r.record_id);
  await audit(WORKER_ACTOR, "ocr.fail", "record", r.record_id, { jobId: id, error: b.error, status: r.status });
  return json({ ok: true, status: r.status });
}
