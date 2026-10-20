import { Suspense } from "react";
import { FileSearch } from "lucide-react";
import { parseSearchParams, searchRecords } from "@/lib/search";
import { portalActor } from "@/lib/public-actor";
import { fmtNum } from "@/lib/format";
import { EmptyState, Pagination } from "@/components/rms";
import { SearchFilters } from "@/components/search-filters";
import { ResultList } from "@/components/results";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Public Records Portal", description: "Search CSC memorandum circulars, resolutions and other public issuances." };

async function Portal({ searchParams }: { searchParams: PageProps<"/portal">["searchParams"] }) {
  const actor = await portalActor();
  const sp = await searchParams;
  const params = { ...parseSearchParams(sp), sensitivity: undefined, status: undefined, office: undefined };
  const { hits, total, page, pageSize, tookMs } = await searchRecords(actor, params);
  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && v && k !== "page" ? [[k, v]] : [])));
  return (
    <>
      <SearchFilters action="/portal" params={params} staff={false} />
      <div className="mt-4 mb-2 text-sm text-muted-foreground" aria-live="polite">{fmtNum(total)} public record{total === 1 ? "" : "s"} · {tookMs} ms</div>
      {hits.length === 0 ? <EmptyState icon={FileSearch} title="No public records found">Try fewer words or remove filters.</EmptyState> : <ResultList hits={hits} base="/portal" staff={false} />}
      <Pagination page={page} pageSize={pageSize} total={total} hrefFor={(p) => `/portal?${new URLSearchParams([...qs, ["page", String(p)]])}`} />
    </>
  );
}

export default function Page(props: PageProps<"/portal">) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Public records portal</h1>
      <p className="mb-4 text-sm text-muted-foreground">Search the full text of CSC issuances: memorandum circulars, resolutions, office orders and other public documents.</p>
      <Suspense fallback={<Skeleton className="h-96" />}><Portal searchParams={props.searchParams} /></Suspense>
    </>
  );
}
