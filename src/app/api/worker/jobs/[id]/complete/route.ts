import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { ingestJobs, records, textLayerEnum } from "@/db/schema";
import { isWorker, json, notFoundJson, unauthorized, WORKER_ACTOR } from "@/lib/api-auth";
import { upsertPages } from "@/lib/records";
import { audit } from "@/lib/audit";
import { pageInput } from "@/lib/validation";

const body = z.object({
  engine: z.string().min(2).max(60),
  textLayer: z.enum(textLayerEnum.enumValues).optional(),
  pages: z.array(pageInput).max(20000),
  stats: z.record(z.string(), z.unknown()).optional(),
});

/** POST {engine, pages:[{pageNo,text,confidence}], textLayer?, stats?} – stores OCR text, marks job done. */
export async function POST(req: Request, ctx: RouteContext<"/api/worker/jobs/[id]/complete">) {
  if (!isWorker(req)) return unauthorized();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return notFoundJson();
  const [job] = await db.select().from(ingestJobs).where(and(eq(ingestJobs.id, id), eq(ingestJobs.status, "processing")));
  if (!job) return notFoundJson();
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "validation", issues: p.error.issues.slice(0, 10) }, 422);
  await db.update(ingestJobs).set({ status: "done", finishedAt: new Date(), updatedAt: new Date(), leaseExpiresAt: null, error: null, result: { pages: p.data.pages.length, ...(p.data.stats ?? {}) } }).where(eq(ingestJobs.id, id));
  if (p.data.textLayer) await db.update(records).set({ textLayer: p.data.textLayer }).where(eq(records.id, job.recordId));
  await upsertPages(job.recordId, p.data.pages, p.data.engine, job.fileId);
  await audit(WORKER_ACTOR, "ocr.complete", "record", job.recordId, { jobId: id, engine: p.data.engine, pages: p.data.pages.length });
  const [r] = await db.select({ status: records.status, ocrConfidence: records.ocrConfidence }).from(records).where(eq(records.id, job.recordId));
  return json({ ok: true, record: r });
}
