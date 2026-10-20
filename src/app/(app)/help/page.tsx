import Link from "next/link";
import { BookOpen, FileQuestion, GraduationCap, ListChecks, ShieldCheck, Wrench } from "lucide-react";
import { PageHeader } from "@/components/rms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NAMING_EXAMPLE } from "@/lib/constants";

export const metadata = { title: "Help & Manuals" };

const SECTIONS = [
  { id: "manual", icon: BookOpen, title: "User manual" },
  { id: "quick", icon: ListChecks, title: "Quick reference" },
  { id: "tutorials", icon: GraduationCap, title: "Tutorials" },
  { id: "faq", icon: FileQuestion, title: "FAQ" },
  { id: "admin", icon: Wrench, title: "Administrator guide" },
];

const FAQ = [
  ["Why can't I find a record I know exists?", "Search only returns records your role, office and access level allow. Confidential and restricted records (SALN, 201 files, case records) are hidden from roles without clearance. Ask your records officer if you need access."],
  ["Why are names shown as “J*** D***”?", "Personal data is masked for roles without PII clearance, per RA 10173 (Data Privacy Act). The full value is visible to records officers, officials and administrators, and every view is logged."],
  ["Search finds words in old scanned circulars?", "Yes. Scanned pages are OCR'd (Tesseract English + Filipino). Old typewritten documents may contain OCR errors; QA reviewers correct pages below the confidence threshold, and fuzzy matching tolerates small typos."],
  ["What happens when I upload the same PDF twice?", "Files are fingerprinted with SHA-256. The intake wizard warns you and links to the existing record instead of creating a duplicate."],
  ["Can I print or download?", "Printing and downloading are allowed per access level and are recorded in the audit log. Restricted records cannot be downloaded by regular employees."],
  ["How do I share a record with someone outside the system?", "Records officers can create an expiring share link (optional max uses, view-only or download). Links can be revoked at any time and every use is audited."],
];

