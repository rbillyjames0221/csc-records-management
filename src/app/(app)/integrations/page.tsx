import { Suspense } from "react";
import { desc, asc } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys, offices } from "@/db/schema";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/rbac";
import { openapi } from "@/lib/openapi";
import { fmtDateTime } from "@/lib/format";
import { PageHeader } from "@/components/rms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiKeyForm, CsvImport, RevokeKey } from "./integrations-client";

export const metadata = { title: "Integrations & API" };

const METHOD_COLOR: Record<string, string> = { get: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300", post: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300", put: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300" };

async function Integrations() {
  const actor = await requireStaff();
  const manageKeys = can(actor, "apikeys.manage");
  const [keys, officeRows] = manageKeys
    ? await Promise.all([db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt)), db.select({ id: offices.id, code: offices.code }).from(offices).orderBy(asc(offices.code))])
    : [[], []];
  return (
    <>
      <PageHeader title="Integrations & API" description="REST API for HRIS, document tracking and e-portal integrations; OCR worker queue; bulk CSV import/export. Machine-readable spec: /api/v1/openapi." />
      <div className="grid gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Endpoints</CardTitle><CardDescription>{openapi.info.description}</CardDescription></CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {Object.entries(openapi.paths).flatMap(([path, ops]) => Object.entries(ops).map(([m, op]) => (
                <li key={path + m} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-3">
                  <span className={`w-14 shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-xs uppercase ${METHOD_COLOR[m] ?? ""}`}>{m}</span>
                  <code className="shrink-0 text-xs">{path}</code>
                  <span className="text-muted-foreground">{(op as { summary: string }).summary}</span>
                </li>
              )))}
            </ul>
            <pre className="mt-4 overflow-x-auto rounded-lg bg-muted p-3 text-xs">{`curl -H "Authorization: Bearer rms_…" \\
  "$APP_URL/api/v1/records?q=wellness+leave&type=memorandum_circular"

curl -H "Authorization: Bearer rms_…" -o records.csv \\
  "$APP_URL/api/v1/export?dataset=records&yearFrom=2024"`}</pre>
            <a href="/api/v1/openapi" className="mt-3 inline-block text-sm text-primary hover:underline">Download OpenAPI 3.1 JSON →</a>
          </CardContent>
        </Card>
        {can(actor, "import") && (
          <Card>
            <CardHeader><CardTitle className="text-base">Bulk CSV import (legacy index)</CardTitle></CardHeader>
            <CardContent><CsvImport /></CardContent>
          </Card>
        )}
        {manageKeys && (
          <Card>
            <CardHeader><CardTitle className="text-base">API keys</CardTitle><CardDescription>Keys act with a fixed role and optional office scope. Admin-level keys are not allowed.</CardDescription></CardHeader>
            <CardContent className="grid gap-4">
              <ApiKeyForm offices={officeRows} />
              <ul className="divide-y text-sm">
                {keys.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="font-medium">{k.name}</span><code className="text-xs text-muted-foreground">{k.prefix}…</code>
                    <Badge variant="secondary">{k.role}</Badge>{k.officeId && <Badge variant="outline">{k.officeId}</Badge>}
                    <span className="text-xs text-muted-foreground">created {fmtDateTime(k.createdAt)}{k.lastUsedAt ? ` · last used ${fmtDateTime(k.lastUsedAt)}` : ""}</span>
                    <span className="ml-auto">{k.revokedAt ? <Badge variant="destructive">revoked</Badge> : <RevokeKey id={k.id} />}</span>
                  </li>
                ))}
                {keys.length === 0 && <li className="py-2 text-muted-foreground">No API keys yet.</li>}
              </ul>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader><CardTitle className="text-base">OCR worker</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Scanned and garbled PDFs are queued for the on-prem worker (<code>worker/</code> in the repository: OCRmyPDF + Tesseract eng+fil, optional PaddleOCR second pass). Run it inside the CSC network with <code>RMS_URL</code> and <code>WORKER_TOKEN</code>; it polls <code>/api/worker/jobs/claim</code>, so no inbound firewall rules are needed.
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<Skeleton className="h-96" />}><Integrations /></Suspense>;
}
