import { Suspense } from "react";
import { Clock, Download, Link2Off } from "lucide-react";
import { resolveShare, shareFile } from "@/lib/share";
import { loadRecord } from "@/lib/records";
import { writeAudit } from "@/lib/audit";
import { maskPII } from "@/lib/pii";
import { RECORD_TYPE_LABELS } from "@/lib/constants";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { EmptyState, KV, SampleBadge } from "@/components/rms";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileViewer } from "@/app/(app)/records/[id]/file-viewer";

export const metadata = { title: "Shared record", robots: { index: false, follow: false } };

async function Shared({ params }: { params: PageProps<"/s/[token]">["params"] }) {
  const { token } = await params;
  const link = await resolveShare(token, true);
  if (!link) return <EmptyState icon={Link2Off} title="This link is not available">It may have expired, reached its maximum number of uses, or been revoked. Contact the CSC records office that shared it.</EmptyState>;
  const rec = await loadRecord(link.record_id);
  if (!rec || rec.status === "disposed") return <EmptyState icon={Link2Off} title="Record no longer available" />;
  const f = await shareFile(rec.id);
  await writeAudit({ actorId: null, actorLabel: "Share link visitor", actorRole: "public", action: "share.open", entityType: "record", entityId: rec.id, details: { linkId: link.id, uses: link.uses } });
  return (
    <>
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">{rec.record_no} · {RECORD_TYPE_LABELS[rec.record_type as keyof typeof RECORD_TYPE_LABELS]}{rec.is_sample && <SampleBadge />}</div>
      <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">{rec.title}</h1>
      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="size-3.5" /> Shared link · expires {fmtDateTime(link.expires_at)}{link.max_uses ? ` · use ${link.uses} of ${link.max_uses}` : ""}</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card><CardContent>{f ? <FileViewer fileId={f.id} mime={f.mimeType} filename={f.filename} src={`/api/share/${token}/file`} /> : <p className="text-sm text-muted-foreground">{rec.redaction_required ? "A redacted copy has not been released yet." : "No digital copy attached."}</p>}</CardContent></Card>
        <Card><CardContent>
          <dl>
            <KV label="Document no.">{rec.document_number}</KV>
            <KV label="Date">{fmtDate(rec.date_created)}</KV>
            <KV label="Office">{rec.office_name}</KV>
            {rec.description && <KV label="Summary">{rec.contains_pii ? maskPII(rec.description) : rec.description}</KV>}
          </dl>
          {f && link.allow_download && <a href={`/api/share/${token}/file?download=1`} className={buttonVariants({ variant: "outline", className: "mt-4 w-full" })}><Download className="size-4" /> Download</a>}
          <p className="mt-4 text-xs text-muted-foreground">Access to this document is logged. Do not forward this link.</p>
        </CardContent></Card>
      </div>
    </>
  );
}

export default function Page(props: PageProps<"/s/[token]">) {
  return <Suspense fallback={<Skeleton className="h-[70vh]" />}><Shared params={props.params} /></Suspense>;
}
