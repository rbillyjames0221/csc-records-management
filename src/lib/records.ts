import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  classifications, ingestJobs, qaChecks, recordFiles, recordPages, recordRelations, records, retentionSchedules,
} from "@/db/schema";
import { PII_RECORD_TYPES, PERSON_FIELD_KEYS } from "@/lib/constants";
import { canRead, type Actor } from "@/lib/rbac";
import { recordInput, type RecordInput } from "@/lib/validation";

export const REVIEW_THRESHOLD = Number(process.env.OCR_REVIEW_THRESHOLD ?? 80);

export async function nextRecordNo(year = new Date().getFullYear()) {
  const res = await db.execute(sql`SELECT nextval('record_no_seq') AS n`);
  const n = Number((res.rows[0] as { n: string }).n);
  return `CSC-${year}-${String(n).padStart(6, "0")}`;
}

export function computeDispositionDue(dateCreated: string | null | undefined, s?: { activeYears: number; inactiveYears: number; permanent: boolean } | null) {
  if (!s || s.permanent) return null;
  const base = dateCreated ? new Date(dateCreated + "T00:00:00Z") : new Date();
  base.setUTCFullYear(base.getUTCFullYear() + s.activeYears + s.inactiveYears);
  return base.toISOString().slice(0, 10);
}

async function scheduleForClassification(classificationId: string) {
  const [c] = await db.select().from(classifications).where(eq(classifications.id, classificationId));
  if (!c) throw new Error("Unknown classification");
  let sched = null;
  if (c.defaultRetentionId) {
    [sched] = await db.select().from(retentionSchedules).where(eq(retentionSchedules.id, c.defaultRetentionId));
  }
  return { c, sched: sched ?? null };
}

export async function createRecord(actor: Actor, raw: RecordInput) {
  const input = recordInput.parse(raw);
  if (actor.role === "regional" && input.officeId !== actor.officeId) throw new Error("Regional users can only file records for their own office.");
  const { c, sched } = await scheduleForClassification(input.classificationId);
  const pii = input.containsPii ?? PII_RECORD_TYPES.includes(input.recordType);
  const sensitivity = input.sensitivity ?? (pii ? "restricted" : c.defaultSensitivity);
  const subjectName = PERSON_FIELD_KEYS.map((k) => input.metadata[k]).find(Boolean) ?? null;
  const recordNo = await nextRecordNo(input.dateCreated ? Number(input.dateCreated.slice(0, 4)) : undefined);

  return db.transaction(async (tx) => {
    const [row] = await tx.insert(records).values({
      recordNo,
      title: input.title,
      description: input.description,
      recordType: input.recordType,
      documentNumber: input.documentNumber,
      classificationId: c.id,
      officeId: input.officeId,
      dateCreated: input.dateCreated,
      dateReceived: input.dateReceived,
      retentionScheduleId: sched?.id ?? null,
      dispositionDue: computeDispositionDue(input.dateCreated, sched),
      sensitivity,
      containsPii: pii,
      redactionRequired: input.redactionRequired ?? (pii && sensitivity !== "restricted"),
      legalHold: input.legalHold ?? false,
      physicalLocation: input.physicalLocation,
      keywords: input.keywords,
      subjectName,
      language: input.language,
      status: "draft",
      sourceFormat: input.sourceFormat,
      textLayer: input.textLayer,
      metadata: input.metadata,
      isSample: input.isSample ?? false,
      createdBy: actor.via === "session" ? actor.id : null,
      updatedBy: actor.via === "session" ? actor.id : null,
    }).returning({ id: records.id, recordNo: records.recordNo });

    if (input.relatedRecordNos.length) {
      const rel = await tx.select({ id: records.id }).from(records).where(inArray(records.recordNo, input.relatedRecordNos));
      if (rel.length) await tx.insert(recordRelations).values(rel.map((r) => ({ recordId: row.id, relatedId: r.id, relation: "references" }))).onConflictDoNothing();
    }
    if (input.qa) {
      const entries = Object.entries(input.qa);
      if (entries.length) {
        await tx.insert(qaChecks).values(entries.map(([checkKey, passed]) => ({ recordId: row.id, checkKey, passed, checkedBy: actor.via === "session" ? actor.id : null })));
      }
    }
    return row;
  });
}

