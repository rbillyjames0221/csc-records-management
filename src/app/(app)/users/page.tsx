import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { offices, user } from "@/db/schema";
import { requireStaff } from "@/lib/session";
import { MATRIX } from "@/lib/rbac";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/constants";
import { PageHeader } from "@/components/rms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Role } from "@/db/schema";
import { CreateUser, EditUser } from "./user-forms";

export const metadata = { title: "Users & Roles" };

async function Users() {
  await requireStaff("users.manage");
  const [users, officeRows] = await Promise.all([
    db.select({ id: user.id, name: user.name, email: user.email, role: user.role, officeId: user.officeId, position: user.position, active: user.active, twoFactor: user.twoFactorEnabled, office: offices.code })
      .from(user).leftJoin(offices, eq(offices.id, user.officeId)).orderBy(asc(user.name)),
    db.select({ id: offices.id, code: offices.code, name: offices.name }).from(offices).orderBy(asc(offices.code)),
  ]);
  const roles = Object.keys(ROLE_LABELS) as Role[];
  return (
    <>
      <PageHeader title="Users & roles" description="Role-based access control. Access level (public → restricted) and office scope further limit what each role sees." actions={<CreateUser offices={officeRows} />} />
      <Card className="mb-6">
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground"><tr><th className="p-3">Name</th><th className="p-3">Role</th><th className="p-3">Office</th><th className="p-3">2FA</th><th className="p-3">Status</th><th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="p-3"><div className="font-medium">{u.name}</div><div className="text-xs text-muted-foreground">{u.email}{u.position ? ` · ${u.position}` : ""}</div></td>
                  <td className="p-3"><Badge variant="secondary">{ROLE_LABELS[u.role]}</Badge></td>
                  <td className="p-3">{u.office ?? "—"}</td>
                  <td className="p-3">{u.twoFactor ? "On" : "Off"}</td>
                  <td className="p-3">{u.active ? <Badge variant="outline">Active</Badge> : <Badge variant="destructive">Disabled</Badge>}</td>
                  <td className="p-3"><EditUser u={u} offices={officeRows} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Permission matrix</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="border-b text-left text-muted-foreground"><tr><th className="p-2.5">Permission</th>{roles.map((r) => <th key={r} className="p-2.5 text-center" title={ROLE_DESCRIPTIONS[r]}>{ROLE_LABELS[r]}</th>)}</tr></thead>
            <tbody>
              {Object.entries(MATRIX).map(([perm, allowed]) => (
                <tr key={perm} className="border-b last:border-0">
                  <td className="p-2.5 font-mono">{perm}</td>
                  {roles.map((r) => <td key={r} className="p-2.5 text-center">{(allowed as readonly Role[]).includes(r) ? <span aria-label="allowed" className="text-emerald-600">●</span> : <span aria-label="denied" className="text-muted-foreground/40">–</span>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<Skeleton className="h-96" />}><Users /></Suspense>;
}
