"use client";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { createApiKey, revokeApiKey } from "./actions";

export function ApiKeyForm({ offices }: { offices: { id: string; code: string }[] }) {
  const [state, action, pending] = useActionState(createApiKey, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_10rem_8rem_auto] sm:items-end">
      <div className="grid gap-1.5"><Label htmlFor="k-name">Key name</Label><Input id="k-name" name="name" required placeholder="e.g. HRIS sync" className="h-10" /></div>
      <div className="grid gap-1.5"><Label htmlFor="k-role">Acts as role</Label>
        <NativeSelect id="k-role" name="role" defaultValue="employee"><option value="public">Public</option><option value="employee">Employee</option><option value="regional">Regional</option><option value="records_officer">Records officer</option><option value="official">Official</option></NativeSelect></div>
      <div className="grid gap-1.5"><Label htmlFor="k-office">Office</Label>
        <NativeSelect id="k-office" name="officeId" defaultValue=""><option value="">—</option>{offices.map((o) => <option key={o.id} value={o.id}>{o.code}</option>)}</NativeSelect></div>
      <Button type="submit" disabled={pending}><KeyRound className="size-4" /> Create</Button>
      {state?.error && <p className="text-sm text-destructive sm:col-span-4">{state.error}</p>}
      {state?.key && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm sm:col-span-4 dark:border-amber-800 dark:bg-amber-950">
          <p className="mb-1 font-medium">Copy this key now — it is shown only once and stored only as a SHA-256 hash.</p>
          <div className="flex items-center gap-2"><code className="min-w-0 flex-1 break-all rounded bg-background px-2 py-1">{state.key}</code>
            <Button type="button" size="icon-sm" variant="outline" aria-label="Copy key" onClick={() => navigator.clipboard.writeText(state.key!).then(() => toast.success("Copied"))}><Copy /></Button></div>
        </div>
      )}
    </form>
  );
}

export function RevokeKey({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return <Button size="sm" variant="outline" disabled={pending} onClick={() => confirm("Revoke this API key?") && start(async () => { await revokeApiKey(id); toast.success("Revoked"); })}>Revoke</Button>;
}

type ImportResult = { dryRun: boolean; rows: number; created: number; errors: { row: number; error: string }[]; recordNos: string[] };

export function CsvImport() {
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/v1/import${dryRun ? "?dryRun=1" : ""}`, { method: "POST", headers: { "Content-Type": "text/csv" }, body: await file.text() });
      const j = await r.json();
      if (!r.ok) toast.error(j.error ?? "Import failed");
      else setRes(j);
    } finally { setBusy(false); }
  }
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">Columns: <code>title, recordType, classificationId, officeId</code> (required), optional <code>documentNumber, dateCreated, sensitivity, keywords</code> (“;”-separated), <code>description, physicalLocation</code>. Up to 2,000 rows per file.</p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="csv-file" className="sr-only">CSV file</label>
        <Input id="csv-file" type="file" accept=".csv,text/csv" className="h-10 max-w-xs" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRes(null); }} />
        <Button variant="outline" disabled={!file || busy} onClick={() => run(true)}>Validate</Button>
        <Button disabled={!file || busy} onClick={() => run(false)}><Upload className="size-4" /> Import</Button>
      </div>
      {res && (
        <div className="rounded-lg border p-3 text-sm">
          <p>{res.dryRun ? "Validation" : "Import"}: {res.rows} row(s), {res.dryRun ? `${res.rows - res.errors.length} valid` : `${res.created} created`}, {res.errors.length} error(s).</p>
          {res.errors.length > 0 && <ul className="mt-2 max-h-40 list-disc overflow-auto pl-5 text-xs text-destructive">{res.errors.map((e) => <li key={e.row}>Row {e.row}: {e.error}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}
