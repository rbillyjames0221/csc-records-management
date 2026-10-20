import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { recordFiles } from "@/db/schema";
import { actorFromRequest, forbidden, json, notFoundJson, unauthorized } from "@/lib/api-auth";
import { can, canEditRecord } from "@/lib/rbac";
import { getReadableRecord, enqueueOcr } from "@/lib/records";
import { audit } from "@/lib/audit";

/** POST {fileId, mode: ocr|redo_ocr|force_ocr} – queue the file for the on-prem OCR worker. */
export async function POST(req: Request, ctx: RouteContext<"/api/v1/records/[id]/ocr-jobs">) {
  const { id } = await ctx.params;
  const actor = await actorFromRequest(req);
  if (!actor) return unauthorized();
  if (!can(actor, "record.create")) return forbidden();
  const rec = await getReadableRecord(actor, id);
  if (!rec) return notFoundJson();
  if (!canEditRecord(actor, { officeId: rec.office_id, sensitivity: rec.sensitivity, status: rec.status })) return forbidden();
  const body = (await req.json().catch(() => ({}))) as { fileId?: string; mode?: string };
  const mode = (["ocr", "redo_ocr", "force_ocr"] as const).find((m) => m === body.mode) ?? "ocr";
  const [f] = await db.select().from(recordFiles).where(and(eq(recordFiles.recordId, id), eq(recordFiles.id, String(body.fileId ?? "")), isNull(recordFiles.deletedAt)));
  if (!f) return json({ error: "file not found for this record" }, 404);
  const job = await enqueueOcr(id, f.id, mode);
  await audit(actor, "ocr.enqueue", "record", id, { jobId: job.id, mode }, req);
  return json({ job }, 201);
}
