import Link from "next/link";
import { FileText } from "lucide-react";
import type { SearchHit } from "@/lib/search";
import { RECORD_TYPE_LABELS } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { Highlighted, SampleBadge, SensitivityBadge, StatusBadge, TextLayerBadge } from "@/components/rms";

export function ResultList({ hits, base, staff = true }: { hits: SearchHit[]; base: string; staff?: boolean }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {hits.map((h) => (
        <li key={h.id}>
          <Link href={`${base}/${h.id}${h.hitPage ? `?page=${h.hitPage}` : ""}`} className="block rounded-xl border bg-card p-3.5 transition-shadow hover:shadow-md sm:p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 hidden size-9 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground sm:grid"><FileText className="size-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-mono">{h.recordNo}</span>
                  <span aria-hidden>·</span>
                  <span>{RECORD_TYPE_LABELS[h.recordType as keyof typeof RECORD_TYPE_LABELS] ?? h.recordType}</span>
                  {h.documentNumber && <><span aria-hidden>·</span><span className="font-medium text-foreground">{h.documentNumber}</span></>}
                </div>
                <h3 className="mt-0.5 font-medium text-pretty">{h.title}</h3>
                {h.snippet && (
                  <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground">
                    {h.hitPage && <span className="mr-1 rounded bg-muted px-1 font-mono text-[11px]">p.{h.hitPage}</span>}
                    <Highlighted text={h.snippet} />
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  {h.isSample && <SampleBadge />}
                  <SensitivityBadge value={h.sensitivity} short />
                  {staff && <StatusBadge value={h.status} />}
                  {staff && <TextLayerBadge value={h.textLayer} />}
                  <span className="text-muted-foreground">{h.classificationCode} · {h.officeCode} · {fmtDate(h.dateCreated)} · {h.pageCount} p.</span>
                </div>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
