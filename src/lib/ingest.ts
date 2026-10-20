import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { recordFiles, records } from "@/db/schema";
import { storage, storageKeyFor } from "@/lib/storage";
import { sha256Hex } from "@/lib/crypto";
import type { Actor } from "@/lib/rbac";

export const ALLOWED_MIME = ["application/pdf", "image/tiff", "image/png", "image/jpeg", "image/webp"];
export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 200) * 1024 * 1024;

/** Magic-byte sniffing so a renamed file cannot masquerade as a PDF/image. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString() === "PNG") return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  const t = buf.subarray(0, 4).toString("hex");
  if (t === "49492a00" || t === "4d4d002a") return "image/tiff";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}

export async function findDuplicate(sha: string) {
  const [d] = await db
    .select({ fileId: recordFiles.id, recordId: recordFiles.recordId, recordNo: records.recordNo, title: records.title })
    .from(recordFiles).innerJoin(records, eq(records.id, recordFiles.recordId))
    .where(and(eq(recordFiles.sha256, sha), isNull(recordFiles.deletedAt)));
  return d ?? null;
}

export async function storeUploadedFile(actor: Actor, recordId: string, file: File, opts: { pageCount?: number | null; dpi?: number | null }) {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`File exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`);
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime || !ALLOWED_MIME.includes(mime)) throw new Error("Unsupported file type. Upload PDF, TIFF, PNG, JPEG or WebP.");
  const sha = sha256Hex(buf);
  const dup = await findDuplicate(sha);
  if (dup) throw Object.assign(new Error(`Duplicate of ${dup.recordNo} (${dup.title})`), { code: "duplicate", dup });
  const s = storage();
  const key = storageKeyFor(recordId, sha, file.name);
  await s.put(key, buf, mime);
  const [row] = await db.insert(recordFiles).values({
    recordId, kind: "original", storageDriver: s.name, storageKey: key, filename: file.name.slice(0, 250), mimeType: mime, sizeBytes: buf.byteLength,
    sha256: sha, pageCount: opts.pageCount ?? null, dpi: opts.dpi ?? null, createdBy: actor.via === "session" ? actor.id : null,
  }).returning();
  return row;
}
