import { ZodError } from "zod";
import { actorFromRequest, forbidden, json, unauthorized } from "@/lib/api-auth";
import { can } from "@/lib/rbac";
import { createRecord } from "@/lib/records";
import { parseSearchParams, searchRecords } from "@/lib/search";
import { audit } from "@/lib/audit";

/** GET /api/v1/records?q=&type=&… – search/list (same RBAC as the UI). */
export async function GET(req: Request) {
  const actor = await actorFromRequest(req);
  if (!actor) return unauthorized();
  const params = parseSearchParams(new URL(req.url).searchParams);
  const res = await searchRecords(actor, params);
  if (params.q) await audit(actor, "search", null, null, { q: params.q, total: res.total, api: true }, req);
  return json(res);
}

/** POST /api/v1/records – create a record (metadata JSON). */
export async function POST(req: Request) {
  const actor = await actorFromRequest(req);
  if (!actor) return unauthorized();
  if (!can(actor, "record.create")) return forbidden();
  try {
    const body = await req.json();
    const row = await createRecord(actor, body);
    await audit(actor, "record.create", "record", row.id, { recordNo: row.recordNo, title: body?.title }, req);
    return json(row, 201);
  } catch (e) {
    if (e instanceof ZodError) return json({ error: "validation", issues: e.issues }, 422);
    return json({ error: (e as Error).message }, 400);
  }
}
