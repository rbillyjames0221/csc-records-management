import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { portalActor } from "@/lib/public-actor";
import { getReadableRecord, liveFiles } from "@/lib/records";
import { audit } from "@/lib/audit";
import { maskPII } from "@/lib/pii";
import { RECORD_TYPE_LABELS } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { KV, SampleBadge } from "@/components/rms";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileViewer } from "@/app/(app)/records/[id]/file-viewer";

async function PublicRecord({ params, searchParams }: { params: PageProps<"/portal/[id]">["params"]; searchParams: PageProps<"/portal/[id]">["searchParams"] }) {
  const actor = await portalActor();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const rec = await getReadableRecord(actor, id);
  if (!rec) notFound();
  const sp = await searchParams;
  const files = await liveFiles(id);
  const f = files.find((x) => x.kind === "access") ?? files.find((x) => x.kind === "original");
  await audit(actor, "portal.view", "record", id, {});
  return (
    <>
      <Link href="/portal" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Back to search</Link>
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">{RECORD_TYPE_LABELS[rec.record_type as keyof typeof RECORD_TYPE_LABELS]}{rec.is_sample && <SampleBadge />}</div>
      <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">{rec.title}</h1>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card><CardContent>
          {f ? <FileViewer fileId={f.id} mime={f.mimeType} filename={f.filename} initialPage={Number(sp.page) || 1} /> : <p className="text-sm text-muted-foreground">No digital copy is available online for this record.</p>}
        </CardContent></Card>
        <Card><CardContent>
          <dl>
            <KV label="Document no.">{rec.document_number}</KV>
            <KV label="Date">{fmtDate(rec.date_created)}</KV>
            <KV label="Office">{rec.office_name}</KV>
            <KV label="Pages">{rec.page_count || "—"}</KV>
            {rec.description && <KV label="Summary">{maskPII(rec.description)}</KV>}
          </dl>
          {f && <a href={`/api/files/${f.id}?download=1`} className={buttonVariants({ variant: "outline", className: "mt-4 w-full" })}><Download className="size-4" /> Download PDF</a>}
        </CardContent></Card>
      </div>
    </>
  );
}

export default function Page(props: PageProps<"/portal/[id]">) {
  return <Suspense fallback={<Skeleton className="h-[70vh]" />}><PublicRecord params={props.params} searchParams={props.searchParams} /></Suspense>;
}
