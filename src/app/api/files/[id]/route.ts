import { eq } from "drizzle-orm";
import { db } from "@/db";
import { recordFiles } from "@/db/schema";
import { actorFromRequest, isWorker, WORKER_ACTOR, notFoundJson, json } from "@/lib/api-auth";
import { ANONYMOUS, canDownload } from "@/lib/rbac";
import { getReadableRecord } from "@/lib/records";
import { streamFile } from "@/lib/file-delivery";
import { audit } from "@/lib/audit";

/** Authenticated, audited file delivery. ?download=1 forces attachment. */
export async function GET(req: Request, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;
  // Anonymous callers are treated as public visitors: they can only reach public, active records.
  const actor = isWorker(req) ? WORKER_ACTOR : (await actorFromRequest(req)) ?? ANONYMOUS;
  const [f] = /^[0-9a-f-]{36}$/i.test(id) ? await db.select({ recordId: recordFiles.recordId }).from(recordFiles).where(eq(recordFiles.id, id)) : [];
  if (!f) return notFoundJson();
  const rec = actor.via === "worker" ? { id: f.recordId, sensitivity: "public" as const, office_id: null, status: "active", redaction_required: false } : await getReadableRecord(actor, f.recordId);
  if (!rec) return notFoundJson(); // do not reveal existence
  if (actor.via !== "worker" && !canDownload(actor, { sensitivity: rec.sensitivity, officeId: rec.office_id, status: rec.status, redactionRequired: rec.redaction_required })) {
    await audit(actor, "file.denied", "record", rec.id, { fileId: id, reason: "redaction_required" }, req);
    return json({ error: "forbidden", reason: "This record requires redaction before the original can be released." }, 403);
  }
  const download = new URL(req.url).searchParams.get("download") === "1";
  const out = await streamFile(id, { download });
  if (!out) return notFoundJson();
  if (actor.via !== "worker") await audit(actor, download ? "file.download" : "file.view", "record", rec.id, { fileId: id, filename: out.file.filename }, req);
  return out.response;
}
