"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { MetadataFields, type Lookup, type MetadataValues } from "@/components/metadata-fields";
import { updateRecordAction, type ActionState } from "../../actions";

export function EditForm({ id, values, offices, classifications, lockOffice, allowRestricted }: { id: string; values: MetadataValues; offices: Lookup[]; classifications: Lookup[]; lockOffice: string | null; allowRestricted: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateRecordAction.bind(null, id), null);
  return (
    <form action={action} className="grid gap-5">
      <MetadataFields values={values} offices={offices} classifications={classifications} lockOffice={lockOffice} allowRestricted={allowRestricted} />
      {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="h-10 px-5">Save changes</Button>
        <Link href={`/records/${id}`} className={buttonVariants({ variant: "outline", className: "h-10" })}>Cancel</Link>
      </div>
    </form>
  );
}
