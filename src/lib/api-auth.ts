import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { auth } from "@/lib/auth";
import { safeEqual, sha256Hex } from "@/lib/crypto";
import type { Actor } from "@/lib/rbac";
import type { Role } from "@/db/schema";

/** Resolves the caller of a REST route: session cookie first, then `Authorization: Bearer rms_…` API key. */
export async function actorFromRequest(req: Request): Promise<Actor | null> {
  const authz = req.headers.get("authorization");
  if (authz?.startsWith("Bearer rms_")) {
    const key = authz.slice(7).trim();
    const [k] = await db.select().from(apiKeys).where(and(eq(apiKeys.keyHash, sha256Hex(key)), isNull(apiKeys.revokedAt))).limit(1);
    if (!k) return null;
    db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, k.id)).catch(() => {});
    return { id: `apikey:${k.id}`, name: `API key: ${k.name}`, role: k.role, officeId: k.officeId, via: "api_key" };
  }
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return null;
  const u = session.user as typeof session.user & { role?: Role; officeId?: string | null; active?: boolean };
  if (u.active === false) return null;
  return { id: u.id, name: u.name, email: u.email, role: (u.role ?? "employee") as Role, officeId: u.officeId ?? null, via: "session" };
}

/** OCR worker authentication: shared bearer secret (WORKER_TOKEN). */
export function isWorker(req: Request): boolean {
  const expected = process.env.WORKER_TOKEN;
  if (!expected || expected.length < 16) return false;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return safeEqual(got, expected);
}

export const WORKER_ACTOR: Actor = { id: "worker", name: "OCR worker", role: "records_officer", officeId: null, via: "worker" };

export const json = (data: unknown, status = 200) => Response.json(data, { status });
export const unauthorized = () => json({ error: "unauthorized" }, 401);
export const forbidden = () => json({ error: "forbidden" }, 403);
export const notFoundJson = () => json({ error: "not_found" }, 404);
