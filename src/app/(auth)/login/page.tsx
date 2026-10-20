import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Sign in" };

const DEMO_ACCOUNTS = [
  ["admin@rms.local", "System Administrator"],
  ["official@rms.local", "CSC Official (full access)"],
  ["records@rms.local", "Records Officer"],
  ["employee@rms.local", "CSC Employee (role-based)"],
  ["ncr@rms.local", "NCR Regional Office"],
  ["public@rms.local", "Public / External"],
];

export default function LoginPage() {
  const demo = process.env.NEXT_PUBLIC_DEMO_MODE === "1";
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" className="size-10 rounded-xl" />
          <div>
            <div className="font-semibold">Civil Service Commission</div>
            <div className="text-sm opacity-75">Records Management System</div>
          </div>
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold tracking-tight text-balance">One record. One standard. One system.</h2>
          <p className="mt-3 opacity-80">Digitize, classify, search and govern Commission records, from memorandum circulars to SALNs, with OCR, role-based access, an immutable audit trail and retention schedules.</p>
        </div>
        <div className="text-xs opacity-60">Authorized use only. Access is logged in accordance with RA 10173 (Data Privacy Act of 2012).</div>
      </div>
      <div className="flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-sm">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Staff sign in</CardTitle>
              <CardDescription>Use your CSC account. Accounts are provisioned by the system administrator.</CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<div className="h-56" />}>
                <LoginForm demo={demo} />
              </Suspense>
            </CardContent>
          </Card>
          {demo && (
            <div className="mt-4 rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
              <div className="mb-2 font-medium text-foreground">Demo accounts (SAMPLE data only)</div>
              <ul className="grid gap-1">{DEMO_ACCOUNTS.map(([e, r]) => <li key={e}><code className="text-foreground">{e}</code> · {r}</li>)}</ul>
              <div className="mt-2">Password: the <code>SEED_DEMO_PASSWORD</code> used when seeding.</div>
            </div>
          )}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Looking for public issuances? <Link href="/portal" className="font-medium text-primary hover:underline">Open the public records portal</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
