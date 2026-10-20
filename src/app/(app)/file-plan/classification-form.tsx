"use client";
import { useActionState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { CATEGORY_LABELS, SENSITIVITY_LABELS } from "@/lib/constants";
import { saveClassification } from "./actions";

type C = { id: string; code: string; name: string; category: string; parentId: string | null; defaultRetentionId: string | null; defaultSensitivity: string; description: string | null };

export function ClassificationForm({ existing, parents, retention, trigger }: { existing?: C; parents: { id: string; code: string; name: string }[]; retention: { id: string; code: string; recordSeries: string }[]; trigger?: React.ReactNode }) {
  const [state, action, pending] = useActionState(saveClassification, null);
  return (
    <Dialog>
      <DialogTrigger render={(trigger as React.ReactElement) ?? <Button><Plus className="size-4" /> New series</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? `Edit ${existing.code}` : "New classification / record series"}</DialogTitle>
          <DialogDescription>Defaults apply to new records filed under this code.</DialogDescription>
        </DialogHeader>
        {state?.ok ? <p className="text-sm">Saved.</p> : (
          <form action={action} className="grid gap-3">
            {existing && <input type="hidden" name="id" value={existing.id} />}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label htmlFor="c-code">Code</Label><Input id="c-code" name="code" required defaultValue={existing?.code} placeholder="LEG-MC" className="h-10 font-mono" /></div>
              <div className="grid gap-1.5"><Label htmlFor="c-cat">Category</Label>
                <NativeSelect id="c-cat" name="category" defaultValue={existing?.category ?? "legal"}>{Object.entries(CATEGORY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect></div>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="c-name">Name</Label><Input id="c-name" name="name" required defaultValue={existing?.name} className="h-10" /></div>
            <div className="grid gap-1.5"><Label htmlFor="c-parent">Parent</Label>
              <NativeSelect id="c-parent" name="parentId" defaultValue={existing?.parentId ?? ""}><option value="">(top level)</option>{parents.map((p) => <option key={p.id} value={p.id}>{p.code} – {p.name}</option>)}</NativeSelect></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label htmlFor="c-ret">Retention schedule</Label>
                <NativeSelect id="c-ret" name="defaultRetentionId" defaultValue={existing?.defaultRetentionId ?? ""}><option value="">None</option>{retention.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}</NativeSelect></div>
              <div className="grid gap-1.5"><Label htmlFor="c-sens">Default access</Label>
                <NativeSelect id="c-sens" name="defaultSensitivity" defaultValue={existing?.defaultSensitivity ?? "internal"}>{Object.entries(SENSITIVITY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect></div>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="c-desc">Description</Label><Input id="c-desc" name="description" defaultValue={existing?.description ?? ""} className="h-10" /></div>
            {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
            <DialogFooter><Button type="submit" disabled={pending}>Save</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
