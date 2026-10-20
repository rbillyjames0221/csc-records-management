"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { dispositionRequests, ingestJobs, records, retentionSchedules, classifications, shareLinks, recordFiles } from "@/db/schema";
import { getActor, assertPermission } from "@/lib/session";
import { can, canEditRecord, type Actor } from "@/lib/rbac";
import { getReadableRecord, computeDispositionDue, enqueueOcr } from "@/lib/records";
import { audit } from "@/lib/audit";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { PERSON_FIELD_KEYS } from "@/lib/constants";
import { recordInput } from "@/lib/validation";

async function readable(id: string): Promise<{ actor: Actor; rec: NonNullable<Awaited<ReturnType<typeof getReadableRecord>>> }> {
  const actor = await getActor();
  if (!actor) throw new Error("Not signed in");
  const rec = await getReadableRecord(actor, id);
  if (!rec) throw new Error("Record not found");
  return { actor, rec };
}

export type ActionState = { ok?: boolean; error?: string; message?: string; url?: string } | null;

export async function updateRecordAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const { actor, rec } = await readable(id);
  if (!canEditRecord(actor, { officeId: rec.office_id, sensitivity: rec.sensitivity, status: rec.status })) return { error: "You cannot edit this record." };
  const meta: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("meta.") && String(v).trim()) meta[k.slice(5)] = String(v).trim();
  const parsed = recordInput.safeParse({
    title: fd.get("title"), recordType: fd.get("recordType"), documentNumber: fd.get("documentNumber"), description: fd.get("description"),
    classificationId: fd.get("classificationId"), officeId: fd.get("officeId"), dateCreated: fd.get("dateCreated"), dateReceived: fd.get("dateReceived"),
    sensitivity: fd.get("sensitivity") || undefined, containsPii: fd.get("containsPii") === "on", redactionRequired: fd.get("redactionRequired") === "on",
    legalHold: fd.get("legalHold") === "on", physicalLocation: fd.get("physicalLocation"),
    keywords: String(fd.get("keywords") ?? "").split(",").map((s) => s.trim()).filter(Boolean), metadata: { ...(rec.metadata ?? {}), ...meta },
  });
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const v = parsed.data;
  if (actor.role === "regional" && v.officeId !== actor.officeId) return { error: "Regional users can only file records under their own office." };
  if (v.sensitivity === "restricted" && !["admin", "official", "records_officer"].includes(actor.role)) return { error: "Only records officers and officials can set Restricted." };
  const [c] = await db.select().from(classifications).where(eq(classifications.id, v.classificationId));
  if (!c) return { error: "Unknown classification" };
  const [sched] = c.defaultRetentionId ? await db.select().from(retentionSchedules).where(eq(retentionSchedules.id, c.defaultRetentionId)) : [];
  const before = { title: rec.title, classification: rec.classification_code, sensitivity: rec.sensitivity, legalHold: rec.legal_hold };
  await db.update(records).set({
    title: v.title, recordType: v.recordType, documentNumber: v.documentNumber ?? null, description: v.description ?? null,
    classificationId: c.id, officeId: v.officeId, dateCreated: v.dateCreated ?? null, dateReceived: v.dateReceived ?? null,
    sensitivity: v.sensitivity ?? rec.sensitivity, containsPii: v.containsPii ?? false, redactionRequired: v.redactionRequired ?? false,
    legalHold: v.legalHold ?? false, physicalLocation: v.physicalLocation ?? null, keywords: v.keywords, metadata: v.metadata,
    subjectName: PERSON_FIELD_KEYS.map((k) => v.metadata[k]).find(Boolean) ?? null,
    retentionScheduleId: sched?.id ?? null, dispositionDue: computeDispositionDue(v.dateCreated, sched ?? null), updatedBy: actor.id,
  }).where(eq(records.id, id));
  await audit(actor, "record.update", "record", id, { before, after: { title: v.title, classification: c.code, sensitivity: v.sensitivity, legalHold: v.legalHold } });
  revalidatePath(`/records/${id}`);
  redirect(`/records/${id}?saved=1`);
}

export async function createShareLinkAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const { actor, rec } = await readable(id);
  if (!can(actor, "share.create")) return { error: "You cannot create share links." };
  if (rec.sensitivity === "restricted" && !["admin", "official"].includes(actor.role)) return { error: "Restricted records can only be shared by officials." };
  const hours = Math.min(Math.max(Number(fd.get("hours") ?? 72), 1), 24 * 30);
  const maxUses = fd.get("maxUses") ? Math.min(Math.max(Number(fd.get("maxUses")), 1), 1000) : null;
  const allowDownload = fd.get("allowDownload") === "on" && !rec.redaction_required;
  const token = randomToken(24);
  await db.insert(shareLinks).values({
    recordId: id, tokenHash: sha256Hex(token), createdBy: actor.id!, expiresAt: new Date(Date.now() + hours * 3600_000), maxUses, allowDownload,
    note: String(fd.get("note") ?? "").slice(0, 300) || null,
  });
  await audit(actor, "share.create", "record", id, { hours, maxUses, allowDownload });
  revalidatePath(`/records/${id}`);
  return { ok: true, url: `/s/${token}`, message: `Link valid for ${hours} h${maxUses ? `, ${maxUses} use(s)` : ""}.` };
}

export async function revokeShareLinkAction(id: string, linkId: string) {
  const { actor } = await readable(id);
  if (!can(actor, "share.create")) throw new Error("Forbidden");
  await db.update(shareLinks).set({ revokedAt: new Date() }).where(and(eq(shareLinks.id, linkId), eq(shareLinks.recordId, id), isNull(shareLinks.revokedAt)));
  await audit(actor, "share.revoke", "record", id, { linkId });
  revalidatePath(`/records/${id}`);
}

export async function requestDispositionAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await assertPermission("disposition.request");
  const { rec } = await readable(id);
  if (rec.legal_hold) return { error: "Record is on legal hold." };
  const action = String(fd.get("action"));
  if (!["keep", "transfer", "destroy"].includes(action)) return { error: "Choose an action" };
  const reason = String(fd.get("reason") ?? "").trim();
  if (reason.length < 10) return { error: "Please give a reason (at least 10 characters)." };
  try {
    await db.insert(dispositionRequests).values({ recordId: id, action: action as "keep", reason, requestedBy: actor.id! });
  } catch {
    return { error: "There is already an open disposition request for this record." };
  }
  await audit(actor, "disposition.request", "record", id, { action, reason });
  revalidatePath(`/records/${id}`);
  revalidatePath("/retention");
  return { ok: true, message: "Disposition request submitted for approval." };
}

export async function reOcrAction(id: string) {
  const actor = await assertPermission("qa.review");
  const { rec } = await readable(id);
  const [f] = await db.select().from(recordFiles).where(and(eq(recordFiles.recordId, id), isNull(recordFiles.deletedAt), eq(recordFiles.kind, "original")));
  if (!f) throw new Error("No original file to OCR");
  const open = await db.select({ id: ingestJobs.id }).from(ingestJobs).where(and(eq(ingestJobs.recordId, id), sql`${ingestJobs.status} IN ('queued','processing')`));
  if (!open.length) await enqueueOcr(id, f.id, rec.text_layer === "born_digital" ? "force_ocr" : "redo_ocr", 3);
  await audit(actor, "ocr.requeue", "record", id, {});
  revalidatePath(`/records/${id}`);
}

export async function logPrintAction(id: string) {
  const { actor } = await readable(id);
  await audit(actor, "file.print", "record", id, {});
}