export default function Page() {
  return (
    <>
      <PageHeader title="Help & manuals" description="Training and capacity-building materials for the records digitization program." actions={<Link href="/help/guidelines" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><ShieldCheck className="size-4" /> Governance guidelines →</Link>} />
      <nav aria-label="Help sections" className="mb-4 flex flex-wrap gap-2">
        {SECTIONS.map((s) => <a key={s.id} href={`#${s.id}`} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm hover:bg-muted"><s.icon className="size-4" /> {s.title}</a>)}
      </nav>
      <div className="grid gap-4 [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
        <Card id="manual"><CardHeader><CardTitle>User manual</CardTitle></CardHeader><CardContent className="text-sm leading-relaxed">
          <p>The Records Management System (RMS) digitizes, indexes and preserves CSC records following the workflow: <b>Collect → Prepare → Scan → OCR → Index → QA → Store → Deliver</b>, under a file plan with retention schedules and access controls.</p>
          <h3>Roles</h3>
          <ul>
            <li><b>Administrator</b> – users, roles, API keys, all settings.</li>
            <li><b>Official / approver</b> – reads all records, approves disposition, views audit log.</li>
            <li><b>Records officer</b> – intake, metadata, QA, file plan, retention, share links.</li>
            <li><b>Employee</b> – searches and reads public and internal records.</li>
            <li><b>Regional office</b> – like a records officer but limited to their own office.</li>
            <li><b>Public</b> – public portal only (issuances, resolutions marked public).</li>
          </ul>
          <h3>Searching</h3>
          <p>Type words, a document number (e.g. <code>MC 01 2026</code>) or a record number. Use quotes for exact phrases (<code>&quot;wellness leave&quot;</code>), <code>-word</code> to exclude, and <code>or</code> for alternatives. Filters narrow by type, category, office, access level, status and year. Matching words are highlighted in the snippet, with the page number where they occur.</p>
          <h3>Reading a record</h3>
          <p>The viewer shows the scanned or born-digital PDF page by page; metadata, related records, files, QA status and history appear alongside. Opening a search hit jumps straight to the page where the words were found; the page-text panel shows the indexed (OCR) text of every page.</p>
        </CardContent></Card>
        <Card id="quick"><CardHeader><CardTitle>Quick reference</CardTitle></CardHeader><CardContent className="text-sm">
          <ul>
            <li><b>File naming:</b> <code>{NAMING_EXAMPLE}</code> — OFFICE_TYPE_YEAR_IDENTIFIER[_pNNN].ext</li>
            <li><b>Scanning:</b> 300 dpi (400 dpi for small fonts / faded originals), grayscale or color for stamps &amp; signatures, deskew on, blank-page removal off for legal records.</li>
            <li><b>Formats:</b> master TIFF or PDF; access copy = searchable PDF/A-2b produced by the OCR worker.</li>
            <li><b>OCR confidence:</b> pages below the review threshold (default 80%) go to the QA queue.</li>
            <li><b>Access levels:</b> Public · Internal · Confidential (PII) · Restricted (SALN, cases, medical).</li>
            <li><b>Keyboard:</b> <kbd>/</kbd> focuses global search; <kbd>←</kbd>/<kbd>→</kbd> change page in the viewer.</li>
          </ul>
        </CardContent></Card>
        <Card id="tutorials"><CardHeader><CardTitle>Tutorials</CardTitle></CardHeader><CardContent className="text-sm">
          <h3>1 · Digitize a paper record</h3>
          <ol><li>Prepare: remove staples, flatten, repair tears, sort pages; note the physical box/shelf location.</li><li>Scan at 300 dpi to PDF or TIFF and name the file per the convention.</li><li>Open <b>Intake</b>, drop the file(s). The app checks for duplicates and detects whether the PDF already has a usable text layer.</li><li>Fill metadata: type, number, title, date, office, classification (retention and access level default from the file plan).</li><li>Choose OCR: <i>in-browser</i> (small files, instant) or <i>server queue</i> (large/old scans, higher accuracy, PDF/A output).</li><li>Tick the QA checklist and submit.</li></ol>
          <h3>2 · Review OCR in the QA queue</h3>
          <ol><li>Open <b>QA Review</b>; records with low-confidence pages are listed first.</li><li>Compare the scanned image (left) with the text (right); correct errors and Save, or Accept as-is.</li><li>Complete the checklist and Approve — the record becomes Active and fully searchable.</li></ol>
          <h3>3 · Dispose of records past retention</h3>
          <ol><li>Open <b>Retention → Due</b>; pick a record whose period has lapsed.</li><li>On the record, Request disposition with a reason.</li><li>An official approves with the NAP Authority to Dispose reference.</li><li>The records officer executes: files and text are deleted, a tombstone remains in the register.</li></ol>
        </CardContent></Card>
        <Card id="faq"><CardHeader><CardTitle>Frequently asked questions</CardTitle></CardHeader><CardContent className="grid gap-2 text-sm">
          {FAQ.map(([q, a]) => <details key={q} className="rounded-lg border p-3 open:bg-muted/40"><summary className="cursor-pointer font-medium">{q}</summary><p>{a}</p></details>)}
        </CardContent></Card>
        <Card id="admin"><CardHeader><CardTitle>Administrator guide</CardTitle></CardHeader><CardContent className="text-sm">
          <ul>
            <li><b>Users:</b> self sign-up is disabled. Create accounts in Users &amp; Roles, or connect SSO (Microsoft Entra ID / Google Workspace via Better Auth generic OAuth — see README).</li>
            <li><b>2FA:</b> set <code>REQUIRE_2FA_ROLES=admin,official,records_officer</code> to force TOTP enrolment for privileged roles.</li>
            <li><b>OCR worker:</b> deploy <code>worker/</code> (Docker) on a CSC server with <code>RMS_URL</code> and <code>WORKER_TOKEN</code>. Scale by running more replicas; the queue uses <code>FOR UPDATE SKIP LOCKED</code>.</li>
            <li><b>Bulk loads:</b> for millions of legacy pages, load text with PostgreSQL <code>COPY</code> into <code>record_pages</code> (hash-partitioned ×16) — see README.</li>
            <li><b>Backups:</b> Neon point-in-time restore (cloud) or pgBackRest (on-prem); Blob/object storage versioning for files. Test restores quarterly.</li>
            <li><b>Audit:</b> the audit table is append-only (UPDATE/DELETE blocked by trigger). Export monthly to CSV for archival.</li>
          </ul>
        </CardContent></Card>
      </div>
    </>
  );
}
