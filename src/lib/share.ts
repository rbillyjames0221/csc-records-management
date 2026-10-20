import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { sha256Hex } from "@/lib/crypto";

export type ShareLink = { id: string; record_id: string; allow_download: boolean; expires_at: string; uses: number; max_uses: number | null; created_by: string };

/** Validates a share token. With `consume`, atomically counts one use (page open); file fetches only re-validate. */
export async function resolveShare(token: string, consume: boolean): Promise<ShareLink | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const hash = sha256Hex(token);
  const { rows } = consume
    ? await db.execute(sql`UPDATE share_links SET uses = uses + 1 WHERE token_hash = ${hash} AND revoked_at IS NULL AND expires_at > now() AND (max_uses IS NULL OR uses < max_uses) RETURNING id, record_id, allow_download, expires_at, uses, max_uses, created_by`)
    : await db.execute(sql`SELECT id, record_id, allow_download, expires_at, uses, max_uses, created_by FROM share_links WHERE token_hash = ${hash} AND revoked_at IS NULL AND expires_at > now() AND (max_uses IS NULL OR uses <= max_uses)`);
  return (rows[0] as ShareLink | undefined) ?? null;
}

/** File served through a share link: a redacted copy when the record requires redaction (never the original), else access/original. */
export async function shareFile(recordId: string) {
  const { liveFiles } = await import("@/lib/records");
  const { rows } = await db.execute(sql`SELECT redaction_required FROM records WHERE id = ${recordId} AND status <> 'disposed'`);
  const r = rows[0] as { redaction_required: boolean } | undefined;
  if (!r) return null;
  const files = await liveFiles(recordId);
  if (r.redaction_required) return files.find((x) => x.kind === "redacted") ?? null;
  return files.find((x) => x.kind === "access") ?? files.find((x) => x.kind === "original") ?? null;
}
