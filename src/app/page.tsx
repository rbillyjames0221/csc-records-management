import Link from "next/link";
import { FileSearch, LockKeyhole, ScanText, ShieldCheck, Archive, Plug } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

const FEATURES = [
  [ScanText, "Free OCR, on your servers", "Text-layer detection routes born-digital PDFs straight to the index; scans go to tesseract.js (eng+fil) in the browser or the on-prem OCRmyPDF/PaddleOCR worker."],
  [FileSearch, "Fast full-text search", "PostgreSQL full-text search (English + Filipino), fuzzy matching on names and MC/Resolution numbers, highlighted snippets."],
  [LockKeyhole, "Role-based access", "Officials, employees, regional offices and the public each see only what policy allows. Personal data is restricted and masked."],
  [ShieldCheck, "Immutable audit trail", "Every view, download, print, share and edit is logged in an append-only audit log."],
  [Archive, "Retention & disposition", "File plan with retention schedules; keep, transfer or destroy only with approval."],
  [Plug, "Integration layer", "REST API, CSV import/export and API keys for HRIS, Finance and exam systems."],
] as const;

export default function Home() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" className="size-9 rounded-lg" />
          <div className="leading-tight"><div className="text-sm font-semibold">CSC Records</div><div className="text-xs text-muted-foreground">Management System</div></div>
        </div>
        <Link href="/login" className={buttonVariants({ variant: "outline" })}>Staff sign in</Link>
      </header>
      <section className="mx-auto max-w-6xl px-4 pt-10 pb-12 sm:pt-16">
        <p className="mb-3 text-sm font-medium tracking-wider text-primary uppercase">Civil Service Commission · Records Digitization</p>
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl">One record. One standard. One system. <span className="text-primary">Easy to find, easy to trust.</span></h1>
        <p className="mt-4 max-w-2xl text-muted-foreground sm:text-lg">From memorandum circulars and policy resolutions to examination masterlists, SALNs and appointment papers, all digitized, classified, searchable and governed.</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/portal" className={buttonVariants({ size: "lg", className: "h-11 px-5" })}>Search public records</Link>
          <Link href="/login" className={buttonVariants({ size: "lg", variant: "outline", className: "h-11 px-5" })}>Staff sign in</Link>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(([Icon, t, d]) => (
          <div key={t} className="rounded-xl border bg-card p-5">
            <Icon className="mb-3 size-5 text-primary" />
            <div className="font-medium">{t}</div>
            <p className="mt-1 text-sm text-muted-foreground">{d}</p>
          </div>
        ))}
      </section>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">Prototype for the CSC records digitization plan. Demo data is labelled SAMPLE.</footer>
    </div>
  );
}
