"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { PII_RECORD_TYPES, RECORD_TYPE_LABELS, SENSITIVITY_LABELS, TYPE_FIELDS } from "@/lib/constants";
import type { RecordType } from "@/db/schema";

export type Lookup = { id: string; name: string; code?: string; parentId?: string | null; defaultSensitivity?: string; type?: string };

export type MetadataValues = {
  title?: string; recordType?: string; documentNumber?: string; description?: string; classificationId?: string; officeId?: string;
  dateCreated?: string; dateReceived?: string; sensitivity?: string; containsPii?: boolean; redactionRequired?: boolean; legalHold?: boolean;
  physicalLocation?: string; keywords?: string; metadata?: Record<string, string>;
};

/** Controlled/uncontrolled metadata form covering every field of the "Metadata & Indexing" block. Field names map 1:1 to the server schema. */
export function MetadataFields({
  values, onChange, offices, classifications, lockOffice, allowRestricted = true, prefix = "",
}: {
  values: MetadataValues; onChange?: (v: MetadataValues) => void; offices: Lookup[]; classifications: Lookup[]; lockOffice?: string | null; allowRestricted?: boolean; prefix?: string;
}) {
  const [local, setLocal] = useState<MetadataValues>(values);
  const v = onChange ? values : local;
  const set = (patch: Partial<MetadataValues>) => {
    const next = { ...v, ...patch };
    if (onChange) onChange(next); else setLocal(next);
  };
  const id = (s: string) => `${prefix}${s}`;
  const typeFields = TYPE_FIELDS[(v.recordType ?? "other") as RecordType] ?? [];
  const req = <span className="text-destructive" aria-hidden> *</span>;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor={id("title")}>Title{req}</Label>
        <Input id={id("title")} name="title" required minLength={3} value={v.title ?? ""} onChange={(e) => set({ title: e.target.value })} className="h-10" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("recordType")}>Record type{req}</Label>
        <NativeSelect id={id("recordType")} name="recordType" required value={v.recordType ?? ""} onChange={(e) => {
          const t = e.target.value as RecordType;
          const pii = PII_RECORD_TYPES.includes(t);
          set({ recordType: t, containsPii: pii, sensitivity: pii ? (allowRestricted ? "restricted" : "confidential") : v.sensitivity });
        }}>
          <option value="" disabled>Select…</option>
          {Object.entries(RECORD_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("documentNumber")}>Document no.</Label>
        <Input id={id("documentNumber")} name="documentNumber" placeholder="MC No. 01, s. 2026 · Resolution No. 2400721" value={v.documentNumber ?? ""} onChange={(e) => set({ documentNumber: e.target.value })} className="h-10" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("classificationId")}>Classification code (file plan){req}</Label>
        <NativeSelect id={id("classificationId")} name="classificationId" required value={v.classificationId ?? ""} onChange={(e) => {
          const c = classifications.find((x) => x.id === e.target.value);
          set({ classificationId: e.target.value, sensitivity: v.containsPii ? v.sensitivity : c?.defaultSensitivity ?? v.sensitivity });
        }}>
          <option value="" disabled>Select…</option>
          {classifications.map((c) => <option key={c.id} value={c.id}>{c.parentId ? "↳ " : ""}{c.code} – {c.name}</option>)}
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("officeId")}>Office / origin{req}</Label>
        <NativeSelect id={id("officeId")} name="officeId" required value={lockOffice ?? v.officeId ?? ""} disabled={!!lockOffice} onChange={(e) => set({ officeId: e.target.value })}>
          <option value="" disabled>Select…</option>
          {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </NativeSelect>
        {lockOffice && <input type="hidden" name="officeId" value={lockOffice} />}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("dateCreated")}>Date created</Label>
        <Input id={id("dateCreated")} name="dateCreated" type="date" value={v.dateCreated ?? ""} onChange={(e) => set({ dateCreated: e.target.value })} className="h-10" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("dateReceived")}>Date received</Label>
        <Input id={id("dateReceived")} name="dateReceived" type="date" value={v.dateReceived ?? ""} onChange={(e) => set({ dateReceived: e.target.value })} className="h-10" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("sensitivity")}>Access rights (sensitivity)</Label>
        <NativeSelect id={id("sensitivity")} name="sensitivity" value={v.sensitivity ?? ""} onChange={(e) => set({ sensitivity: e.target.value })}>
          <option value="">Default from classification</option>
          {Object.entries(SENSITIVITY_LABELS).filter(([k]) => allowRestricted || k !== "restricted").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("physicalLocation")}>Physical location (if applicable)</Label>
        <Input id={id("physicalLocation")} name="physicalLocation" placeholder="CO Records Vault, Cabinet 3, Box 12" value={v.physicalLocation ?? ""} onChange={(e) => set({ physicalLocation: e.target.value })} className="h-10" />
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor={id("keywords")}>Keywords / tags (comma-separated)</Label>
        <Input id={id("keywords")} name="keywords" placeholder="leave, wellness, mental health" value={v.keywords ?? ""} onChange={(e) => set({ keywords: e.target.value })} className="h-10" />
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor={id("description")}>Description</Label>
        <Textarea id={id("description")} name="description" rows={3} value={v.description ?? ""} onChange={(e) => set({ description: e.target.value })} />
      </div>
      {typeFields.length > 0 && (
        <fieldset className="grid gap-4 rounded-lg border p-3 sm:col-span-2 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium">{RECORD_TYPE_LABELS[v.recordType as RecordType]} details</legend>
          {typeFields.map((f) => (
            <div key={f.key} className="grid gap-1.5">
              <Label htmlFor={id(`meta.${f.key}`)}>{f.label}</Label>
              <Input id={id(`meta.${f.key}`)} name={`meta.${f.key}`} placeholder={f.placeholder} value={v.metadata?.[f.key] ?? ""} onChange={(e) => set({ metadata: { ...(v.metadata ?? {}), [f.key]: e.target.value } })} className="h-10" />
            </div>
          ))}
        </fieldset>
      )}
      <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:flex-wrap sm:gap-5">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="containsPii" className="size-4 accent-primary" checked={!!v.containsPii} onChange={(e) => set({ containsPii: e.target.checked })} /> Contains personal data (RA 10173)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="redactionRequired" className="size-4 accent-primary" checked={!!v.redactionRequired} onChange={(e) => set({ redactionRequired: e.target.checked })} /> Redaction required before release</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="legalHold" className="size-4 accent-primary" checked={!!v.legalHold} onChange={(e) => set({ legalHold: e.target.checked })} /> Legal hold (suspend disposition)</label>
      </div>
    </div>
  );
}
