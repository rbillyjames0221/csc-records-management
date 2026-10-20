import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { ingestJobs, recordFiles } from "@/db/schema";
import { isWorker, json, notFoundJson, unauthorized } from "@/lib/api-auth";
import { sha256Hex } from "@/lib/crypto";
import { sniffMime } from "@/lib/ingest";
import { storage, storageKeyFor } from "@/lib/storage";

/**
 * PUT (raw application/pdf body) – stores the searchable PDF/A produced by OCRmyPDF as the
 * record's "access" copy. Note: Vercel Functions cap request bodies at 4.5 MB; larger PDF/A
 * outputs should be written by an on-prem worker straight to shared storage (see worker/README).
 */
export async function PUT(req: Request, ctx: RouteContext<"/api/worker/jobs/[id]/artifact">) {
  if (!isWorker(req)) return unauthorized();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return notFoundJson();
  const [job] = await db.select().from(ingestJobs).where(and(eq(ingestJobs.id, id), eq(ingestJobs.status, "processing")));
  if (!job) return notFoundJson();
  const buf = Buffer.from(await req.arrayBuffer());
  if (sniffMime(buf) !== "application/pdf") return json({ error: "expected application/pdf" }, 415);
  const sha = sha256Hex(buf);
  const [orig] = await db.select().from(recordFiles).where(eq(recordFiles.id, job.fileId));
  const name = (orig?.filename ?? "document.pdf").replace(/\.\w+$/, "") + "_pdfa.pdf";
  const s = storage();
  const key = storageKeyFor(job.recordId, sha, name);
  await s.put(key, buf, "application/pdf");
  await db.transaction(async (tx) => {
    await tx.update(recordFiles).set({ deletedAt: new Date() }).where(and(eq(recordFiles.recordId, job.recordId), eq(recordFiles.kind, "access"), isNull(recordFiles.deletedAt)));
    await tx.insert(recordFiles).values({ recordId: job.recordId, kind: "access", storageDriver: s.name, storageKey: key, filename: name, mimeType: "application/pdf", sizeBytes: buf.length, sha256: sha, pageCount: orig?.pageCount ?? null })
      .onConflictDoNothing();
  });
  return json({ ok: true, sha256: sha, size: buf.length });
}
