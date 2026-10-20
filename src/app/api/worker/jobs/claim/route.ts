import { sql } from "drizzle-orm";
import { db } from "@/db";
import { isWorker, json, unauthorized } from "@/lib/api-auth";

/**
 * POST {workerId?, limit?, leaseSeconds?} → claims up to `limit` OCR jobs.
 * FOR UPDATE SKIP LOCKED lets many workers poll the same queue without contention;
 * expired leases (crashed workers) are re-claimed automatically.
 */
export async function POST(req: Request) {
  if (!isWorker(req)) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { workerId?: string; limit?: number; leaseSeconds?: number };
  const limit = Math.min(Math.max(Number(body.limit) || 1, 1), 10);
  const lease = Math.min(Math.max(Number(body.leaseSeconds) || 900, 60), 7200);
  const workerId = String(body.workerId ?? "worker").slice(0, 64);
  const { rows } = await db.execute(sql`
    UPDATE ingest_jobs j SET status = 'processing', attempts = j.attempts + 1, locked_by = ${workerId},
      lease_expires_at = now() + make_interval(secs => ${lease}), updated_at = now()
    WHERE j.id IN (
      SELECT id FROM ingest_jobs
      WHERE (status = 'queued' OR (status = 'processing' AND lease_expires_at < now())) AND attempts < max_attempts
      ORDER BY priority, created_at
      FOR UPDATE SKIP LOCKED LIMIT ${limit})
    RETURNING j.id, j.record_id, j.file_id, j.mode, j.engine, j.languages, j.attempts, j.lease_expires_at`);
  const jobs = [];
  for (const j of rows as { id: string; record_id: string; file_id: string; mode: string; engine: string; languages: string; attempts: number; lease_expires_at: string }[]) {
    const { rows: f } = await db.execute(sql`SELECT filename, mime_type, size_bytes::int AS size, sha256 FROM record_files WHERE id = ${j.file_id}`);
    jobs.push({ ...j, file: f[0] ?? null, sourceUrl: `/api/worker/jobs/${j.id}/source` });
  }
  return json({ jobs });
}
