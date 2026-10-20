import { eq } from "drizzle-orm";
import { db } from "@/db";
import { recordPages } from "@/db/schema";
import { actorFromRequest, json, notFoundJson, unauthorized } from "@/lib/api-auth";
import { getReadableRecord, liveFiles } from "@/lib/records";
import { mustMaskPII } from "@/lib/rbac";
import { maskPII } from "@/lib/pii";
import { audit } from "@/lib/audit";

/** GET /api/v1/records/:id?include=text */
export async function GET(req: Request, ctx: RouteContext<"/api/v1/records/[id]">) {
  const { id } = await ctx.params;
  const actor = await actorFromRequest(req);
  if (!actor) return unauthorized();
  const rec = await getReadableRecord(actor, id);
  if (!rec) return notFoundJson();
  const includeText = new URL(req.url).searchParams.get("include") === "text";
  const files = (await liveFiles(id)).map((f) => ({ id: f.id, kind: f.kind, filename: f.filename, mimeType: f.mimeType, sizeBytes: f.sizeBytes, sha256: f.sha256, url: `/api/files/${f.id}` }));
  const pages = includeText ? (await db.select({ pageNo: recordPages.pageNo, text: recordPages.text, confidence: recordPages.confidence, engine: recordPages.ocrEngine }).from(recordPages).where(eq(recordPages.recordId, id)).orderBy(recordPages.pageNo)) : undefined;
  const mask = mustMaskPII(actor);
  await audit(actor, "record.view", "record", id, { api: true }, req);
  return json({ record: rec, files, pages: pages?.map((p) => ({ ...p, text: mask ? maskPII(p.text) : p.text })) });
}
