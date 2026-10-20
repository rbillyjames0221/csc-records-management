import "server-only";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import type { Actor } from "@/lib/rbac";

type AuditInput = {
  actorId?: string | null;
  actorLabel?: string | null;
  actorRole?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
};

export async function writeAudit(e: AuditInput) {
  try {
    await db.insert(auditEvents).values({
      actorId: e.actorId ?? null,
      actorLabel: e.actorLabel ?? null,
      actorRole: e.actorRole ?? null,
      action: e.action,
      entityType: e.entityType ?? null,
      entityId: e.entityId ?? null,
      ip: e.ip ?? null,
      userAgent: e.userAgent?.slice(0, 400) ?? null,
      details: e.details ?? {},
    });
  } catch (err) {
    // Audit failures must be visible in logs but must not leak to the user.
    console.error("[audit] failed to write event", e.action, err);
  }
}

export async function audit(actor: Actor, action: string, entityType: string | null, entityId: string | null, details: Record<string, unknown> = {}, req?: { headers: Headers }) {
  let h: Headers | undefined = req?.headers;
  if (!h) {
    try {
      const { headers } = await import("next/headers");
      h = await headers();
    } catch {
      h = undefined;
    }
  }
  await writeAudit({
    actorId: actor.id,
    actorLabel: actor.email ?? actor.name,
    actorRole: actor.role,
    action,
    entityType,
    entityId,
    ip: h?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h?.get("x-real-ip") ?? null,
    userAgent: h?.get("user-agent") ?? null,
    details: { via: actor.via, ...details },
  });
}
