"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { db } from "@/db";
import { account, session, user, userRole } from "@/db/schema";
import { assertPermission } from "@/lib/session";
import { audit } from "@/lib/audit";

type State = { error?: string; ok?: boolean; message?: string } | null;

const pw = z.string().min(12, "Password must be at least 12 characters").max(128)
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v), "Password needs upper, lower case and a digit");

const base = z.object({
  name: z.string().trim().min(2).max(120),
  role: z.enum(userRole.enumValues),
  officeId: z.string().trim().optional().transform((v) => v || null),
  position: z.string().trim().max(120).optional().transform((v) => v || null),
});

export async function createUser(_: State, fd: FormData): Promise<State> {
  const actor = await assertPermission("users.manage");
  const p = base.extend({ email: z.string().trim().toLowerCase().email(), password: pw }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues.map((i) => i.message).join("; ") };
  const { email, password, ...rest } = p.data;
  if (rest.role === "regional" && !rest.officeId) return { error: "Regional users must be assigned an office." };
  const exists = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (exists.length) return { error: "A user with that email already exists." };
  const id = randomUUID();
  const hash = await hashPassword(password);
  await db.transaction(async (tx) => {
    await tx.insert(user).values({ id, email, emailVerified: true, ...rest });
    await tx.insert(account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash });
  });
  await audit(actor, "user.create", "user", id, { email, role: rest.role, officeId: rest.officeId });
  revalidatePath("/users");
  return { ok: true, message: `Created ${email}. Share the temporary password through a secure channel.` };
}

export async function updateUser(id: string, _: State, fd: FormData): Promise<State> {
  const actor = await assertPermission("users.manage");
  const p = base.extend({ active: z.preprocess((v) => v === "on", z.boolean()), password: z.union([z.literal(""), pw]).optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues.map((i) => i.message).join("; ") };
  const { password, ...rest } = p.data;
  if (id === actor.id && (rest.role !== "admin" || !rest.active)) return { error: "You cannot demote or disable your own account." };
  if (rest.role === "regional" && !rest.officeId) return { error: "Regional users must be assigned an office." };
  await db.update(user).set({ ...rest, updatedAt: new Date() }).where(eq(user.id, id));
  if (password) await db.update(account).set({ password: await hashPassword(password), updatedAt: new Date() }).where(and(eq(account.userId, id), eq(account.providerId, "credential")));
  if (!rest.active || password) await db.delete(session).where(eq(session.userId, id)); // force re-login
  await audit(actor, "user.update", "user", id, { ...rest, passwordReset: !!password });
  revalidatePath("/users");
  return { ok: true, message: "Saved." };
}
