import Link from "next/link";
import { Suspense } from "react";
import { sql, type SQL } from "drizzle-orm";
import { Download } from "lucide-react";
import { db } from "@/db";
import { requireStaff } from "@/lib/session";
import { fmtDateTime } from "@/lib/format";
import { PageHeader, Pagination } from "@/components/rms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Audit Log" };
const PAGE = 50;

type Row = { id: string; at: string; actor_label: string | null; actor_role: string | null; action: string; entity_type: string | null; entity_id: string | null; ip: string | null; details: Record<string, unknown> };

function one(v: string | string[] | undefined) { return (Array.isArray(v) ? v[0] : v ?? "").trim().slice(0, 100); }

async function Audit({ searchParams }: { searchParams: PageProps<"/audit">["searchParams"] }) {
  await requireStaff("audit.view");
  const sp = await searchParams;
  const f = { action: one(sp.action), actor: one(sp.actor), entity: one(sp.entity), from: one(sp.from), to: one(sp.to) };
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const conds: SQL[] = [];
  if (f.action) conds.push(sql`action LIKE ${f.action.replace(/[%_]/g, "") + "%"}`);
  if (f.actor) conds.push(sql`actor_label ILIKE ${"%" + f.actor.replace(/[%_]/g, "") + "%"}`);
  if (f.entity) conds.push(sql`entity_id = ${f.entity}`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.from)) conds.push(sql`at >= (${f.from}::date::timestamp AT TIME ZONE 'Asia/Manila')`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.to)) conds.push(sql`at < ((${f.to}::date + 1)::timestamp AT TIME ZONE 'Asia/Manila')`);
  const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
  const [rows, count] = await Promise.all([
    db.execute(sql`SELECT id::text, at, actor_label, actor_role, action, entity_type, entity_id, ip, details FROM audit_events ${where} ORDER BY at DESC, id DESC LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`),
    db.execute(sql`SELECT count(*)::int AS n FROM audit_events ${where}`),
  ]);
  const total = (count.rows[0] as { n: number }).n;
  const qs = (p: number) => "/audit?" + new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page: String(p) }).toString();
  const exportQs = new URLSearchParams({ dataset: "audit", ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }).toString();
  return (
    <>
      <PageHeader title="Audit log" description="Append-only trail (database triggers block UPDATE/DELETE) of logins, views, downloads, prints, edits, QA and disposition decisions — supports RA 10173 accountability."
        actions={<Button variant="outline" render={<a href={`/api/v1/export?${exportQs}`} />}><Download className="size-4" /> CSV</Button>} />
      <form className="mb-4 grid grid-cols-2 gap-3 rounded-xl border bg-card p-3 sm:grid-cols-3 lg:grid-cols-6" role="search">
        <div className="grid gap-1"><Label htmlFor="a-action" className="text-xs">Action prefix</Label><Input id="a-action" name="action" defaultValue={f.action} placeholder="record." className="h-9" /></div>
        <div className="grid gap-1"><Label htmlFor="a-actor" className="text-xs">Actor</Label><Input id="a-actor" name="actor" defaultValue={f.actor} className="h-9" /></div>
        <div className="grid gap-1"><Label htmlFor="a-entity" className="text-xs">Entity ID</Label><Input id="a-entity" name="entity" defaultValue={f.entity} className="h-9" /></div>
        <div className="grid gap-1"><Label htmlFor="a-from" className="text-xs">From</Label><Input id="a-from" name="from" type="date" defaultValue={f.from} className="h-9" /></div>
        <div className="grid gap-1"><Label htmlFor="a-to" className="text-xs">To</Label><Input id="a-to" name="to" type="date" defaultValue={f.to} className="h-9" /></div>
        <div className="flex items-end gap-2"><Button type="submit" className="h-9 flex-1">Filter</Button><Button variant="ghost" className="h-9" render={<Link href="/audit" />}>Clear</Button></div>
      </form>
      <p className="mb-2 text-sm text-muted-foreground">{total.toLocaleString()} event(s) · times in PHT (UTC+8)</p>
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y">
            {(rows.rows as Row[]).map((r) => (
              <li key={r.id} className="grid gap-1 p-3 text-sm sm:grid-cols-[11rem_1fr]">
                <time className="text-xs tabular-nums text-muted-foreground">{fmtDateTime(r.at)}</time>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="font-mono">{r.action}</Badge>
                    <span className="font-medium">{r.actor_label ?? "system"}</span>
                    {r.actor_role && <span className="text-xs text-muted-foreground">({r.actor_role})</span>}
                    {r.entity_type && r.entity_id && (r.entity_type === "record" ? <Link className="text-xs text-primary hover:underline" href={`/records/${r.entity_id}`}>{r.entity_type}:{r.entity_id.slice(0, 8)}</Link> : <span className="text-xs text-muted-foreground">{r.entity_type}:{r.entity_id.slice(0, 12)}</span>)}
                  </div>
                  {Object.keys(r.details ?? {}).length > 0 && <code className="mt-1 block truncate text-xs text-muted-foreground">{JSON.stringify(r.details)}</code>}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Pagination page={page} pageSize={PAGE} total={total} hrefFor={qs} />
    </>
  );
}

export default function Page(props: PageProps<"/audit">) {
  return <Suspense fallback={<Skeleton className="h-96" />}><Audit searchParams={props.searchParams} /></Suspense>;
}
