"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Monitor, Moon, ShieldCheck, Sun } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const opts = [{ v: "light", l: "Light", i: Sun }, { v: "dark", l: "Dark", i: Moon }, { v: "system", l: "System", i: Monitor }];
  return (
    <div role="radiogroup" aria-label="Theme" className="flex gap-2">
      {opts.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={theme === o.v} onClick={() => setTheme(o.v)}
          className={cn("flex min-w-20 flex-col items-center gap-1 rounded-xl border p-3 text-sm", theme === o.v ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "hover:bg-muted")}>
          <o.i className="size-5" /> {o.l}
        </button>
      ))}
    </div>
  );
}

export function ProfileForm({ name }: { name: string }) {
  const [v, setV] = useState(name);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true);
      const { error } = await authClient.updateUser({ name: v.trim() });
      setBusy(false);
      if (error) toast.error(error.message ?? "Could not update"); else { toast.success("Profile updated"); router.refresh(); }
    }}>
      <div className="grid flex-1 gap-1.5"><Label htmlFor="p-name">Display name</Label><Input id="p-name" value={v} onChange={(e) => setV(e.target.value)} minLength={2} required className="h-10" /></div>
      <Button type="submit" disabled={busy || v.trim() === name}>Save</Button>
    </form>
  );
}

export function PasswordForm() {
  const [busy, setBusy] = useState(false);
  return (
    <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const newPassword = String(fd.get("new"));
      if (newPassword.length < 12) return toast.error("New password must be at least 12 characters");
      setBusy(true);
      const { error } = await authClient.changePassword({ currentPassword: String(fd.get("current")), newPassword, revokeOtherSessions: true });
      setBusy(false);
      if (error) toast.error(error.message ?? "Could not change password"); else { toast.success("Password changed; other sessions signed out"); (e.target as HTMLFormElement).reset(); }
    }}>
      <div className="grid gap-1.5"><Label htmlFor="pw-cur">Current password</Label><Input id="pw-cur" name="current" type="password" required autoComplete="current-password" className="h-10" /></div>
      <div className="grid gap-1.5"><Label htmlFor="pw-new">New password (12+ chars)</Label><Input id="pw-new" name="new" type="password" required minLength={12} autoComplete="new-password" className="h-10" /></div>
      <Button type="submit" disabled={busy}>Change</Button>
    </form>
  );
}

export function TwoFactor({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "verify">("idle");
  const [qr, setQr] = useState<string | null>(null);
  const [uri, setUri] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  if (enabled) return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400"><ShieldCheck className="size-5" /> Two-factor authentication is on.</span>
      <form className="flex items-end gap-2" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        const { error } = await authClient.twoFactor.disable({ password: String(new FormData(e.currentTarget).get("password")) });
        setBusy(false);
        if (error) toast.error(error.message ?? "Failed"); else { toast.success("2FA disabled"); router.refresh(); }
      }}>
        <Label htmlFor="d-pw" className="sr-only">Password</Label><Input id="d-pw" name="password" type="password" placeholder="Password to disable" required className="h-9 w-48" />
        <Button variant="outline" size="sm" disabled={busy}>Disable</Button>
      </form>
    </div>
  );

  if (step === "verify") return (
    <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {qr && <img src={qr} alt="QR code for your authenticator app" width={180} height={180} className="rounded-lg border bg-white p-2" />}
      <div className="grid content-start gap-3 text-sm">
        <p>Scan with Google Authenticator, Microsoft Authenticator or any TOTP app, then enter the 6-digit code.</p>
        <details><summary className="cursor-pointer text-muted-foreground">Can&apos;t scan? Show setup key</summary><code className="mt-1 block break-all text-xs">{new URL(uri).searchParams.get("secret")}</code></details>
        <form className="flex items-end gap-2" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true);
          const { error } = await authClient.twoFactor.verifyTotp({ code: String(new FormData(e.currentTarget).get("code")).trim() });
          setBusy(false);
          if (error) toast.error(error.message ?? "Invalid code"); else { toast.success("Two-factor authentication enabled"); router.refresh(); }
        }}>
          <div className="grid gap-1.5"><Label htmlFor="t-code">Code</Label><Input id="t-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" required className="h-10 w-32 tracking-widest" /></div>
          <Button disabled={busy}>Verify &amp; enable</Button>
        </form>
        {codes.length > 0 && <div><p className="font-medium">Backup codes — store them offline. Each works once.</p><ul className="mt-1 grid grid-cols-2 gap-1 font-mono text-xs sm:grid-cols-5">{codes.map((c) => <li key={c} className="rounded bg-muted px-2 py-1">{c}</li>)}</ul></div>}
      </div>
    </div>
  );

  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true);
      const { data, error } = await authClient.twoFactor.enable({ password: String(new FormData(e.currentTarget).get("password")), method: "totp" });
      setBusy(false);
      if (error || !data || data.method !== "totp") return toast.error(error?.message ?? "Failed");
      setUri(data.totpURI); setCodes(data.backupCodes ?? []);
      setQr(await QRCode.toDataURL(data.totpURI, { margin: 1, width: 360 }));
      setStep("verify");
    }}>
      <div className="grid gap-1.5"><Label htmlFor="e-pw">Confirm your password</Label><Input id="e-pw" name="password" type="password" required autoComplete="current-password" className="h-10 w-60" /></div>
      <Button disabled={busy}><ShieldCheck className="size-4" /> Set up 2FA</Button>
    </form>
  );
}
