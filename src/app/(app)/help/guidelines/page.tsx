import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/rms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Governance Guidelines" };

const POLICIES = [
  { title: "1. Records Digitization Policy", body: ["Scope: all CSC records of continuing value — issuances, resolutions, personnel (201) files, examination records, legal/case records, administrative records.", "Priority: (a) permanent and frequently requested records, (b) fragile/at-risk paper, (c) records needed for e-services.", "Digitized copies are official reproductions; originals are retained until the applicable retention period lapses and NAP authority to dispose is obtained.", "Standards: 300 dpi minimum, PDF/A-2b access copies, TIFF/PDF masters, SHA-256 fixity on ingest."] },
  { title: "2. Records Access & Security Policy", body: ["Four access levels: Public, Internal, Confidential (contains personal data), Restricted (SALN, administrative cases, medical, examination materials).", "Least privilege: access by role, office scope and access level; personal data masked for roles without clearance.", "Strong authentication: hashed passwords (scrypt), optional TOTP 2FA (mandatory for privileged roles), session expiry.", "Every view, download, print, share and change is recorded in an append-only audit log retained ≥ 5 years."] },
  { title: "3. Data Privacy Policy (RA 10173)", body: ["Processing limited to legitimate CSC mandates; privacy notice on the public portal.", "Personal data is collected only as contained in official records; SALN disclosure follows RA 6713 and its implementing rules.", "Data subjects may request access/correction through the Data Protection Officer; requests are logged.", "Personal data breaches are reported to the NPC within 72 hours per NPC Circular 16-03; the audit log supports investigation.", "Sensitive records are stored in CSC-controlled infrastructure or a provider bound by a data sharing/outsourcing agreement."] },
  { title: "4. Records Retention & Disposition Policy", body: ["Each record series carries a retention schedule (active + inactive years, final action: keep, transfer to NAP, or destroy) aligned with the NAP General Records Disposition Schedule and CSC's agency RDS.", "No record is destroyed without (a) lapse of retention, (b) approval by an authorized official, (c) NAP Authority to Dispose (RA 9470).", "Legal hold suspends disposition for records involved in litigation, audit or investigation.", "Disposition is executed in the system with a permanent tombstone entry in the register."] },
  { title: "5. Quality Assurance & Metadata Standards", body: ["Mandatory metadata: record type, title, document number, date, originating office, classification, access level, physical location.", "QA checklist: page count matches, image legibility, correct orientation, metadata verified against original, OCR spot-check.", "OCR pages below the confidence threshold are reviewed and corrected before records become Active.", "Monthly QA sampling (≥ 2% of records digitized) with error rates reported to the Records Management Committee."] },
];

export default function Page() {
  return (
    <>
      <Link href="/help" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Help</Link>
      <PageHeader title="Governance & policy guidelines" description="Model policies implementing the plan's governance layer. SAMPLE text for adoption by the CSC Records Management Committee — not an official CSC issuance." />
      <div className="grid gap-4 lg:grid-cols-2">
        {POLICIES.map((p) => (
          <Card key={p.title}>
            <CardHeader><CardTitle className="text-base">{p.title}</CardTitle></CardHeader>
            <CardContent><ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">{p.body.map((b) => <li key={b}>{b}</li>)}</ul></CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
