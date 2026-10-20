"use client";
import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { decideDisposition, executeDisposition, saveSchedule } from "./actions";

export function DecideButton({ requestId, approve, action }: { requestId: string; approve: boolean; action: string }) {
  // The request card re-renders (and this dialog unmounts) once the decision is saved, so confirm with a toast.
  const [state, formAction, pending] = useActionState(async (prev: Awaited<ReturnType<typeof decideDisposition>>, fd: FormData) => {
    const r = await decideDisposition(requestId, approve, prev, fd);
    if (r?.ok) toast.success(approve ? "Disposition approved" : "Disposition rejected");
    return r;
  }, null);
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant={approve ? "default" : "outline"}>{approve ? <Check className="size-4" /> : <X className="size-4" />}{approve ? "Approve" : "Reject"}</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{approve ? "Approve" : "Reject"} disposition ({action})</DialogTitle>
          <DialogDescription>{approve && action === "destroy" ? "Destruction of public records requires prior NAP authority (RA 9470). Enter the Authority to Dispose reference." : "Your decision is recorded in the audit log."}</DialogDescription>
        </DialogHeader>
        {state?.ok ? <p className="text-sm">Decision recorded.</p> : (
          <form action={formAction} className="grid gap-3">
            {approve && <div className="grid gap-1.5"><Label htmlFor={`auth-${requestId}`}>NAP authority reference {action === "destroy" ? "(required)" : "(optional)"}</Label><Input id={`auth-${requestId}`} name="authorityRef" className="h-10" placeholder="SAMPLE: NAP-ATD-2026-0001" /></div>}
            <div className="grid gap-1.5"><Label htmlFor={`note-${requestId}`}>Note</Label><Input id={`note-${requestId}`} name="note" className="h-10" /></div>
            {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
            <DialogFooter><Button type="submit" disabled={pending} variant={approve ? "default" : "destructive"}>Confirm</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ExecuteButton({ requestId, action }: { requestId: string; action: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant={action === "destroy" ? "destructive" : "default"} disabled={pending}
      onClick={() => {
        if (action === "destroy" && !confirm("Permanently delete files and page text for this record? Only a register tombstone will remain.")) return;
        start(async () => { try { await executeDisposition(requestId); toast.success("Disposition executed"); } catch (e) { toast.error((e as Error).message); } });
      }}>Execute {action}</Button>
  );
}

type S = { id: string; code: string; recordSeries: string; activeYears: number; inactiveYears: number; permanent: boolean; finalDisposition: string; legalBasis: string | null; description: string | null };

export function ScheduleForm({ existing }: { existing?: S }) {
  const [state, action, pending] = useActionState(saveSchedule, null);
  return (
    <Dialog>
      <DialogTrigger render={existing ? <Button size="icon-sm" variant="ghost" aria-label={`Edit ${existing.code}`}><Pencil /></Button> : <Button size="sm"><Plus className="size-4" /> New schedule</Button>} />
      <DialogContent>
        <DialogHeader><DialogTitle>{existing ? `Edit ${existing.code}` : "New retention schedule"}</DialogTitle><DialogDescription>Saving recomputes due dates of records on this schedule.</DialogDescription></DialogHeader>
        {state?.ok ? <p className="text-sm">Saved.</p> : (
          <form action={action} className="grid gap-3">
            {existing && <input type="hidden" name="id" value={existing.id} />}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label htmlFor="s-code">Code</Label><Input id="s-code" name="code" required defaultValue={existing?.code} className="h-10 font-mono" /></div>
              <div className="grid gap-1.5"><Label htmlFor="s-fd">Final disposition</Label>
                <NativeSelect id="s-fd" name="finalDisposition" defaultValue={existing?.finalDisposition ?? "destroy"}><option value="keep">Keep (permanent)</option><option value="transfer">Transfer to NAP</option><option value="destroy">Destroy</option></NativeSelect></div>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="s-series">Record series</Label><Input id="s-series" name="recordSeries" required defaultValue={existing?.recordSeries} className="h-10" /></div>
            <div className="grid grid-cols-3 items-end gap-3">
              <div className="grid gap-1.5"><Label htmlFor="s-a">Active yrs</Label><Input id="s-a" name="activeYears" type="number" min={0} defaultValue={existing?.activeYears ?? 5} className="h-10" /></div>
              <div className="grid gap-1.5"><Label htmlFor="s-i">Inactive yrs</Label><Input id="s-i" name="inactiveYears" type="number" min={0} defaultValue={existing?.inactiveYears ?? 5} className="h-10" /></div>
              <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" name="permanent" defaultChecked={existing?.permanent} className="size-4 accent-primary" /> Permanent</label>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="s-lb">Legal basis</Label><Input id="s-lb" name="legalBasis" defaultValue={existing?.legalBasis ?? ""} className="h-10" placeholder="e.g. NAP GRDS item / RA" /></div>
            {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
            <DialogFooter><Button type="submit" disabled={pending}>Save</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
