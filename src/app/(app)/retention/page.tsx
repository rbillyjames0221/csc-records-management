import Link from "next/link";
import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireStaff } from "@/lib/session";
import { accessFilter, can } from "@/lib/rbac";
import { getLookups } from "@/lib/lookups";
import { fmtDate } from "@/lib/format";
import { PageHeader, StatusBadge } from "@/components/rms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DecideButton, ExecuteButton, ScheduleForm } from "./retention-client";

export const metadata = { title: "Retention & Disposition" };

type Req = { id: string; record_id: string; record_no: string; title: string; action: string; reason: string; status: string; requested_at: string; requester: string; decider: string | null; decision_note: string | null; authority_ref: string | null; requested_by: string };
type Due = { id: string; record_no: string; title: string; disposition_due: string; legal_hold: boolean; status: string; schedule: string | null; final: string | null };

async function Retention() {
  const actor = await requireStaff("dashboard.view");
  const af = accessFilter(actor, "r");
  const [reqs, due, { retention }] = await Promise.all([
    db.execute(sql`SELECT d.id, d.record_id, r.record_no, r.title, d.action, d.reason, d.status, d.requested_at, d.requested_by, u.name AS requester, v.name AS decider, d.decision_note, d.authority_ref
      FROM disposition_requests d JOIN records r ON r.id = d.record_id JOIN "user" u ON u.id = d.requested_by LEFT JOIN "user" v ON v.id = d.decided_by
      WHERE ${af} ORDER BY (d.status IN ('pending','approved')) DESC, d.requested_at DESC LIMIT 100`),
    db.execute(sql`SELECT r.id, r.record_no, r.title, r.disposition_due, r.legal_hold, r.status, s.code AS schedule, s.final_disposition AS final
      FROM records r LEFT JOIN retention_schedules s ON s.id = r.retention_schedule_id
      WHERE ${af} AND r.status IN ('active','on_hold','qa_review') AND r.disposition_due IS NOT NULL AND r.disposition_due <= (now() AT TIME ZONE 'Asia/Manila')::date + 365
      ORDER BY r.disposition_due LIMIT 100`),
    getLookups(),
  ]);
  const requests = reqs.rows as Req[];
  const dueRows = due.rows as Due[];
  const approve = can(actor, "disposition.approve");
  const execute = can(actor, "disposition.request");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title="Retention & disposition" description="Track records reaching end of retention, request disposition, obtain approval with NAP authority, then execute. Every step is audited; records on legal hold are frozen." />
      <Tabs defaultValue="requests">
        <TabsList className="mb-3">
          <TabsTrigger value="requests">Requests ({requests.filter((r) => r.status === "pending" || r.status === "approved").length})</TabsTrigger>
          <TabsTrigger value="due">Due ({dueRows.length})</TabsTrigger>
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
        </TabsList>
        <TabsContent value="requests" className="grid gap-2.5">
          {requests.length === 0 && <p className="text-sm text-muted-foreground">No disposition requests.</p>}
          {requests.map((r) => (
            <Card key={r.id} size="sm">
              <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">{r.record_no} · requested by {r.requester} · {fmtDate(r.requested_at)}</div>
                  <Link href={`/records/${r.record_id}`} className="font-medium hover:underline">{r.title}</Link>
                  <p className="text-sm text-muted-foreground">{r.reason}</p>
                  {r.decider && <p className="text-xs text-muted-foreground">Decided by {r.decider}{r.authority_ref ? ` · authority ${r.authority_ref}` : ""}{r.decision_note ? ` · “${r.decision_note}”` : ""}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={r.action === "destroy" ? "destructive" : "secondary"}>{r.action}</Badge>
                  <Badge variant="outline">{r.status}</Badge>
                  {r.status === "pending" && approve && r.requested_by !== actor.id && <><DecideButton requestId={r.id} approve action={r.action} /><DecideButton requestId={r.id} approve={false} action={r.action} /></>}
                  {r.status === "approved" && execute && <ExecuteButton requestId={r.id} action={r.action} />}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="due">
          <Card><CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground"><tr><th className="p-3">Record</th><th className="p-3">Schedule</th><th className="p-3">Due</th><th className="p-3">Status</th></tr></thead>
              <tbody>
                {dueRows.map((d) => (
                  <tr key={d.id} className="border-b last:border-0">
                    <td className="p-3"><Link href={`/records/${d.id}`} className="font-medium hover:underline">{d.title}</Link><div className="text-xs text-muted-foreground">{d.record_no}</div></td>
                    <td className="p-3">{d.schedule} → {d.final}</td>
                    <td className={`p-3 tabular-nums ${d.disposition_due <= today ? "font-semibold text-destructive" : ""}`}>{fmtDate(d.disposition_due)}</td>
                    <td className="p-3"><span className="flex gap-1"><StatusBadge value={d.status} />{d.legal_hold && <Badge variant="destructive">legal hold</Badge>}</span></td>
                  </tr>
                ))}
                {dueRows.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No records due within 12 months.</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="schedules">
          <Card>
            <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-base">Records Disposition Schedule (SAMPLE values)</CardTitle>{can(actor, "retention.manage") && <ScheduleForm />}</CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground"><tr><th className="p-3">Code</th><th className="p-3">Series</th><th className="p-3">Active</th><th className="p-3">Inactive</th><th className="p-3">Disposition</th><th className="p-3">Basis</th><th /></tr></thead>
                <tbody>
                  {retention.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="p-3 font-mono text-xs">{s.code}</td><td className="p-3">{s.recordSeries}</td>
                      <td className="p-3">{s.permanent ? "—" : `${s.activeYears} y`}</td><td className="p-3">{s.permanent ? "—" : `${s.inactiveYears} y`}</td>
                      <td className="p-3">{s.permanent ? "Permanent" : s.finalDisposition}</td><td className="p-3 text-xs text-muted-foreground">{s.legalBasis}</td>
                      <td className="p-3">{can(actor, "retention.manage") && <ScheduleForm existing={s} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<Skeleton className="h-96" />}><Retention /></Suspense>;
}
