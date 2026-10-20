import { SlidersHorizontal, Search } from "lucide-react";
import { NativeSelect } from "@/components/native-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CATEGORY_LABELS, RECORD_TYPE_LABELS, SENSITIVITY_LABELS, STATUS_LABELS, TEXT_LAYER_LABELS } from "@/lib/constants";
import type { SearchParams } from "@/lib/search";

type Opt = { id: string; name: string; code?: string; parentId?: string | null };

export function SearchFilters({ action, params, offices, classifications, staff = true }: { action: string; params: SearchParams; offices?: Opt[]; classifications?: Opt[]; staff?: boolean }) {
  const activeCount = ["type", "category", "classification", "office", "sensitivity", "status", "textLayer", "yearFrom", "yearTo"].filter((k) => params[k as keyof SearchParams]).length;
  return (
    <form action={action} method="get" className="rounded-xl border bg-card p-3 sm:p-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <label htmlFor="q" className="sr-only">Search query</label>
          <Input id="q" name="q" defaultValue={params.q} placeholder={'Try: wellness leave · "special privileges" · MC 11 2017 · panunumpa'} className="h-11 pl-9" />
        </div>
        <Button type="submit" className="h-11 px-4">Search</Button>
      </div>
      <details className="group mt-3" open={activeCount > 0}>
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-muted-foreground select-none hover:text-foreground">
          <SlidersHorizontal className="size-4" /> Advanced filters {activeCount > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{activeCount}</span>}
          <span className="text-xs">(metadata, dates, OCR status)</span>
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5"><Label htmlFor="f-type">Record type</Label>
            <NativeSelect id="f-type" name="type" defaultValue={params.type ?? ""}><option value="">All types</option>{Object.entries(RECORD_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect></div>
          <div className="grid gap-1.5"><Label htmlFor="f-cat">File plan category</Label>
            <NativeSelect id="f-cat" name="category" defaultValue={params.category ?? ""}><option value="">All categories</option>{Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect></div>
          {classifications && <div className="grid gap-1.5"><Label htmlFor="f-cls">Classification code</Label>
            <NativeSelect id="f-cls" name="classification" defaultValue={params.classification ?? ""}><option value="">Any</option>{classifications.map((c) => <option key={c.id} value={c.id}>{c.parentId ? "  " : ""}{c.code} – {c.name}</option>)}</NativeSelect></div>}
          {offices && <div className="grid gap-1.5"><Label htmlFor="f-office">Office / origin</Label>
            <NativeSelect id="f-office" name="office" defaultValue={params.office ?? ""}><option value="">All offices</option>{offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</NativeSelect></div>}
          {staff && <div className="grid gap-1.5"><Label htmlFor="f-sens">Access level</Label>
            <NativeSelect id="f-sens" name="sensitivity" defaultValue={params.sensitivity ?? ""}><option value="">Any</option>{Object.entries(SENSITIVITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect></div>}
          {staff && <div className="grid gap-1.5"><Label htmlFor="f-status">Status</Label>
            <NativeSelect id="f-status" name="status" defaultValue={params.status ?? ""}><option value="">Any</option>{Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect></div>}
          {staff && <div className="grid gap-1.5"><Label htmlFor="f-tl">Text layer / OCR</Label>
            <NativeSelect id="f-tl" name="textLayer" defaultValue={params.textLayer ?? ""}><option value="">Any</option>{Object.entries(TEXT_LAYER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect></div>}
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5"><Label htmlFor="f-yf">Year from</Label><Input id="f-yf" name="yearFrom" type="number" inputMode="numeric" min={1900} max={2100} defaultValue={params.yearFrom} className="h-10" /></div>
            <div className="grid gap-1.5"><Label htmlFor="f-yt">Year to</Label><Input id="f-yt" name="yearTo" type="number" inputMode="numeric" min={1900} max={2100} defaultValue={params.yearTo} className="h-10" /></div>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="f-sort">Sort by</Label>
            <NativeSelect id="f-sort" name="sort" defaultValue={params.sort ?? ""}><option value="">{params.q ? "Relevance" : "Newest"}</option><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="title">Title A–Z</option></NativeSelect></div>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="secondary" className="h-10 flex-1">Apply</Button>
            <a href={action} className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border text-sm hover:bg-muted">Clear</a>
          </div>
        </div>
      </details>
    </form>
  );
}
