import "server-only";
import { getActor } from "@/lib/session";
import { ANONYMOUS, type Actor } from "@/lib/rbac";

/** Portal pages always act with public-level access, even for signed-in staff, so the portal shows exactly what citizens see. */
export async function portalActor(): Promise<Actor> {
  const a = await getActor();
  return a?.role === "public" ? a : ANONYMOUS;
}
