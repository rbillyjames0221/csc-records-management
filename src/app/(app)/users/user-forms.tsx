"use client";
import { useActionState } from "react";
import { Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/constants";
import type { Role } from "@/db/schema";
import { createUser, updateUser } from "./actions";

type U = { id: string; name: string; email: string; role: Role; officeId: string | null; position: string | null; active: boolean };
type Office = { id: string; code: string; name: string };

function Fields({ u, offices, idp }: { u?: U; offices: Office[]; idp: string }) {
  return (
    <>
      <div className="grid gap-1.5"><Label htmlFor={`${idp}-name`}>Full name</Label><Input id={`${idp}-name`} name="name" required defaultValue={u?.name} className="h-10" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5"><Label htmlFor={`${idp}-role`}>Role</Label>
          <NativeSelect id={`${idp}-role`} name="role" defaultValue={u?.role ?? "employee"}>{(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r} title={ROLE_DESCRIPTIONS[r]}>{ROLE_LABELS[r]}</option>)}</NativeSelect></div>
        <div className="grid gap-1.5"><Label htmlFor={`${idp}-office`}>Office</Label>
          <NativeSelect id={`${idp}-office`} name="officeId" defaultValue={u?.officeId ?? ""}><option value="">—</option>{offices.map((o) => <option key={o.id} value={o.id}>{o.code}</option>)}</NativeSelect></div>
      </div>
      <div className="grid gap-1.5"><Label htmlFor={`${idp}-pos`}>Position</Label><Input id={`${idp}-pos`} name="position" defaultValue={u?.position ?? ""} className="h-10" /></div>
    </>
  );
}

export function CreateUser({ offices }: { offices: Office[] }) {
  const [state, action, pending] = useActionState(createUser, null);
  return (
    <Dialog>
      <DialogTrigger render={<Button><UserPlus className="size-4" /> Add user</Button>} />
      <DialogContent>
        <DialogHeader><DialogTitle>Add user</DialogTitle><DialogDescription>Self sign-up is disabled; accounts are provisioned by administrators (or via SSO).</DialogDescription></DialogHeader>
        {state?.ok ? <p className="text-sm">{state.message}</p> : (
          <form action={action} className="grid gap-3">
            <div className="grid gap-1.5"><Label htmlFor="n-email">Email</Label><Input id="n-email" name="email" type="email" required className="h-10" autoComplete="off" /></div>
            <Fields offices={offices} idp="n" />
            <div className="grid gap-1.5"><Label htmlFor="n-pw">Temporary password</Label><Input id="n-pw" name="password" type="password" required minLength={12} className="h-10" autoComplete="new-password" /></div>
            {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
            <DialogFooter><Button type="submit" disabled={pending}>Create</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function EditUser({ u, offices }: { u: U; offices: Office[] }) {
  const [state, action, pending] = useActionState(updateUser.bind(null, u.id), null);
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${u.name}`}><Pencil /></Button>} />
      <DialogContent>
        <DialogHeader><DialogTitle>Edit {u.name}</DialogTitle><DialogDescription>{u.email}</DialogDescription></DialogHeader>
        <form action={action} className="grid gap-3">
          <Fields u={u} offices={offices} idp={`e${u.id.slice(0, 6)}`} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={u.active} className="size-4 accent-primary" /> Account active</label>
          <div className="grid gap-1.5"><Label htmlFor={`pw-${u.id}`}>Reset password (optional)</Label><Input id={`pw-${u.id}`} name="password" type="password" className="h-10" autoComplete="new-password" /></div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          {state?.ok && <p className="text-sm text-emerald-700 dark:text-emerald-400">{state.message}</p>}
          <DialogFooter><Button type="submit" disabled={pending}>Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
