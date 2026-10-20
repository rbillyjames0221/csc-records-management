"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys, userRole } from "@/db/schema";
import { assertPermission } from "@/lib/session";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { audit } from "@/lib/audit";

export async function createApiKey(_: unknown, fd: FormData): Promise<{ error?: string; key?: string }> {
  const actor = await assertPermission("apikeys.manage");
  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  const role = String(fd.get("role") ?? "employee");
  const officeId = String(fd.get("officeId") ?? "") || null;
  if (name.length < 3) return { error: "Name is required" };
  if (!(userRole.enumValues as readonly string[]).includes(role) || role === "admin") return { error: "Invalid role (admin keys are not allowed)" };
  const key = `rms_${randomToken(30)}`;
  const [k] = await db.insert(apiKeys).values({ name, prefix: key.slice(0, 10), keyHash: sha256Hex(key), role: role as "employee", officeId, createdBy: actor.id! }).returning({ id: apiKeys.id });
  await audit(actor, "apikey.create", "api_key", k.id, { name, role, officeId });
  revalidatePath("/integrations");
  return { key };
}

export async function revokeApiKey(id: string) {
  const actor = await assertPermission("apikeys.manage");
  await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id));
  await audit(actor, "apikey.revoke", "api_key", id, {});
  revalidatePath("/integrations");
}
