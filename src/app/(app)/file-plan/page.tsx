import Link from "next/link";
import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { Folder, FolderOpen, Pencil } from "lucide-react";
import { db } from "@/db";
import { requireStaff } from "@/lib/session";
import { accessFilter, can } from "@/lib/rbac";
import { getLookups } from "@/lib/lookups";
import { CATEGORY_LABELS } from "@/lib/constants";
import { PageHeader, SensitivityBadge } from "@/components/rms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ClassificationForm } from "./classification-form";

export const metadata = { title: "File Plan" };

async function FilePlan() {
  const actor = await requireStaff();
  const { classifications, retention } = await getLookups();
  const counts = new Map(((await db.execute(sql`SELECT r.classification_id AS id, count(*)::int AS n FROM records r WHERE ${accessFilter(actor, "r")} GROUP BY 1`)).rows as { id: string; n: number }[]).map((r) => [r.id, r.n]));
  const manage = can(actor, "fileplan.manage");
  const ret = new Map(retention.map((r) => [r.id, r]));
  const parents = classifications.filter((c) => !c.parentId);
  return (
    <>
      <PageHeader title="File plan / classification scheme" description="Six categories from the records plan, each with record series codes, default access level and retention schedule. SAMPLE codes: replace with CSC's official file plan."
        actions={manage ? <ClassificationForm parents={parents} retention={retention} /> : null} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[]).map((cat) => {
          const roots = classifications.filter((c) => c.category === cat && !c.parentId);
          return (
            <Card key={cat}>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FolderOpen className="size-5 text-gold" /> {CATEGORY_LABELS[cat]}</CardTitle></CardHeader>
              <CardContent>
                <ul className="grid gap-1">
                  {roots.flatMap((root) => [root, ...classifications.filter((c) => c.parentId === root.id)]).map((c) => {
                    const r = c.defaultRetentionId ? ret.get(c.defaultRetentionId) : null;
                    const n = counts.get(c.id) ?? 0;
                    return (
                      <li key={c.id} className={`flex items-start gap-2 rounded-lg p-2 hover:bg-muted/60 ${c.parentId ? "ml-4" : ""} ${c.active ? "" : "opacity-50"}`}>
                        <Folder className="mt-0.5 size-4 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <Link href={`/records?classification=${c.id}`} className="text-sm font-medium hover:underline"><span className="font-mono text-xs text-muted-foreground">{c.code}</span> {c.name}</Link>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <SensitivityBadge value={c.defaultSensitivity} short />
                            <span>{r ? (r.permanent ? `${r.code} · permanent` : `${r.code} · ${r.activeYears}+${r.inactiveYears} yrs → ${r.finalDisposition}`) : "no schedule"}</span>
                            <span>· {n} record{n === 1 ? "" : "s"}</span>
                          </div>
                        </div>
                        {manage && <ClassificationForm existing={c} parents={parents.filter((p) => p.id !== c.id)} retention={retention} trigger={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${c.code}`}><Pencil /></Button>} />}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<Skeleton className="h-96" />}><FilePlan /></Suspense>;
}
