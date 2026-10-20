import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { actorFromRequest, forbidden, unauthorized } from "@/lib/api-auth";
import { can } from "@/lib/rbac";
import { parseSearchParams, searchRecords } from "@/lib/search";
import { csvRow } from "@/lib/csv";
import { audit } from "@/lib/audit";

const MAX_ROWS = 10_000;

/** GET ?dataset=records|audit&…filters → CSV (UTF-8 with BOM for Excel). Requires the `export` permission. */
export async function GET(req: Request) {
  const actor = await actorFromRequest(req);
  if (!actor) return unauthorized();
  const url = new URL(req.url);
  const dataset = url.searchParams.get("dataset") ?? "records";
  const stamp = new Date().toISOString().slice(0, 10);
  let body = "\uFEFF";
  let count = 0;

  if (dataset === "audit") {
    if (!can(actor, "audit.view") || !can(actor, "export")) return forbidden();
    const conds: SQL[] = [];
    const action = url.searchParams.get("action"), entity = url.searchParams.get("entity"), from = url.searchParams.get("from"), to = url.searchParams.get("to");
    if (action) conds.push(sql`action LIKE ${action.replace(/[%_]/g, "") + "%"}`);
    if (entity) conds.push(sql`entity_id = ${entity}`);
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) conds.push(sql`at >= (${from}::date::timestamp AT TIME ZONE 'Asia/Manila')`);
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) conds.push(sql`at < ((${to}::date + 1)::timestamp AT TIME ZONE 'Asia/Manila')`);
    const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
    const { rows } = await db.execute(sql`SELECT id, at, actor_label, actor_role, action, entity_type, entity_id, ip, details FROM audit_events ${where} ORDER BY at DESC LIMIT ${MAX_ROWS}`);
    body += csvRow(["id", "at_utc", "actor", "role", "action", "entity_type", "entity_id", "ip", "details"]);
    for (const r of rows as Record<string, unknown>[]) body += csvRow([r.id, r.at, r.actor_label, r.actor_role, r.action, r.entity_type, r.entity_id, r.ip, r.details]);
    count = rows.length;
  } else {
    if (!can(actor, "export")) return forbidden();
    const p = parseSearchParams(url.searchParams);
    body += csvRow(["record_no", "title", "document_number", "record_type", "classification", "office", "date_created", "sensitivity", "status", "text_layer", "pages", "ocr_confidence", "contains_pii", "sample"]);
    for (let page = 1; count < MAX_ROWS; page++) {
      const res = await searchRecords(actor, { ...p, page, pageSize: 100 });
      for (const h of res.hits) body += csvRow([h.recordNo, h.title, h.documentNumber, h.recordType, h.classificationCode, h.officeCode, h.dateCreated, h.sensitivity, h.status, h.textLayer, h.pageCount, h.ocrConfidence?.toFixed(1), h.containsPii, h.isSample]);
      count += res.hits.length;
      if (res.hits.length < 100) break;
    }
  }
  await audit(actor, "export.csv", null, null, { dataset, rows: count, query: Object.fromEntries(url.searchParams) }, req);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rms-${dataset}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