/** Batched upsert of page text (500 rows per statement), then recompute record OCR stats & status. */
export async function upsertPages(recordId: string, pages: { pageNo: number; text: string; confidence?: number | null }[], engine: string, fileId?: string | null) {
  for (let i = 0; i < pages.length; i += 500) {
    const chunk = pages.slice(i, i + 500).map((p) => ({
      recordId,
      pageNo: p.pageNo,
      fileId: fileId ?? null,
      text: p.text.replace(/\u0000/g, ""),
      confidence: p.confidence ?? null,
      ocrEngine: engine,
      needsReview: p.confidence != null && p.confidence < REVIEW_THRESHOLD,
    }));
    await db.insert(recordPages).values(chunk).onConflictDoUpdate({
      target: [recordPages.recordId, recordPages.pageNo],
      set: {
        text: sql`excluded.text`, confidence: sql`excluded.confidence`, ocrEngine: sql`excluded.ocr_engine`,
        needsReview: sql`excluded.needs_review`, fileId: sql`coalesce(excluded.file_id, ${recordPages.fileId})`, updatedAt: sql`now()`,
      },
    });
  }
  await refreshRecordOcrStats(recordId, engine);
}

export async function refreshRecordOcrStats(recordId: string, engine?: string) {
  await db.execute(sql`
    UPDATE records r SET
      page_count = greatest(r.page_count, s.n),
      ocr_confidence = s.conf,
      ocr_engine = coalesce(${engine ?? null}, r.ocr_engine),
      status = CASE
        WHEN r.status IN ('disposed','transferred','on_hold') THEN r.status
        WHEN s.review > 0 THEN 'qa_review'::record_status
        WHEN EXISTS (SELECT 1 FROM ingest_jobs j WHERE j.record_id = r.id AND j.status IN ('queued','processing')) THEN 'ocr_pending'::record_status
        WHEN (SELECT count(*) FROM qa_checks q WHERE q.record_id = r.id AND q.passed) >= 5 THEN 'active'::record_status
        ELSE 'qa_review'::record_status END
    FROM (SELECT count(*)::int AS n, avg(confidence)::real AS conf, count(*) FILTER (WHERE needs_review)::int AS review
          FROM record_pages WHERE record_id = ${recordId}) s
    WHERE r.id = ${recordId}`);
}

export async function enqueueOcr(recordId: string, fileId: string, mode: "ocr" | "redo_ocr" | "force_ocr", priority = 5) {
  const [job] = await db.insert(ingestJobs).values({ recordId, fileId, mode, priority }).returning({ id: ingestJobs.id });
  await db.update(records).set({ status: "ocr_pending" }).where(eq(records.id, recordId));
  return job;
}

export async function loadRecord(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const res = await db.execute(sql`
    SELECT r.*, o.name AS office_name, o.code AS office_code, c.code AS classification_code, c.name AS classification_name, c.category,
      rs.code AS retention_code, rs.record_series AS retention_series, rs.final_disposition, rs.active_years, rs.inactive_years, rs.permanent,
      cu.name AS created_by_name
    FROM records r
    LEFT JOIN offices o ON o.id = r.office_id
    LEFT JOIN classifications c ON c.id = r.classification_id
    LEFT JOIN retention_schedules rs ON rs.id = r.retention_schedule_id
    LEFT JOIN "user" cu ON cu.id = r.created_by
    WHERE r.id = ${id}`);
  return (res.rows[0] as RecordDetail | undefined) ?? null;
}

export type RecordDetail = {
  id: string; record_no: string; title: string; description: string | null; record_type: string; document_number: string | null;
  classification_id: string | null; office_id: string | null; date_created: string | null; date_received: string | null;
  retention_schedule_id: string | null; disposition_due: string | null; sensitivity: "public" | "internal" | "confidential" | "restricted";
  contains_pii: boolean; redaction_required: boolean; legal_hold: boolean; physical_location: string | null; keywords: string[];
  subject_name: string | null; language: string; status: string; source_format: string; text_layer: string; ocr_engine: string | null;
  ocr_confidence: number | null; page_count: number; metadata: Record<string, string>; is_sample: boolean; created_at: Date; updated_at: Date;
  office_name: string | null; office_code: string | null; classification_code: string | null; classification_name: string | null; category: string | null;
  retention_code: string | null; retention_series: string | null; final_disposition: string | null; active_years: number | null; inactive_years: number | null; permanent: boolean | null;
  created_by_name: string | null;
};

export async function getReadableRecord(actor: Actor, id: string) {
  const r = await loadRecord(id);
  if (!r) return null;
  if (!canRead(actor, { sensitivity: r.sensitivity, officeId: r.office_id, status: r.status })) return null;
  return r;
}

export async function liveFiles(recordId: string) {
  return db.select().from(recordFiles).where(and(eq(recordFiles.recordId, recordId), sql`${recordFiles.deletedAt} IS NULL`)).orderBy(recordFiles.createdAt);
}

export function toDateStr(d: unknown): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}
