"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { QA_CHECKS } from "@/lib/constants";
import { approveRecord, savePageCorrection } from "../actions";

const PdfViewer = dynamic(() => import("@/components/viewer/pdf-viewer").then((m) => m.PdfViewer), { ssr: false, loading: () => <div className="h-96 animate-pulse rounded-lg bg-muted" /> });

type Page = { pageNo: number; text: string; confidence: number | null; needsReview: boolean; ocrEngine: string | null };

export function QaReview({ recordId, file, pages, checks }: { recordId: string; file: { id: string; mime: string } | null; pages: Page[]; checks: Record<string, boolean> }) {
  const first = pages.find((p) => p.needsReview)?.pageNo ?? pages[0]?.pageNo ?? 1;
  const [pageNo, setPageNo] = useState(first);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [qa, setQa] = useState(checks);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const page = pages.find((p) => p.pageNo === pageNo);
  const text = drafts[pageNo] ?? page?.text ?? "";

  return (
    <div className="grid gap-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Pages">
        {pages.map((p) => (
          <button key={p.pageNo} type="button" onClick={() => setPageNo(p.pageNo)} aria-current={p.pageNo === pageNo}
            className={cn("shrink-0 rounded-lg border px-2.5 py-1.5 text-xs tabular-nums", p.pageNo === pageNo ? "border-primary bg-primary text-primary-foreground" : p.needsReview ? "border-amber-400 bg-amber-50 dark:bg-amber-950" : "hover:bg-muted")}>
            p.{p.pageNo}{p.confidence != null && ` · ${Math.round(p.confidence)}%`}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Scanned image</CardTitle></CardHeader>
          <CardContent>
            {file?.mime === "application/pdf" ? <PdfViewer key={pageNo} url={`/api/files/${file.id}`} initialPage={pageNo} />
              // eslint-disable-next-line @next/next/no-img-element
              : file ? <img src={`/api/files/${file.id}`} alt="Scanned page" className="w-full rounded-lg border bg-white" />
              : <p className="text-sm text-muted-foreground">No image attached (synthetic SAMPLE record). Correct the text against the physical original.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">OCR text · page {pageNo} {page?.ocrEngine && <span className="text-xs font-normal text-muted-foreground">({page.ocrEngine}{page.confidence != null ? `, ${Math.round(page.confidence)}%` : ""})</span>}</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <label htmlFor="ocr-text" className="sr-only">OCR text for page {pageNo}</label>
            <Textarea id="ocr-text" value={text} onChange={(e) => setDrafts((d) => ({ ...d, [pageNo]: e.target.value }))} className="min-h-[50vh] font-mono text-xs leading-relaxed" />
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={pending} onClick={() => start(async () => { await savePageCorrection(recordId, pageNo, text, false); toast.success(`Page ${pageNo} corrected`); })}><Save className="size-4" /> Save correction</Button>
              <Button type="button" variant="outline" disabled={pending || drafts[pageNo] !== undefined} onClick={() => start(async () => { await savePageCorrection(recordId, pageNo, text, true); toast.success(`Page ${pageNo} accepted as-is`); })}><Check className="size-4" /> Accept as-is</Button>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Validation checklist</CardTitle></CardHeader>
        <CardContent className="grid gap-2">
          {QA_CHECKS.map((c) => (
            <label key={c.key} className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={!!qa[c.key]} onChange={(e) => setQa((q) => ({ ...q, [c.key]: e.target.checked }))} /> {c.label}
            </label>
          ))}
          <label htmlFor="qa-note" className="mt-2 text-sm font-medium">Reviewer note</label>
          <Textarea id="qa-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Verified MC number against stamped original." />
          <div>
            <Button type="button" className="mt-2" disabled={pending} onClick={() => start(async () => {
              const r = await approveRecord(recordId, qa, note);
              if (r.activated) toast.success("Record approved and active");
              else toast.message(r.pendingPages ? `${r.pendingPages} page(s) still need review` : "Checklist saved – some checks not passed");
            })}>Save checklist &amp; approve</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
