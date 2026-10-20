import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { can, type Actor, type Permission } from "@/lib/rbac";
import type { Role } from "@/db/schema";

export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const u = session.user as typeof session.user & { role?: Role; officeId?: string | null; active?: boolean; twoFactorEnabled?: boolean | null };
  if (u.active === false) return null;
  return { id: u.id, name: u.name, email: u.email, role: (u.role ?? "employee") as Role, officeId: u.officeId ?? null, via: "session", twoFactorEnabled: !!u.twoFactorEnabled };
});

export const getSessionInfo = cache(async () => auth.api.getSession({ headers: await headers() }));

/** For staff pages: redirects to login, sends public users to the portal, 404s on missing permission. */
export async function requireStaff(perm: Permission = "dashboard.view", opts: { skip2faCheck?: boolean } = {}): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.role === "public") redirect("/portal");
  const enforced = (process.env.REQUIRE_2FA_ROLES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!opts.skip2faCheck && enforced.includes(actor.role) && !actor.twoFactorEnabled) redirect("/settings?enforce2fa=1");
  if (!can(actor, perm)) notFound();
  return actor;
}

/** For server actions: throws instead of redirecting. */
export async function assertPermission(perm: Permission): Promise<Actor> {
  const actor = await getActor();
  if (!actor || !can(actor, perm)) throw new Error("Forbidden: you do not have permission for this action.");
  return actor;
}
