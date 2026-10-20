import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { recordFiles } from "@/db/schema";
import { storageFor } from "@/lib/storage";

export async function streamFile(fileId: string, opts: { download: boolean; filenameOverride?: string }) {
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return null;
  const [f] = await db.select().from(recordFiles).where(and(eq(recordFiles.id, fileId), isNull(recordFiles.deletedAt)));
  if (!f) return null;
  const obj = await storageFor(f.storageDriver).get(f.storageKey);
  if (!obj) return null;
  const name = (opts.filenameOverride ?? f.filename).replace(/[^\w.\- ()]/g, "_");
  return {
    file: f,
    response: new Response(obj.stream, {
      headers: {
        "Content-Type": f.mimeType,
        ...(obj.size ? { "Content-Length": String(obj.size) } : {}),
        "Content-Disposition": `${opts.download ? "attachment" : "inline"}; filename="${name}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        // Non-PDF/image content is sandboxed so an uploaded HTML/SVG can never execute in our origin.
        ...(/^(application\/pdf|image\/(png|jpeg|tiff|webp))$/.test(f.mimeType) ? {} : { "Content-Security-Policy": "default-src 'none'; sandbox" }),
      },
    }),
  };
}
