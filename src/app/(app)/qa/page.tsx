import Link from "next/link";
import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { ClipboardCheck } from "lucide-react";
import { db } from "@/db";
import { requireStaff } from "@/lib/session";
import { accessFilter } from "@/lib/rbac";
import { RECORD_TYPE_LABELS } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { EmptyState, PageHeader, SensitivityBadge, StatusBadge } from "@/components/rms";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "QA Review" };

async function Queue() {
  const actor = await requireStaff("qa.review");
  const rows = (await db.execute(sql`
    SELECT r.id, r.record_no, r.title, r.record_type, r.sensitivity, r.status, r.ocr_confidence, r.page_count, r.created_at, o.code AS office,
      (SELECT count(*) FROM record_pages p WHERE p.record_id = r.id AND p.needs_review)::int AS review_pages,
      (SELECT count(*) FROM qa_checks q WHERE q.record_id = r.id AND NOT q.passed)::int AS failed_checks
    FROM records r LEFT JOIN offices o ON o.id = r.office_id
    WHERE ${accessFilter(actor, "r")} AND (r.status = 'qa_review' OR EXISTS (SELECT 1 FROM record_pages p WHERE p.record_id = r.id AND p.needs_review))
    ORDER BY review_pages DESC, r.ocr_confidence ASC NULLS LAST, r.created_at LIMIT 200`)).rows as {
      id: string; record_no: string; title: string; record_type: keyof typeof RECORD_TYPE_LABELS; sensitivity: string; status: string; ocr_confidence: number | null; page_count: number; created_at: string; office: string; review_pages: number; failed_checks: number }[];
  return (
    <>
      <PageHeader title="QA / validation queue" description={`Records with OCR pages below ${process.env.OCR_REVIEW_THRESHOLD ?? 80}% confidence or failed checklist items. Open a record for side-by-side image vs. text correction.`} />
      {rows.length === 0 ? <EmptyState icon={ClipboardCheck} title="Nothing to review">All records have passed QA.</EmptyState> : (
        <ul className="grid gap-2.5">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/qa/${r.id}`} className="flex flex-col gap-2 rounded-xl border bg-card p-3.5 hover:shadow-md sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">{r.record_no} · {RECORD_TYPE_LABELS[r.record_type]} · {r.office} · {fmtDate(r.created_at)}</div>
                  <div className="font-medium">{r.title}</div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <SensitivityBadge value={r.sensitivity} short />
                  <StatusBadge value={r.status} />
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-300">{r.review_pages} page(s) to review</span>
                  {r.failed_checks > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800 dark:bg-rose-950 dark:text-rose-300">{r.failed_checks} failed check(s)</span>}
                  {r.ocr_confidence != null && <span className="text-muted-foreground">avg {Math.round(r.ocr_confidence)}%</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<Skeleton className="h-96" />}><Queue /></Suspense>;
}
