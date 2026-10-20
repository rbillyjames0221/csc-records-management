import { actorFromRequest, json, unauthorized, forbidden } from "@/lib/api-auth";
import { can } from "@/lib/rbac";
import { findDuplicate } from "@/lib/ingest";

/** GET /api/files/check?sha256=… → dedup check before upload (reveals only record no./title the caller could otherwise not see? → only for intake roles). */
export async function GET(req: Request) {
  const actor = await actorFromRequest(req);
  if (!actor) return unauthorized();
  if (!can(actor, "record.create")) return forbidden();
  const sha = new URL(req.url).searchParams.get("sha256") ?? "";
  if (!/^[a-f0-9]{64}$/.test(sha)) return json({ error: "sha256 required" }, 400);
  const d = await findDuplicate(sha);
  return json({ duplicate: d ? { recordId: d.recordId, recordNo: d.recordNo } : null });
}
