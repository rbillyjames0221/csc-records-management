import { actorFromRequest, forbidden, json, notFoundJson, unauthorized } from "@/lib/api-auth";
import { canEditRecord, can } from "@/lib/rbac";
import { getReadableRecord } from "@/lib/records";
import { storeUploadedFile, findDuplicate, sniffMime, ALLOWED_MIME } from "@/lib/ingest";
import { audit } from "@/lib/audit";
import { db } from "@/db";
import { recordFiles } from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";

/**
 * POST multipart (field "file") → stores via the configured driver (local/on-prem, or blob for small files).
 * POST JSON {blobPathname, filename, pageCount} → registers a file the browser already uploaded to Vercel Blob (private).
 */
export async function POST(req: Request, ctx: RouteContext<"/api/v1/records/[id]/files">) {
  const { id } = await ctx.params;
  const actor = await actorFromRequest(req);
  if (!actor) return unauthorized();
  if (!can(actor, "record.create")) return forbidden();
  const rec = await getReadableRecord(actor, id);
  if (!rec) return notFoundJson();
  if (!canEditRecord(actor, { officeId: rec.office_id, sensitivity: rec.sensitivity, status: rec.status })) return forbidden();
  try {
    if ((req.headers.get("content-type") ?? "").includes("application/json")) {
      const body = (await req.json()) as { blobPathname?: string; filename?: string; pageCount?: number };
      if (!body.blobPathname?.startsWith(`records/${id}/`)) return json({ error: "invalid pathname" }, 400);
      const { get, del } = await import("@vercel/blob");
      const obj = await get(body.blobPathname, { access: "private", useCache: false });
      if (!obj || obj.statusCode !== 200 || !obj.stream) return json({ error: "blob not found" }, 404);
      const buf = Buffer.from(await new Response(obj.stream).arrayBuffer());
      const mime = sniffMime(buf);
      if (!mime || !ALLOWED_MIME.includes(mime)) { await del(body.blobPathname).catch(() => {}); return json({ error: "unsupported type" }, 415); }
      const sha = sha256Hex(buf);
      const dup = await findDuplicate(sha);
      if (dup) { await del(body.blobPathname).catch(() => {}); return json({ error: "duplicate", duplicate: dup }, 409); }
      const [row] = await db.insert(recordFiles).values({
        recordId: id, kind: "original", storageDriver: "blob", storageKey: body.blobPathname, filename: (body.filename ?? "upload").slice(0, 250),
        mimeType: mime, sizeBytes: buf.byteLength, sha256: sha, pageCount: body.pageCount ?? null, createdBy: actor.via === "session" ? actor.id : null,
      }).returning();
      await audit(actor, "file.upload", "record", id, { fileId: row.id, sha256: sha, driver: "blob" }, req);
      return json({ file: row }, 201);
    }
    const fd = await req.formData();
    const file = fd.get("file");
    if (!(file instanceof File)) return json({ error: "file field required" }, 400);
    const row = await storeUploadedFile(actor, id, file, { pageCount: Number(fd.get("pageCount")) || null, dpi: Number(fd.get("dpi")) || null });
    await audit(actor, "file.upload", "record", id, { fileId: row.id, sha256: row.sha256, size: row.sizeBytes }, req);
    return json({ file: row }, 201);
  } catch (e) {
    const err = e as Error & { code?: string; dup?: unknown };
    if (err.code === "duplicate") return json({ error: "duplicate", message: err.message, duplicate: err.dup }, 409);
    return json({ error: err.message }, 400);
  }
}
