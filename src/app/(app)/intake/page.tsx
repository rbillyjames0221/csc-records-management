import { Suspense } from "react";
import { requireStaff } from "@/lib/session";
import { getLookups } from "@/lib/lookups";
import { storage } from "@/lib/storage";
import { PageHeader } from "@/components/rms";
import { Skeleton } from "@/components/ui/skeleton";
import { IntakeWizard } from "./intake-wizard";

export const metadata = { title: "Intake" };

async function Intake() {
  const actor = await requireStaff("record.create");
  const { offices, classifications } = await getLookups();
  return (
    <>
      <PageHeader eyebrow="Records creation / receipt" title="Intake & digitization" description="Upload scans or born-digital files, classify them against the file plan, run free OCR, and pass QA before they enter the central repository." />
      <IntakeWizard
        offices={offices.map((o) => ({ id: o.id, name: o.name }))}
        classifications={classifications.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name, code: c.code, parentId: c.parentId, defaultSensitivity: c.defaultSensitivity }))}
        defaultOffice={actor.officeId}
        lockOffice={actor.role === "regional" ? actor.officeId : null}
        allowRestricted={["admin", "official", "records_officer"].includes(actor.role)}
        storageDriver={storage().name}
      />
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<Skeleton className="h-[60vh]" />}><Intake /></Suspense>;
}
