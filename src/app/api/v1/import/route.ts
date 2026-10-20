import { actorFromRequest, forbidden, json, unauthorized } from "@/lib/api-auth";
import { can } from "@/lib/rbac";
import { parseCsv } from "@/lib/csv";
import { createRecord } from "@/lib/records";
import { recordInput } from "@/lib/validation";
import { audit } from "@/lib/audit";

const MAX_ROWS = 2000;
export const maxDuration = 300;

/**
 * POST text/csv (or multipart field "file") – bulk metadata import (e.g. from a legacy Excel index).
 * Columns: title,recordType,classificationId,officeId[,documentNumber,dateCreated,sensitivity,keywords,description,physicalLocation]
 * keywords are ";"-separated. Use ?dryRun=1 to validate only. Files are attached later via the intake UI or API.
 */
export async function POST(req: Request) {
  const actor = await actorFromRequest(req);
  if (!actor) return unauthorized();
  if (!can(actor, "import") || !can(actor, "record.create")) return forbidden();
  let text: string;
  if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
    const f = (await req.formData()).get("file");
    if (!(f instanceof File)) return json({ error: "missing file" }, 400);
    text = await f.text();
  } else text = await req.text();
  if (text.length > 5_000_000) return json({ error: "CSV too large (5 MB max per request)" }, 413);
  const rows = parseCsv(text);
  if (rows.length < 2) return json({ error: "CSV needs a header row and at least one data row" }, 400);
  const header = rows[0].map((h) => h.trim());
  for (const req of ["title", "recordType", "classificationId", "officeId"]) if (!header.includes(req)) return json({ error: `missing column ${req}` }, 400);
  const data = rows.slice(1, MAX_ROWS + 1);
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  const errors: { row: number; error: string }[] = [];
  const created: string[] = [];
  for (let i = 0; i < data.length; i++) {
    const o: Record<string, unknown> = Object.fromEntries(header.map((h, j) => [h, data[i][j]?.trim() ?? ""]));
    o.keywords = String(o.keywords ?? "").split(";").map((k) => k.trim()).filter(Boolean);
    o.sourceFormat = "paper_scan";
    if (!o.sensitivity) delete o.sensitivity;
    const p = recordInput.safeParse(o);
    if (!p.success) { errors.push({ row: i + 2, error: p.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") }); continue; }
    if (dryRun) continue;
    try {
      const r = await createRecord(actor, p.data);
      created.push(r.recordNo);
    } catch (e) {
      errors.push({ row: i + 2, error: (e as Error).message });
    }
  }
  if (!dryRun) await audit(actor, "import.csv", null, null, { rows: data.length, created: created.length, errors: errors.length }, req);
  return json({ dryRun, rows: data.length, created: created.length, recordNos: created.slice(0, 50), errors: errors.slice(0, 200), truncated: rows.length - 1 > MAX_ROWS });
}
