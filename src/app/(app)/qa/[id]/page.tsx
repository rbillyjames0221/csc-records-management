import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { qaChecks, recordPages } from "@/db/schema";
import { requireStaff } from "@/lib/session";
import { getReadableRecord, liveFiles } from "@/lib/records";
import { PageHeader, SensitivityBadge, StatusBadge } from "@/components/rms";
import { Skeleton } from "@/components/ui/skeleton";
import { QaReview } from "./qa-review";

async function Review({ params }: { params: PageProps<"/qa/[id]">["params"] }) {
  const actor = await requireStaff("qa.review");
  const { id } = await params;
  const rec = await getReadableRecord(actor, id);
  if (!rec) notFound();
  const [pages, files, checks] = await Promise.all([
    db.select().from(recordPages).where(eq(recordPages.recordId, id)).orderBy(recordPages.pageNo),
    liveFiles(id),
    db.select().from(qaChecks).where(eq(qaChecks.recordId, id)),
  ]);
  const f = files.find((x) => x.kind === "original") ?? files[0];
  return (
    <>
      <Link href="/qa" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> QA queue</Link>
      <PageHeader eyebrow={rec.record_no} title={rec.title} description={<span className="flex gap-1.5 pt-1"><SensitivityBadge value={rec.sensitivity} /><StatusBadge value={rec.status} /></span>}
        actions={<Link href={`/records/${id}`} className="text-sm text-primary hover:underline">Open record →</Link>} />
      <QaReview recordId={id} file={f ? { id: f.id, mime: f.mimeType } : null}
        pages={pages.map((p) => ({ pageNo: p.pageNo, text: p.text, confidence: p.confidence, needsReview: p.needsReview, ocrEngine: p.ocrEngine }))}
        checks={Object.fromEntries(checks.map((c) => [c.checkKey, c.passed]))} />
    </>
  );
}

export default function Page(props: PageProps<"/qa/[id]">) {
  return <Suspense fallback={<Skeleton className="h-[70vh]" />}><Review params={props.params} /></Suspense>;
}
