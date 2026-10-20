import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { requireStaff } from "@/lib/session";
import { NAV } from "@/lib/nav";
import { can } from "@/lib/rbac";
import { ROLE_LABELS } from "@/lib/constants";
import { db } from "@/db";
import { offices } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Skeleton } from "@/components/ui/skeleton";

async function Shell({ children }: { children: React.ReactNode }) {
  const actor = await requireStaff("dashboard.view", { skip2faCheck: true });
  const items = NAV.filter((i) => !i.perm || can(actor, i.perm));
  const office = actor.officeId ? (await db.select({ name: offices.name }).from(offices).where(eq(offices.id, actor.officeId)))[0]?.name ?? null : null;
  return (
    <AppShell items={items} user={{ name: actor.name, email: actor.email, roleLabel: ROLE_LABELS[actor.role], officeName: office }}>
      {children}
    </AppShell>
  );
}

function ShellFallback() {
  return (
    <div className="flex min-h-dvh">
      <div className="hidden w-64 bg-sidebar lg:block" />
      <div className="flex-1 p-6">
        <Skeleton className="mb-6 h-10 w-full max-w-xl" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
