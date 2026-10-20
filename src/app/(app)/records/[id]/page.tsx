import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { ArrowLeft, CheckCircle2, CircleAlert, FileWarning, Link2, MapPin } from "lucide-react";
import { db } from "@/db";
import { auditEvents, ingestJobs, qaChecks, recordPages, shareLinks } from "@/db/schema";
import { requireStaff } from "@/lib/session";
import { can, canDownload, canEditRecord, mustMaskPII } from "@/lib/rbac";
import { getReadableRecord, liveFiles } from "@/lib/records";
import { audit } from "@/lib/audit";
import { maskPII } from "@/lib/pii";
import { CATEGORY_LABELS, QA_CHECKS, RECORD_TYPE_LABELS, TYPE_FIELDS } from "@/lib/constants";
import { fmtBytes, fmtDate, fmtDateTime } from "@/lib/format";
import { KV, PageHeader, SampleBadge, SensitivityBadge, StatusBadge, TextLayerBadge } from "@/components/rms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { RecordActions } from "./record-actions";
import { FileViewer } from "./file-viewer";
import { RevokeButton } from "./revoke-button";

async function RecordDetail({ params, searchParams }: { params: PageProps<"/records/[id]">["params"]; searchParams: PageProps<"/records/[id]">["searchParams"] }) {
  const actor = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const rec = await getReadableRecord(actor, id);
  if (!rec) {
    await audit(actor, "record.denied_or_missing", "record", id, {});
    notFound();
  }
  const mask = mustMaskPII(actor);
  const [files, pages, checks, jobs, relations, history, links] = await Promise.all([
    liveFiles(id),
    db.select().from(recordPages).where(eq(recordPages.recordId, id)).orderBy(recordPages.pageNo).limit(500),
    db.select().from(qaChecks).where(eq(qaChecks.recordId, id)),
    db.select().from(ingestJobs).where(eq(ingestJobs.recordId, id)).orderBy(desc(ingestJobs.createdAt)).limit(5),
    db.execute(sql`
      SELECT rr.relation, 'outgoing' AS dir, r.id, r.title, r.record_no, r.sensitivity, r.office_id, r.status FROM record_relations rr JOIN records r ON r.id = rr.related_id WHERE rr.record_id = ${id}
      UNION ALL
      SELECT rr.relation, 'incoming', r.id, r.title, r.record_no, r.sensitivity, r.office_id, r.status FROM record_relations rr JOIN records r ON r.id = rr.record_id WHERE rr.related_id = ${id}`),
    can(actor, "audit.view") || actor.role === "records_officer"
      ? db.select().from(auditEvents).where(and(eq(auditEvents.entityType, "record"), eq(auditEvents.entityId, id))).orderBy(desc(auditEvents.at)).limit(50)
      : Promise.resolve([]),
    can(actor, "share.create") ? db.select().from(shareLinks).where(and(eq(shareLinks.recordId, id), isNull(shareLinks.revokedAt))).orderBy(desc(shareLinks.createdAt)) : Promise.resolve([]),
  ]);
  await audit(actor, "record.view", "record", id, { title: rec.title });

  const original = files.find((f) => f.kind === "access") ?? files.find((f) => f.kind === "original") ?? null;
  const allowDownload = canDownload(actor, { sensitivity: rec.sensitivity, officeId: rec.office_id, status: rec.status, redactionRequired: rec.redaction_required });
  const canEdit = canEditRecord(actor, { officeId: rec.office_id, sensitivity: rec.sensitivity, status: rec.status });
  const typeFields = TYPE_FIELDS[rec.record_type as keyof typeof TYPE_FIELDS] ?? [];
  const passed = new Map(checks.map((c) => [c.checkKey, c.passed]));
  const visibleRelations = (relations.rows as { relation: string; dir: string; id: string; title: string; record_no: string; sensitivity: string; office_id: string | null; status: string }[]);
  const initialPage = Number(sp.page) || 1;
  const reviewCount = pages.filter((p) => p.needsReview).length;

  return (
    <>
      <Link href="/records" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Records</Link>
      <PageHeader
        eyebrow={`${rec.record_no} · ${RECORD_TYPE_LABELS[rec.record_type as keyof typeof RECORD_TYPE_LABELS]}`}
        title={rec.title}
        description={
          <span className="flex flex-wrap items-center gap-1.5 pt-1">
            {rec.is_sample && <SampleBadge />}
            <SensitivityBadge value={rec.sensitivity} />
            <StatusBadge value={rec.status} />
            <TextLayerBadge value={rec.text_layer} />
            {rec.legal_hold && <Badge variant="destructive">Legal hold</Badge>}
            {rec.contains_pii && <Badge variant="outline">Contains personal data</Badge>}
          </span>
        }
        actions={
          <RecordActions
            id={rec.id} fileId={original?.id ?? null} canDownload={allowDownload} canEdit={canEdit} canShare={can(actor, "share.create")}
            canDispose={can(actor, "disposition.request") && !rec.legal_hold && !["disposed", "transferred"].includes(rec.status)} canReOcr={can(actor, "qa.review")} redaction={rec.redaction_required}
          />
        }
      />
      {sp.saved && <Alert className="mb-4"><CheckCircle2 className="size-4" /><AlertTitle>Saved</AlertTitle><AlertDescription>Metadata updated and logged in the audit trail.</AlertDescription></Alert>}
      {rec.status === "disposed" && <Alert className="mb-4" variant="destructive"><FileWarning className="size-4" /><AlertTitle>Disposed</AlertTitle><AlertDescription>Content was destroyed under an approved disposition. Only the metadata tombstone remains.</AlertDescription></Alert>}
      {reviewCount > 0 && can(actor, "qa.review") && (
        <Alert className="mb-4"><CircleAlert className="size-4" /><AlertTitle>{reviewCount} page(s) below the OCR confidence threshold</AlertTitle><AlertDescription><Link className="text-primary underline" href={`/qa/${rec.id}`}>Open side-by-side QA review →</Link></AlertDescription></Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Card>
            <CardContent>
              {original ? (
                <FileViewer fileId={original.id} mime={original.mimeType} initialPage={initialPage} filename={original.filename} />
              ) : (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  <MapPin className="size-6" />
                  No digital file attached{rec.physical_location ? <> · Physical location: <span className="font-medium text-foreground">{rec.physical_location}</span></> : "."}
                  {rec.is_sample && <span className="text-xs">(Synthetic SAMPLE record: metadata and text only.)</span>}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Tabs defaultValue="metadata">
            <TabsList className="w-full overflow-x-auto">
              <TabsTrigger value="metadata">Metadata</TabsTrigger>
              <TabsTrigger value="text">OCR text</TabsTrigger>
              <TabsTrigger value="qa">QA & files</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <TabsContent value="metadata">
              <Card><CardContent>
                <dl>
                  <KV label="Record ID">{rec.record_no}</KV>
                  <KV label="Document no.">{rec.document_number}</KV>
                  <KV label="Title / description">{rec.description ? (mask ? maskPII(rec.description) : rec.description) : rec.title}</KV>
                  <KV label="Record type">{RECORD_TYPE_LABELS[rec.record_type as keyof typeof RECORD_TYPE_LABELS]}</KV>
                  <KV label="Classification">{rec.classification_code} – {rec.classification_name}<div className="text-xs text-muted-foreground">{CATEGORY_LABELS[rec.category as keyof typeof CATEGORY_LABELS]}</div></KV>
                  <KV label="Office / origin">{rec.office_name}</KV>
                  <KV label="Date created">{fmtDate(rec.date_created)}</KV>
                  <KV label="Date received">{fmtDate(rec.date_received)}</KV>
                  <KV label="Retention">{rec.retention_code ? <>{rec.retention_code}: {rec.permanent ? "Permanent" : `${rec.active_years} active + ${rec.inactive_years} inactive yrs → ${rec.final_disposition}`}<div className="text-xs text-muted-foreground">Disposition due: {rec.permanent ? "n/a (permanent)" : fmtDate(rec.disposition_due)}</div></> : "—"}</KV>
                  <KV label="Access rights"><SensitivityBadge value={rec.sensitivity} />{rec.redaction_required && <div className="mt-1 text-xs text-destructive">Redaction required before release</div>}</KV>
                  <KV label="Physical location">{rec.physical_location}</KV>
                  <KV label="Keywords / tags">{rec.keywords.length ? <span className="flex flex-wrap gap-1">{rec.keywords.map((k) => <Link key={k} href={`/records?q=${encodeURIComponent(k)}`}><Badge variant="secondary">{k}</Badge></Link>)}</span> : "—"}</KV>
                  {typeFields.map((f) => <KV key={f.key} label={f.label}>{rec.metadata?.[f.key] ? (mask ? "•••" : rec.metadata[f.key]) : "—"}</KV>)}
                  <KV label="Language">{rec.language}</KV>
                  <KV label="Source / OCR">{rec.source_format.replace("_", " ")} · {rec.ocr_engine ?? "—"}{rec.ocr_confidence != null && ` · ${Math.round(rec.ocr_confidence)}% avg confidence`}</KV>
                  <KV label="Filed by">{rec.created_by_name ?? "—"} · {fmtDateTime(rec.created_at)}</KV>
                </dl>
              </CardContent></Card>
              <Card className="mt-4">
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Link2 className="size-4" /> Related records</CardTitle></CardHeader>
                <CardContent>
                  {visibleRelations.length === 0 ? <p className="text-sm text-muted-foreground">None linked.</p> : (
                    <ul className="flex flex-col gap-2 text-sm">
                      {visibleRelations.map((r) => (
                        <li key={r.id + r.relation + r.dir}><Link href={`/records/${r.id}`} className="hover:underline">{r.title}</Link> <span className="text-xs text-muted-foreground">({r.dir === "outgoing" ? r.relation : `${r.relation} ←`} · {r.record_no})</span></li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="text">
              <Card><CardContent className="flex flex-col gap-4">
                {pages.length === 0 ? <p className="text-sm text-muted-foreground">No text indexed yet{jobs[0] ? ` (OCR job ${jobs[0].status})` : ""}.</p> : pages.map((p) => (
                  <section key={p.pageNo} aria-label={`Page ${p.pageNo}`}>
                    <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">Page {p.pageNo}</span>
                      <span>· {p.ocrEngine}</span>
                      {p.confidence != null && <span className={p.confidence < 80 ? "text-destructive" : ""}>· {Math.round(p.confidence)}%</span>}
                      {p.needsReview && <Badge variant="outline" className="text-[10px]">needs review</Badge>}
                    </div>
                    <pre className="max-h-80 overflow-auto rounded-lg bg-muted/50 p-3 font-sans text-xs leading-relaxed whitespace-pre-wrap">{(mask ? maskPII(p.text) : p.text).trim() || "(empty page)"}</pre>
                  </section>
                ))}
              </CardContent></Card>
            </TabsContent>
            <TabsContent value="qa">
              <Card><CardContent className="flex flex-col gap-4">
                <div>
                  <div className="mb-2 text-sm font-medium">QA / validation checklist</div>
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {QA_CHECKS.map((c) => (
                      <li key={c.key} className="flex items-start gap-2">
                        {passed.get(c.key) ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />}
                        <span>{c.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="mb-2 text-sm font-medium">Files (central repository)</div>
                  {files.length === 0 ? <p className="text-sm text-muted-foreground">None</p> : (
                    <ul className="flex flex-col gap-2 text-xs">
                      {files.map((f) => (
                        <li key={f.id} className="rounded-lg border p-2">
                          <div className="font-medium break-all">{f.filename}</div>
                          <div className="text-muted-foreground">{f.kind} · {f.mimeType} · {fmtBytes(f.sizeBytes)} · {f.pageCount ?? "?"} p. · {f.storageDriver}</div>
                          <div className="font-mono break-all text-muted-foreground">SHA-256 {f.sha256}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {jobs.length > 0 && (
                  <div>
                    <div className="mb-2 text-sm font-medium">OCR jobs</div>
                    <ul className="flex flex-col gap-1 text-xs">{jobs.map((j) => <li key={j.id}>{j.status} · {j.mode} · {j.engine} ({j.languages}) · attempts {j.attempts} · {fmtDateTime(j.createdAt)}{j.error && <span className="text-destructive"> · {j.error}</span>}</li>)}</ul>
                  </div>
                )}
                {links.length > 0 && (
                  <div>
                    <div className="mb-2 text-sm font-medium">Active share links</div>
                    <ul className="flex flex-col gap-1.5 text-xs">
                      {links.map((l) => (
                        <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                          <span>Expires {fmtDateTime(l.expiresAt)} · used {l.uses}{l.maxUses ? `/${l.maxUses}` : ""}{l.allowDownload ? " · download" : ""}{l.note ? ` · ${l.note}` : ""}</span>
                          <RevokeButton recordId={rec.id} linkId={l.id} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent></Card>
            </TabsContent>
            <TabsContent value="history">
              <Card><CardContent>
                {history.length === 0 ? <p className="text-sm text-muted-foreground">Audit history is visible to officials, administrators and records officers.</p> : (
                  <ol className="flex flex-col gap-2 text-sm">
                    {history.map((h) => (
                      <li key={h.id} className="border-b pb-2 last:border-0">
                        <div className="flex flex-wrap items-center gap-x-2"><span className="font-mono text-xs text-primary">{h.action}</span><span className="text-xs text-muted-foreground">{fmtDateTime(h.at)}</span></div>
                        <div className="text-xs">{h.actorLabel ?? "system"} ({h.actorRole ?? "—"}) · {h.ip ?? "—"}</div>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent></Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}

export default function Page(props: PageProps<"/records/[id]">) {
  return (
    <Suspense fallback={<div className="grid gap-4"><Skeleton className="h-16 w-2/3" /><div className="grid gap-4 lg:grid-cols-5"><Skeleton className="h-[60vh] lg:col-span-3" /><Skeleton className="h-[60vh] lg:col-span-2" /></div></div>}>
      <RecordDetail params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}
