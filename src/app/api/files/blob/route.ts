import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { actorFromRequest, json, unauthorized, forbidden } from "@/lib/api-auth";
import { can, canEditRecord } from "@/lib/rbac";
import { getReadableRecord } from "@/lib/records";
import { ALLOWED_MIME, MAX_UPLOAD_BYTES } from "@/lib/ingest";

/** Issues short-lived client-upload tokens for the private Vercel Blob store (bypasses the 4.5 MB function body limit). */
export async function POST(req: Request) {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const actor = await actorFromRequest(req);
        if (!actor) throw new Error("unauthorized");
        if (!can(actor, "record.create")) throw new Error("forbidden");
        const m = /^records\/([0-9a-f-]{36})\//.exec(pathname);
        const rec = m ? await getReadableRecord(actor, m[1]) : null;
        if (!rec || !canEditRecord(actor, { officeId: rec.office_id, sensitivity: rec.sensitivity, status: rec.status })) throw new Error("forbidden");
        return { allowedContentTypes: ALLOWED_MIME, maximumSizeInBytes: MAX_UPLOAD_BYTES, addRandomSuffix: true };
      },
      onUploadCompleted: async () => {
        /* registration happens via POST /api/v1/records/:id/files (works locally too) */
      },
    });
    return json(result);
  } catch (e) {
    const msg = (e as Error).message;
    return msg === "unauthorized" ? unauthorized() : msg === "forbidden" ? forbidden() : json({ error: msg }, 400);
  }
}
