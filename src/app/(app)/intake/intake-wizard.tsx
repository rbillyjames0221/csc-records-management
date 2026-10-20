"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Camera, CheckCircle2, FileText, Loader2, ScanText, Trash2, UploadCloud, Server, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { MetadataFields, type Lookup, type MetadataValues } from "@/components/metadata-fields";
import { analyzeFile, ocrInBrowser, sha256File, suggestMetadata, type Analysis } from "@/lib/ocr/browser";
import { NAMING_EXAMPLE, NAMING_PATTERN, QA_CHECKS, TEXT_LAYER_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

type OcrChoice = "extract" | "browser" | "worker" | "none";
type Item = {
  key: string; file: File; sha?: string; dup?: { recordId: string; recordNo: string } | null; analysis?: Analysis; error?: string;
  meta: MetadataValues; ocr: OcrChoice; qa: Record<string, boolean>;
  phase: "analyzing" | "ready" | "submitting" | "done" | "failed"; progress?: string; result?: { id: string; recordNo: string; status?: string };
};

const STEPS = ["Files", "Metadata", "OCR & QA", "Submit"] as const;
const BROWSER_OCR_MAX_PAGES = 20;

function fmtSize(n: number) { return n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`; }

export function IntakeWizard({ offices, classifications, defaultOffice, lockOffice, allowRestricted, storageDriver }: {
  offices: Lookup[]; classifications: Lookup[]; defaultOffice: string | null; lockOffice: string | null; allowRestricted: boolean; storageDriver: "local" | "blob";
}) {
  const [step, setStep] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState(0);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const update = useCallback((key: string, patch: Partial<Item> | ((i: Item) => Partial<Item>)) => {
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...(typeof patch === "function" ? patch(i) : patch) } : i)));
  }, []);

  async function addFiles(files: FileList | File[]) {
    const fresh: Item[] = Array.from(files).slice(0, 25).map((file) => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`, file,
      meta: { title: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "), officeId: lockOffice ?? defaultOffice ?? "", keywords: "", metadata: {} },
      ocr: "none", qa: {}, phase: "analyzing",
    }));
    setItems((l) => [...l, ...fresh]);
    for (const it of fresh) {
      try {
        const [sha, analysis] = await Promise.all([sha256File(it.file), analyzeFile(it.file)]);
        const dupRes = await fetch(`/api/files/check?sha256=${sha}`).then((r) => r.json()).catch(() => ({ duplicate: null }));
        const sug = suggestMetadata(analysis.pages[0] ?? "");
        const ocr: OcrChoice = analysis.verdict === "born_digital" ? "extract"
          : analysis.kind === "image" && it.file.type !== "image/tiff" ? "browser"
          : analysis.pageCount <= 5 ? "browser" : "worker";
        update(it.key, (cur) => ({
          sha, analysis, dup: dupRes.duplicate, ocr, phase: "ready",
          meta: { ...cur.meta, ...Object.fromEntries(Object.entries(sug).filter(([, v]) => v)) },
          qa: { naming_compliance: NAMING_PATTERN.test(it.file.name), dedup: !dupRes.duplicate, image_quality: analysis.estDpi == null ? false : analysis.estDpi >= 290 },
        }));
      } catch (e) {
        update(it.key, { phase: "failed", error: `Could not read file: ${(e as Error).message}` });
      }
    }
  }

  const ready = items.filter((i) => i.phase !== "failed");
  const metaComplete = (m: MetadataValues) => !!(m.title && m.title.length >= 3 && m.recordType && m.classificationId && (lockOffice || m.officeId));
  const allMetaOk = ready.length > 0 && ready.every((i) => metaComplete(i.meta));
  const analyzing = items.some((i) => i.phase === "analyzing");
  const cur = ready[active] ?? ready[0];

  async function submitOne(it: Item) {
    update(it.key, { phase: "submitting", progress: "Creating record…" });
    try {
      const m = it.meta;
      const qa = { ...it.qa, metadata_complete: metaComplete(m) };
      const body = {
        title: m.title, recordType: m.recordType, documentNumber: m.documentNumber, description: m.description, classificationId: m.classificationId,
        officeId: lockOffice ?? m.officeId, dateCreated: m.dateCreated, dateReceived: m.dateReceived || new Date().toISOString().slice(0, 10),
        sensitivity: m.sensitivity || undefined, containsPii: m.containsPii, redactionRequired: m.redactionRequired, legalHold: m.legalHold,
        physicalLocation: m.physicalLocation, keywords: (m.keywords ?? "").split(",").map((s) => s.trim()).filter(Boolean), metadata: m.metadata ?? {},
        sourceFormat: it.analysis?.verdict === "born_digital" ? "born_digital" : "paper_scan", textLayer: it.analysis?.verdict ?? "unknown",
        language: "eng+fil", qa,
      };
      const r = await fetch("/api/v1/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const rec = await r.json();
      if (!r.ok) throw new Error(rec.error === "validation" ? rec.issues.map((x: { message: string }) => x.message).join("; ") : rec.error);

      update(it.key, { progress: "Uploading file…" });
      let fileRes: Response;
      if (storageDriver === "blob") {
        const { upload } = await import("@vercel/blob/client");
        const safe = it.file.name.replace(/[^A-Za-z0-9._-]/g, "_");
        const blob = await upload(`records/${rec.id}/${safe}`, it.file, { access: "private", handleUploadUrl: "/api/files/blob", contentType: it.file.type || undefined });
        fileRes = await fetch(`/api/v1/records/${rec.id}/files`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ blobPathname: blob.pathname, filename: it.file.name, pageCount: it.analysis?.pageCount }) });
      } else {
        const fd = new FormData();
        fd.set("file", it.file);
        fd.set("pageCount", String(it.analysis?.pageCount ?? ""));
        if (it.analysis?.estDpi) fd.set("dpi", String(it.analysis.estDpi));
        fileRes = await fetch(`/api/v1/records/${rec.id}/files`, { method: "POST", body: fd });
      }
      const fj = await fileRes.json();
      if (!fileRes.ok) throw new Error(fj.message ?? fj.error ?? "Upload failed");

      let pages: { pageNo: number; text: string; confidence?: number | null }[] | null = null;
      let engine = "pdf-text-layer";
      if (it.ocr === "extract" && it.analysis) {
        pages = it.analysis.pages.map((text, i) => ({ pageNo: i + 1, text, confidence: null }));
      } else if (it.ocr === "browser" && it.analysis) {
        engine = "tesseract.js (eng+fil, browser)";
        const res = await ocrInBrowser(it.file, it.analysis.pageCount, (p) => update(it.key, { progress: `OCR page ${p.page}/${p.total}: ${p.status} ${Math.round(p.progress * 100)}%` }));
        pages = res;
      }
      if (pages) {
        update(it.key, { progress: "Indexing text…" });
        const pr = await fetch(`/api/v1/records/${rec.id}/pages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ engine, pages }) });
        const pj = await pr.json();
        if (!pr.ok) throw new Error(pj.error ?? "Indexing failed");
        update(it.key, { phase: "done", progress: undefined, result: { id: rec.id, recordNo: rec.recordNo, status: pj.status } });
      } else if (it.ocr === "worker") {
        const mode = it.analysis?.verdict === "garbled" || it.analysis?.verdict === "mixed" ? "redo_ocr" : "ocr";
        const jr = await fetch(`/api/v1/records/${rec.id}/ocr-jobs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileId: fj.file.id, mode }) });
        if (!jr.ok) throw new Error("Could not queue OCR job");
        update(it.key, { phase: "done", progress: undefined, result: { id: rec.id, recordNo: rec.recordNo, status: "ocr_pending" } });
      } else {
        update(it.key, { phase: "done", progress: undefined, result: { id: rec.id, recordNo: rec.recordNo, status: "qa_review" } });
      }
    } catch (e) {
      update(it.key, { phase: "failed", progress: undefined, error: (e as Error).message });
    }
  }

  async function submitAll() {
    for (const it of ready.filter((i) => i.phase === "ready")) await submitOne(it);
  }

  const stepOk = useMemo(() => [ready.length > 0 && !analyzing, allMetaOk, true, true], [ready.length, analyzing, allMetaOk]);

  return (
    <div className="grid gap-4">
      <ol className="grid grid-cols-4 gap-1.5" aria-label="Intake steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" disabled={i > 0 && !stepOk.slice(0, i).every(Boolean)} onClick={() => setStep(i)}
              aria-current={step === i ? "step" : undefined}
              className={cn("flex w-full flex-col items-start rounded-lg border px-2.5 py-2 text-left text-xs transition-colors disabled:opacity-50 sm:text-sm", step === i ? "border-primary bg-primary/5" : "hover:bg-muted")}>
              <span className="text-[10px] text-muted-foreground sm:text-xs">Step {i + 1}</span>
              <span className="font-medium">{s}</span>
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Intake &amp; digitization</CardTitle>
            <CardDescription>Add scanned paper records or born-digital files (PDF, TIFF, PNG, JPEG). Each file is hashed (SHA-256) for de-duplication and its text layer is inspected to route OCR.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
              className={cn("flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors", drag ? "border-primary bg-primary/5" : "border-border")}
            >
              <UploadCloud className="size-10 text-primary" aria-hidden />
              <div className="font-medium">Drag &amp; drop files here</div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" onClick={() => inputRef.current?.click()} className="h-10"><FileText className="size-4" /> Choose files</Button>
                <Button type="button" variant="outline" onClick={() => camRef.current?.click()} className="h-10 lg:hidden"><Camera className="size-4" /> Scan with camera</Button>
              </div>
              <input ref={inputRef} type="file" multiple accept="application/pdf,image/tiff,image/png,image/jpeg,image/webp" className="sr-only" aria-label="Choose files" onChange={(e) => e.target.files && addFiles(e.target.files)} />
              <input ref={camRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Capture with camera" onChange={(e) => e.target.files && addFiles(e.target.files)} />
              <p className="max-w-md text-xs text-muted-foreground">Scanning standard: 300 dpi, colour for stamps/seals, deskewed, complete pages. Naming: <code>{NAMING_EXAMPLE}</code></p>
            </div>
            {items.length > 0 && (
              <ul className="grid gap-2">
                {items.map((it) => (
                  <li key={it.key} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{it.file.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {fmtSize(it.file.size)}
                        {it.analysis && <> · {it.analysis.pageCount} page(s) · {TEXT_LAYER_LABELS[it.analysis.verdict]}{it.analysis.estDpi ? ` · ~${it.analysis.estDpi} dpi` : ""}</>}
                        {it.sha && <> · <span className="font-mono">{it.sha.slice(0, 12)}…</span></>}
                      </div>
                      {it.dup && <div className="mt-1 flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="size-3.5" /> Duplicate of <Link className="underline" href={`/records/${it.dup.recordId}`}>{it.dup.recordNo}</Link>: upload will be rejected.</div>}
                      {it.error && <div className="mt-1 text-xs text-destructive">{it.error}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      {it.phase === "analyzing" ? <Loader2 className="size-4 animate-spin" /> : it.analysis && (
                        <Badge variant="outline">{it.analysis.verdict === "born_digital" ? "Index text directly" : "Needs OCR"}</Badge>
                      )}
                      <Button type="button" variant="ghost" size="icon-lg" aria-label={`Remove ${it.file.name}`} onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))}><Trash2 /></Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end"><Button type="button" className="h-10" disabled={!stepOk[0]} onClick={() => setStep(1)}>Continue to metadata</Button></div>
          </CardContent>
        </Card>
      )}

      {step === 1 && cur && (
        <Card>
          <CardHeader>
            <CardTitle>Organization &amp; classification</CardTitle>
            <CardDescription>Fields were pre-filled from the document text where possible. Verify document numbers and dates against the original; stamped numbers are often mis-read.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {ready.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Files">
                {ready.map((it, i) => (
                  <button key={it.key} role="tab" aria-selected={i === active} type="button" onClick={() => setActive(i)}
                    className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs", i === active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                    {metaComplete(it.meta) ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />} {it.file.name.slice(0, 28)}
                  </button>
                ))}
              </div>
            )}
            <MetadataFields key={cur.key} prefix={`m${active}-`} values={cur.meta} onChange={(meta) => update(cur.key, { meta })} offices={offices} classifications={classifications} lockOffice={lockOffice} allowRestricted={allowRestricted} />
            <div className="flex justify-between gap-2">
              <Button type="button" variant="outline" className="h-10" onClick={() => setStep(0)}>Back</Button>
              <Button type="button" className="h-10" disabled={!allMetaOk} onClick={() => setStep(2)}>{allMetaOk ? "Continue to OCR & QA" : "Complete required fields"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>OCR routing &amp; QA validation</CardTitle>
            <CardDescription>Born-digital text is indexed as-is. Scans can be OCR&apos;d now in this browser (free tesseract.js, English + Filipino; the file never leaves your device) or queued for the on-prem OCRmyPDF/PaddleOCR worker (recommended for large or poor scans).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {ready.map((it) => {
              const a = it.analysis!;
              const canBrowser = a.kind === "image" ? it.file.type !== "image/tiff" : a.pageCount <= BROWSER_OCR_MAX_PAGES;
              return (
                <fieldset key={it.key} className="rounded-lg border p-3">
                  <legend className="px-1 text-sm font-medium">{it.meta.title}</legend>
                  <div className="mb-2 text-xs text-muted-foreground">{it.file.name} · {a.pageCount} p. · detected: <span className="font-medium text-foreground">{TEXT_LAYER_LABELS[a.verdict]}</span>{a.badPages.length > 0 && a.verdict !== "image_only" && ` (pages needing OCR: ${a.badPages.slice(0, 10).join(", ")}${a.badPages.length > 10 ? "…" : ""})`}</div>
                  <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="OCR route">
                    {([
                      ["extract", FileText, "Use text layer", "Index existing text", a.verdict !== "image_only"],
                      ["browser", ScanText, "OCR in browser", canBrowser ? "tesseract.js eng+fil" : `≤${BROWSER_OCR_MAX_PAGES} pages, no TIFF`, canBrowser],
                      ["worker", Server, "Queue for OCR worker", "Tesseract + OCRmyPDF → PDF/A, optional PaddleOCR", true],
                    ] as const).map(([v, Icon, label, hint, enabled]) => (
                      <label key={v} className={cn("flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm", it.ocr === v && "border-primary bg-primary/5", !enabled && "cursor-not-allowed opacity-50")}>
                        <input type="radio" name={`ocr-${it.key}`} className="mt-1 accent-primary" disabled={!enabled} checked={it.ocr === v} onChange={() => update(it.key, { ocr: v })} />
                        <span><span className="flex items-center gap-1.5 font-medium"><Icon className="size-4" /> {label}</span><span className="text-xs text-muted-foreground">{hint}</span></span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-1.5">
                    {QA_CHECKS.map((c) => {
                      const auto = c.key === "metadata_complete" ? metaComplete(it.meta) : undefined;
                      return (
                        <label key={c.key} className="flex items-start gap-2 text-sm">
                          <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={auto ?? !!it.qa[c.key]} disabled={auto !== undefined || (c.key === "dedup" && !!it.dup)}
                            onChange={(e) => update(it.key, (cur) => ({ qa: { ...cur.qa, [c.key]: e.target.checked } }))} />
                          <span>{c.label}
                            {c.key === "naming_compliance" && !NAMING_PATTERN.test(it.file.name) && <span className="block text-xs text-warning">Filename does not follow the convention ({NAMING_EXAMPLE}); tick only after renaming at source.</span>}
                            {c.key === "image_quality" && a.estDpi != null && a.estDpi < 290 && <span className="block text-xs text-warning">Estimated {a.estDpi} dpi; below the 300 dpi standard.</span>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
            <div className="flex justify-between gap-2">
              <Button type="button" variant="outline" className="h-10" onClick={() => setStep(1)}>Back</Button>
              <Button type="button" className="h-10" onClick={() => setStep(3)}>Review &amp; submit</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Submit to central repository</CardTitle>
            <CardDescription>Records with all QA checks passed and no low-confidence pages become Active; others go to the QA review queue. Storage: {storageDriver === "blob" ? "Vercel Blob (private)" : "local / on-prem storage"}.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <ul className="grid gap-2">
              {ready.map((it) => (
                <li key={it.key} className="flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-center sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{it.meta.title}</div>
                    <div className="text-xs text-muted-foreground">{it.file.name} · route: {it.ocr} · QA {Object.values({ ...it.qa, metadata_complete: metaComplete(it.meta) }).filter(Boolean).length}/{QA_CHECKS.length}</div>
                    {it.progress && <div className="mt-1 text-xs text-primary">{it.progress}</div>}
                    {it.phase === "submitting" && <Progress value={null} className="mt-2" />}
                    {it.error && <div className="mt-1 text-xs text-destructive">{it.error}</div>}
                  </div>
                  {it.result && <Link href={`/records/${it.result.id}`} className="text-sm font-medium text-primary hover:underline">{it.result.recordNo} → {it.result.status}</Link>}
                </li>
              ))}
            </ul>
            <div className="flex justify-between gap-2">
              <Button type="button" variant="outline" className="h-10" onClick={() => setStep(2)} disabled={ready.some((i) => i.phase === "submitting")}>Back</Button>
              {ready.every((i) => i.phase === "done") ? (
                <Button type="button" className="h-10" onClick={() => { setItems([]); setStep(0); }}>Start new intake</Button>
              ) : (
                <Button type="button" className="h-10" onClick={submitAll} disabled={ready.some((i) => i.phase === "submitting")}>
                  {ready.some((i) => i.phase === "submitting") && <Loader2 className="size-4 animate-spin" />} Submit {ready.filter((i) => i.phase === "ready").length} record(s)
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
