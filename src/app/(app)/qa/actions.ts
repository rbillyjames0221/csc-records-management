"use server";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { qaChecks, recordPages, records } from "@/db/schema";
import { assertPermission } from "@/lib/session";
import { getReadableRecord, refreshRecordOcrStats } from "@/lib/records";
import { audit } from "@/lib/audit";
import { QA_CHECKS } from "@/lib/constants";

export async function savePageCorrection(recordId: string, pageNo: number, text: string, accept: boolean) {
  const actor = await assertPermission("qa.review");
  if (!(await getReadableRecord(actor, recordId))) throw new Error("Not found");
  await db.update(recordPages).set({
    text: text.slice(0, 200_000), needsReview: false, reviewedBy: actor.id, reviewedAt: new Date(), updatedAt: new Date(),
    ...(accept ? {} : { confidence: 100, ocrEngine: "human-corrected" }),
  }).where(and(eq(recordPages.recordId, recordId), eq(recordPages.pageNo, pageNo)));
  await refreshRecordOcrStats(recordId);
  await audit(actor, accept ? "qa.page_accept" : "qa.page_correct", "record", recordId, { pageNo, chars: text.length });
  revalidatePath(`/qa/${recordId}`);
  revalidatePath("/qa");
}

export async function approveRecord(recordId: string, checks: Record<string, boolean>, note: string) {
  const actor = await assertPermission("qa.review");
  if (!(await getReadableRecord(actor, recordId))) throw new Error("Not found");
  for (const c of QA_CHECKS) {
    const passed = !!checks[c.key];
    await db.insert(qaChecks).values({ recordId, checkKey: c.key, passed, note: note || null, checkedBy: actor.id })
      .onConflictDoUpdate({ target: [qaChecks.recordId, qaChecks.checkKey], set: { passed, note: note || null, checkedBy: actor.id, checkedAt: new Date() } });
  }
  const [{ review }] = (await db.execute(sql`SELECT count(*)::int AS review FROM record_pages WHERE record_id = ${recordId} AND needs_review`)).rows as { review: number }[];
  const allPassed = QA_CHECKS.every((c) => checks[c.key]);
  if (allPassed && review === 0) await db.update(records).set({ status: "active", updatedBy: actor.id }).where(eq(records.id, recordId));
  await audit(actor, allPassed && review === 0 ? "qa.approve" : "qa.update", "record", recordId, { checks, pendingPages: review });
  revalidatePath(`/qa/${recordId}`);
  revalidatePath("/qa");
  return { activated: allPassed && review === 0, pendingPages: review };
}
