import Link from "next/link";
import { Suspense } from "react";
import { Download, FileSearch, Upload } from "lucide-react";
import { requireStaff } from "@/lib/session";
import { parseSearchParams, searchRecords } from "@/lib/search";
import { getLookups } from "@/lib/lookups";
import { audit } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { fmtNum } from "@/lib/format";
import { PageHeader, Pagination, EmptyState } from "@/components/rms";
import { SearchFilters } from "@/components/search-filters";
import { ResultList } from "@/components/results";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Records" };

async function Records({ searchParams }: { searchParams: PageProps<"/records">["searchParams"] }) {
  const actor = await requireStaff();
  const sp = await searchParams;
  const params = parseSearchParams(sp);
  const [{ hits, total, page, pageSize, tookMs }, lookups] = await Promise.all([searchRecords(actor, params), getLookups()]);
  if (params.q) await audit(actor, "search", null, null, { q: params.q, total });
  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && v && k !== "page" ? [[k, v]] : [])));
  const exportQs = new URLSearchParams(qs);
  return (
    <>
      <PageHeader
        title="Records"
        description="Simple and advanced search across metadata and OCR full text (English + Filipino). Results only include records your role may access."
        actions={<>
          {can(actor, "export") && <a href={`/api/v1/export?${exportQs}`} className={buttonVariants({ variant: "outline" })}><Download className="size-4" /> Export CSV</a>}
          {can(actor, "record.create") && <Link href="/intake" className={buttonVariants()}><Upload className="size-4" /> New intake</Link>}
        </>}
      />
      <SearchFilters action="/records" params={params} offices={lookups.offices} classifications={lookups.classifications} />
      <div className="mt-4 mb-2 text-sm text-muted-foreground" aria-live="polite">
        {fmtNum(total)} record{total === 1 ? "" : "s"}{params.q ? <> for <span className="font-medium text-foreground">{params.q.includes('"') ? params.q : `“${params.q}”`}</span></> : ""} · {tookMs} ms
      </div>
      {hits.length === 0 ? (
        <EmptyState icon={FileSearch} title="No matching records">Try fewer words, check spelling, or remove filters. Fuzzy matching handles small typos in titles, names and document numbers.</EmptyState>
      ) : (
        <ResultList hits={hits} base="/records" />
      )}
      <Pagination page={page} pageSize={pageSize} total={total} hrefFor={(p) => { const n = new URLSearchParams(qs); n.set("page", String(p)); return `/records?${n}`; }} />
    </>
  );
}

export default function Page(props: PageProps<"/records">) {
  return (
    <Suspense fallback={<div className="grid gap-3"><Skeleton className="h-10 w-48" /><Skeleton className="h-24" />{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>}>
      <Records searchParams={props.searchParams} />
    </Suspense>
  );
}
