"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { dispositionRequests, finalDisposition, recordFiles, recordPages, records, retentionSchedules, shareLinks } from "@/db/schema";
import { assertPermission } from "@/lib/session";
import { audit } from "@/lib/audit";
import { storageFor } from "@/lib/storage";

type State = { error?: string; ok?: boolean } | null;

export async function decideDisposition(requestId: string, approve: boolean, _: State, fd: FormData): Promise<State> {
  const actor = await assertPermission("disposition.approve");
  const note = String(fd.get("note") ?? "").trim();
  const authorityRef = String(fd.get("authorityRef") ?? "").trim();
  const [req] = await db.select().from(dispositionRequests).where(eq(dispositionRequests.id, requestId));
  if (!req || req.status !== "pending") return { error: "Request is no longer pending." };
  if (approve && req.action === "destroy" && !authorityRef) return { error: "Destruction requires the NAP Authority to Dispose reference." };
  if (req.requestedBy === actor.id) return { error: "Segregation of duties: you cannot approve your own request." };
  await db.update(dispositionRequests).set({ status: approve ? "approved" : "rejected", decidedBy: actor.id, decidedAt: new Date(), decisionNote: note || null, authorityRef: authorityRef || null }).where(eq(dispositionRequests.id, requestId));
  await audit(actor, approve ? "disposition.approve" : "disposition.reject", "record", req.recordId, { requestId, action: req.action, note, authorityRef });
  revalidatePath("/retention");
  return { ok: true };
}

export async function executeDisposition(requestId: string) {
  const actor = await assertPermission("disposition.request");
  const [req] = await db.select().from(dispositionRequests).where(eq(dispositionRequests.id, requestId));
  if (!req || req.status !== "approved") throw new Error("Only approved requests can be executed");
  const [rec] = await db.select().from(records).where(eq(records.id, req.recordId));
  if (!rec) throw new Error("Record not found");
  if (rec.legalHold) throw new Error("Record is on legal hold – cannot execute");
  let filesRemoved = 0;
  if (req.action === "destroy") {
    const files = await db.select().from(recordFiles).where(and(eq(recordFiles.recordId, rec.id), isNull(recordFiles.deletedAt)));
    for (const f of files) {
      try { await storageFor(f.storageDriver).delete(f.storageKey); } catch { /* already gone */ }
      filesRemoved++;
    }
    await db.transaction(async (tx) => {
      await tx.update(recordFiles).set({ deletedAt: new Date() }).where(eq(recordFiles.recordId, rec.id));
      await tx.delete(recordPages).where(eq(recordPages.recordId, rec.id));
      await tx.update(shareLinks).set({ revokedAt: new Date() }).where(and(eq(shareLinks.recordId, rec.id), isNull(shareLinks.revokedAt)));
      // Tombstone: keep register metadata (record no., title, dates, authority) for accountability; drop content.
      await tx.update(records).set({ status: "disposed", description: null, metadata: { disposed: "true", authorityRef: req.authorityRef ?? "" }, pageCount: 0, updatedBy: actor.id }).where(eq(records.id, rec.id));
    });
  } else if (req.action === "transfer") {
    await db.update(records).set({ status: "transferred", updatedBy: actor.id }).where(eq(records.id, rec.id));
  } else {
    await db.update(records).set({ dispositionDue: null, updatedBy: actor.id }).where(eq(records.id, rec.id));
  }
  await db.update(dispositionRequests).set({ status: "executed", executedAt: new Date() }).where(eq(dispositionRequests.id, requestId));
  await audit(actor, "disposition.execute", "record", rec.id, { requestId, action: req.action, authorityRef: req.authorityRef, filesRemoved });
  revalidatePath("/retention");
  revalidatePath(`/records/${rec.id}`);
}

const schedSchema = z.object({
  code: z.string().trim().regex(/^[A-Z0-9-]{2,20}$/),
  recordSeries: z.string().trim().min(3).max(200),
  activeYears: z.coerce.number().int().min(0).max(200),
  inactiveYears: z.coerce.number().int().min(0).max(200),
  permanent: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  finalDisposition: z.enum(finalDisposition.enumValues),
  legalBasis: z.string().trim().max(300).optional(),
  description: z.string().trim().max(500).optional(),
});

export async function saveSchedule(_: State, fd: FormData): Promise<State> {
  const actor = await assertPermission("retention.manage");
  const p = schedSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const id = String(fd.get("id") || "") || p.data.code;
  await db.insert(retentionSchedules).values({ id, ...p.data }).onConflictDoUpdate({ target: retentionSchedules.id, set: { ...p.data, updatedAt: new Date() } });
  // Recompute due dates for records on this schedule (not on hold / not disposed)
  await db.execute(sql`UPDATE records r SET disposition_due = CASE WHEN s.permanent THEN NULL ELSE (r.date_created + make_interval(years => s.active_years + s.inactive_years))::date END
    FROM retention_schedules s WHERE s.id = r.retention_schedule_id AND s.id = ${id} AND r.status NOT IN ('disposed','transferred') AND r.date_created IS NOT NULL`);
  await audit(actor, "retention.save", "retention_schedule", id, p.data);
  revalidatePath("/retention");
  return { ok: true };
}
