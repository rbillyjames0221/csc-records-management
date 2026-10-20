import Link from "next/link";
import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { Archive, ClipboardCheck, Cpu, FileText, Layers, Upload } from "lucide-react";
import { db } from "@/db";
import { requireStaff } from "@/lib/session";
import { accessFilter, can } from "@/lib/rbac";
import { CATEGORY_LABELS, RECORD_TYPE_LABELS, ROLE_LABELS } from "@/lib/constants";
import { fmtDate, fmtDateTime, fmtNum } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader, SensitivityBadge, StatusBadge, SampleBadge } from "@/components/rms";

export const metadata = { title: "Dashboard" };

async function Dashboard() {
  const actor = await requireStaff();
  const f = accessFilter(actor, "r");
  const [stats] = (await db.execute(sql`
    SELECT count(*)::int AS records,
      coalesce(sum(page_count),0)::int AS pages,
      count(*) FILTER (WHERE status = 'qa_review')::int AS qa,
      count(*) FILTER (WHERE status = 'ocr_pending')::int AS ocr,
      count(*) FILTER (WHERE disposition_due <= current_date AND status IN ('active','on_hold') AND NOT legal_hold)::int AS due,
      count(*) FILTER (WHERE sensitivity = 'public')::int AS s_public,
      count(*) FILTER (WHERE sensitivity = 'internal')::int AS s_internal,
      count(*) FILTER (WHERE sensitivity = 'confidential')::int AS s_confidential,
      count(*) FILTER (WHERE sensitivity = 'restricted')::int AS s_restricted
    FROM records r WHERE ${f}`)).rows as Record<string, number>[];
  const byCat = (await db.execute(sql`
    SELECT c.category, count(*)::int AS n FROM records r JOIN classifications c ON c.id = r.classification_id
    WHERE ${f} GROUP BY c.category ORDER BY c.category`)).rows as { category: keyof typeof CATEGORY_LABELS; n: number }[];
  const recent = (await db.execute(sql`
    SELECT r.id, r.title, r.record_no, r.record_type, r.sensitivity, r.status, r.is_sample, r.created_at, o.code AS office
    FROM records r LEFT JOIN offices o ON o.id = r.office_id WHERE ${f} ORDER BY r.created_at DESC, r.record_no DESC LIMIT 6`)).rows as {
      id: string; title: string; record_no: string; record_type: keyof typeof RECORD_TYPE_LABELS; sensitivity: string; status: string; is_sample: boolean; created_at: string; office: string | null }[];
  const queue = (await db.execute(sql`
    SELECT j.id, j.status, j.mode, j.engine, j.attempts, j.created_at, j.error, r.id AS record_id, r.title, r.page_count
    FROM ingest_jobs j JOIN records r ON r.id = j.record_id
    WHERE ${f} AND j.status IN ('queued','processing','failed') ORDER BY j.status = 'processing' DESC, j.priority, j.created_at LIMIT 6`)).rows as {
      id: string; status: string; mode: string; engine: string; attempts: number; created_at: string; error: string | null; record_id: string; title: string; page_count: number }[];
  const [reviewPages] = (await db.execute(sql`SELECT count(*)::int AS n FROM record_pages p JOIN records r ON r.id = p.record_id WHERE p.needs_review AND ${f}`)).rows as { n: number }[];
  const activity = can(actor, "audit.view")
    ? ((await db.execute(sql`SELECT at, actor_label, action, entity_type, entity_id FROM audit_events ORDER BY at DESC LIMIT 6`)).rows as { at: string; actor_label: string | null; action: string; entity_type: string | null; entity_id: string | null }[])
    : [];

  const maxCat = Math.max(1, ...byCat.map((c) => c.n));
  const tiles = [
    { label: "Records you can access", value: stats.records, icon: FileText, href: "/records" },
    { label: "Pages indexed (full text)", value: stats.pages, icon: Layers, href: "/records" },
    { label: "OCR queue", value: stats.ocr, icon: Cpu, href: "/records?status=ocr_pending" },
    { label: "Pages awaiting QA", value: reviewPages.n, icon: ClipboardCheck, href: can(actor, "qa.review") ? "/qa" : "/records?status=qa_review" },
    { label: "Due for disposition", value: stats.due, icon: Archive, href: "/retention" },
  ];

  return (
    <>
      <PageHeader
        eyebrow={ROLE_LABELS[actor.role]}
        title={`Magandang araw, ${actor.name.split(" ")[0] === "Demo" ? actor.name.replace("Demo ", "") : actor.name.split(" ")[0]}`}
        description="Overview of the records you are authorized to see: intake, OCR, quality assurance and retention."
        actions={can(actor, "record.create") ? <Link href="/intake" className={buttonVariants()}><Upload className="size-4" /> New intake</Link> : null}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="group rounded-xl border bg-card p-4 transition-shadow hover:shadow-md">
            <t.icon className="mb-3 size-5 text-primary" aria-hidden />
            <div className="text-2xl font-semibold tabular-nums">{fmtNum(t.value)}</div>
            <div className="text-xs text-muted-foreground">{t.label}</div>
          </Link>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recently added</CardTitle>
            <CardDescription>Latest records in the central repository</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <ul className="divide-y">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link href={`/records/${r.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{r.title}</div>
                      <div className="text-xs text-muted-foreground">{r.record_no} · {RECORD_TYPE_LABELS[r.record_type]} · {r.office}</div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {r.is_sample && <SampleBadge />}
                      <SensitivityBadge value={r.sensitivity} short />
                      <StatusBadge value={r.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>File plan coverage</CardTitle>
            <CardDescription>Records per classification category</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {byCat.map((c) => (
              <div key={c.category}>
                <div className="mb-1 flex justify-between text-xs"><span>{CATEGORY_LABELS[c.category]}</span><span className="tabular-nums text-muted-foreground">{c.n}</span></div>
                <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${(c.n / maxCat) * 100}%` }} /></div>
              </div>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              {(["public", "internal", "confidential", "restricted"] as const).map((s) => (
                <div key={s} className="flex items-center justify-between gap-1 rounded-lg border p-2"><SensitivityBadge value={s} short /><span className="tabular-nums">{stats[`s_${s}`]}</span></div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className={activity.length ? "" : "lg:col-span-3"}>
          <CardHeader>
            <CardTitle>OCR queue</CardTitle>
            <CardDescription>Jobs for the on-prem OCRmyPDF / PaddleOCR worker</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {queue.length === 0 ? <p className="px-4 text-sm text-muted-foreground">Queue is empty.</p> : (
              <ul className="divide-y">
                {queue.map((j) => (
                  <li key={j.id}>
                    <Link href={`/records/${j.record_id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                      <span className={`size-2 shrink-0 rounded-full ${j.status === "processing" ? "animate-pulse bg-violet-500" : j.status === "failed" ? "bg-rose-500" : "bg-amber-500"}`} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{j.title}</div>
                        <div className="text-xs text-muted-foreground">{j.status} · {j.mode.replace("_", "-")} · {j.page_count} pages · {fmtDate(j.created_at)}</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {activity.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>From the immutable audit trail</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <ul className="divide-y text-sm">
                {activity.map((a, i) => (
                  <li key={i} className="flex flex-col px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                    <span className="font-mono text-xs text-primary">{a.action}</span>
                    <span className="min-w-0 flex-1 truncate">{a.actor_label ?? "system"}</span>
                    <span className="text-xs text-muted-foreground">{fmtDateTime(a.at)}</span>
                  </li>
                ))}
              </ul>
              <div className="px-4 pt-3"><Link href="/audit" className="text-sm text-primary hover:underline">Open audit log →</Link></div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="grid gap-4"><Skeleton className="h-12 w-72" /><div className="grid grid-cols-2 gap-3 md:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-80" /></div>}>
      <Dashboard />
    </Suspense>
  );
}
