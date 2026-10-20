"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function LoginForm({ demo }: { demo: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<"password" | "2fa">(params.get("step") === "2fa" ? "2fa" : "password");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [useBackup, setUseBackup] = useState(false);
  const next = params.get("next") || "/dashboard";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  async function onPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const { data, error } = await authClient.signIn.email({ email: String(fd.get("email")), password: String(fd.get("password")) });
    setBusy(false);
    if (error) return setError(error.status === 429 ? "Too many attempts. Please wait a minute and try again." : "Invalid email or password, or the account is disabled.");
    if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) return setStep("2fa");
    router.push(safeNext);
    router.refresh();
  }

  async function onCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const code = String(new FormData(e.currentTarget).get("code")).trim();
    const res = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice: false })
      : await authClient.twoFactor.verifyTotp({ code, trustDevice: false });
    setBusy(false);
    if (res.error) return setError("That code is not valid. Check your authenticator app's time and try again.");
    router.push(safeNext);
    router.refresh();
  }

  if (step === "2fa") {
    return (
      <form onSubmit={onCode} className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="size-4 text-primary" /> Two-factor verification</div>
        <div className="grid gap-2">
          <Label htmlFor="code">{useBackup ? "Backup code" : "6-digit code from your authenticator app"}</Label>
          <Input id="code" name="code" inputMode={useBackup ? "text" : "numeric"} autoComplete="one-time-code" required autoFocus className="h-11 text-center text-lg tracking-[0.3em]" />
        </div>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <Button type="submit" className="h-11" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Verify</Button>
        <button type="button" className="text-sm text-primary hover:underline" onClick={() => setUseBackup((v) => !v)}>
          {useBackup ? "Use authenticator code instead" : "Use a backup code"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onPassword} className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">Government email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required className="h-11" defaultValue={demo ? "admin@rms.local" : undefined} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required minLength={10} className="h-11" />
      </div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <Button type="submit" className="h-11" disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />} Sign in
      </Button>
    </form>
  );
}
