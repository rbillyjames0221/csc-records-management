import { eq } from "drizzle-orm";
import { db } from "@/db";
import { records } from "@/db/schema";
import { actorFromRequest, forbidden, json, notFoundJson, unauthorized } from "@/lib/api-auth";
import { can, canEditRecord } from "@/lib/rbac";
import { getReadableRecord, upsertPages } from "@/lib/records";
import { pagesPayload } from "@/lib/validation";
import { audit } from "@/lib/audit";

/** POST {engine, textLayer?, pages:[{pageNo,text,confidence?}]} – text from pdf.js extraction or in-browser tesseract.js OCR. */
export async function POST(req: Request, ctx: RouteContext<"/api/v1/records/[id]/pages">) {
  const { id } = await ctx.params;
  const actor = await actorFromRequest(req);
  if (!actor) return unauthorized();
  if (!can(actor, "record.create")) return forbidden();
  const rec = await getReadableRecord(actor, id);
  if (!rec) return notFoundJson();
  if (!canEditRecord(actor, { officeId: rec.office_id, sensitivity: rec.sensitivity, status: rec.status })) return forbidden();
  const parsed = pagesPayload.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "validation", issues: parsed.error.issues }, 422);
  const { engine, pages, textLayer } = parsed.data;
  if (textLayer) await db.update(records).set({ textLayer }).where(eq(records.id, id));
  await upsertPages(id, pages, engine);
  await audit(actor, "record.index_text", "record", id, { engine, pages: pages.length }, req);
  const [r] = await db.select({ status: records.status, pageCount: records.pageCount }).from(records).where(eq(records.id, id));
  return json({ ok: true, ...r });
}
