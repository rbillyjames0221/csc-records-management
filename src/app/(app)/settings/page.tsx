import { Suspense } from "react";
import { CircleAlert } from "lucide-react";
import { requireStaff } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/constants";
import { permissionsFor } from "@/lib/rbac";
import { PageHeader } from "@/components/rms";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PasswordForm, ProfileForm, ThemePicker, TwoFactor } from "./settings-client";

export const metadata = { title: "Settings" };

async function Settings({ searchParams }: { searchParams: PageProps<"/settings">["searchParams"] }) {
  const actor = await requireStaff("dashboard.view", { skip2faCheck: true });
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Settings" description={<>{actor.email} · <Badge variant="secondary">{ROLE_LABELS[actor.role]}</Badge>{actor.officeId ? ` · ${actor.officeId}` : ""}</>} />
      {sp.enforce2fa && !actor.twoFactorEnabled && (
        <Alert variant="destructive" className="mb-4"><CircleAlert className="size-4" /><AlertTitle>Two-factor authentication required</AlertTitle><AlertDescription>Your role requires 2FA. Set it up below to continue using the system.</AlertDescription></Alert>
      )}
      <div className="grid gap-4">
        <Card><CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader><CardContent><ProfileForm name={actor.name} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Appearance</CardTitle></CardHeader><CardContent><ThemePicker /></CardContent></Card>
        <Card id="security"><CardHeader><CardTitle className="text-base">Two-factor authentication (TOTP)</CardTitle><CardDescription>Protects access to personnel and confidential records.</CardDescription></CardHeader><CardContent><TwoFactor enabled={!!actor.twoFactorEnabled} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Password</CardTitle></CardHeader><CardContent><PasswordForm /></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Your permissions</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-1.5">{permissionsFor(actor.role).map((p) => <Badge key={p} variant="outline" className="font-mono">{p}</Badge>)}</CardContent></Card>
      </div>
    </>
  );
}

export default function Page(props: PageProps<"/settings">) {
  return <Suspense fallback={<Skeleton className="h-96" />}><Settings searchParams={props.searchParams} /></Suspense>;
}
