import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireStaff } from "@/lib/session";
import { canEditRecord } from "@/lib/rbac";
import { getReadableRecord } from "@/lib/records";
import { getLookups } from "@/lib/lookups";
import { PageHeader } from "@/components/rms";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EditForm } from "./edit-form";

async function Edit({ params }: { params: PageProps<"/records/[id]/edit">["params"] }) {
  const actor = await requireStaff("record.edit");
  const { id } = await params;
  const rec = await getReadableRecord(actor, id);
  if (!rec || !canEditRecord(actor, { officeId: rec.office_id, sensitivity: rec.sensitivity, status: rec.status })) notFound();
  const { offices, classifications } = await getLookups();
  return (
    <>
      <PageHeader eyebrow={rec.record_no} title="Edit metadata" description="Changes are validated, recomputes the retention due date from the classification, and are recorded in the audit trail with before/after values." />
      <Card><CardContent>
        <EditForm
          id={id}
          lockOffice={actor.role === "regional" ? actor.officeId : null}
          allowRestricted={["admin", "official", "records_officer"].includes(actor.role)}
          offices={offices.map((o) => ({ id: o.id, name: o.name }))}
          classifications={classifications.map((c) => ({ id: c.id, name: c.name, code: c.code, parentId: c.parentId, defaultSensitivity: c.defaultSensitivity }))}
          values={{
            title: rec.title, recordType: rec.record_type, documentNumber: rec.document_number ?? "", description: rec.description ?? "", classificationId: rec.classification_id ?? "",
            officeId: rec.office_id ?? "", dateCreated: rec.date_created ?? "", dateReceived: rec.date_received ?? "", sensitivity: rec.sensitivity, containsPii: rec.contains_pii,
            redactionRequired: rec.redaction_required, legalHold: rec.legal_hold, physicalLocation: rec.physical_location ?? "", keywords: rec.keywords.join(", "), metadata: rec.metadata,
          }}
        />
      </CardContent></Card>
    </>
  );
}

export default function Page(props: PageProps<"/records/[id]/edit">) {
  return <Suspense fallback={<Skeleton className="h-[70vh]" />}><Edit params={props.params} /></Suspense>;
}
