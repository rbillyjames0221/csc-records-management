"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { classifications, planCategory, sensitivityEnum } from "@/db/schema";
import { assertPermission } from "@/lib/session";
import { audit } from "@/lib/audit";

const schema = z.object({
  code: z.string().trim().regex(/^[A-Z0-9-]{2,20}$/, "Code: 2–20 uppercase letters, digits or dashes"),
  name: z.string().trim().min(3).max(160),
  category: z.enum(planCategory.enumValues),
  parentId: z.string().trim().optional().transform((v) => v || null),
  defaultRetentionId: z.string().trim().optional().transform((v) => v || null),
  defaultSensitivity: z.enum(sensitivityEnum.enumValues),
  description: z.string().trim().max(500).optional(),
});

export async function saveClassification(_: unknown, fd: FormData): Promise<{ error?: string; ok?: boolean }> {
  const actor = await assertPermission("fileplan.manage");
  const p = schema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues.map((i) => i.message).join("; ") };
  const id = String(fd.get("id") || "") || p.data.code;
  const exists = (await db.select({ id: classifications.id }).from(classifications).where(eq(classifications.id, id))).length > 0;
  try {
    if (exists) await db.update(classifications).set({ ...p.data }).where(eq(classifications.id, id));
    else await db.insert(classifications).values({ id, ...p.data, sortOrder: 999 });
  } catch {
    return { error: "Code already in use" };
  }
  await audit(actor, exists ? "fileplan.update" : "fileplan.create", "classification", id, p.data);
  revalidatePath("/file-plan");
  return { ok: true };
}

export async function toggleClassification(id: string, active: boolean) {
  const actor = await assertPermission("fileplan.manage");
  await db.update(classifications).set({ active }).where(eq(classifications.id, id));
  await audit(actor, "fileplan.toggle", "classification", id, { active });
  revalidatePath("/file-plan");
}
