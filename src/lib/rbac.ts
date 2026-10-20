import { sql, type SQL } from "drizzle-orm";
import type { Role, Sensitivity } from "@/db/schema";

export type Actor = {
  id: string | null; // null = anonymous public / share link
  name: string;
  email?: string;
  role: Role;
  officeId: string | null;
  via: "session" | "api_key" | "anonymous" | "share_link" | "worker";
  twoFactorEnabled?: boolean;
};

export const ANONYMOUS: Actor = { id: null, name: "Public visitor", role: "public", officeId: null, via: "anonymous" };

export type Permission =
  | "dashboard.view" | "record.create" | "record.edit" | "record.delete" | "qa.review"
  | "fileplan.manage" | "retention.manage" | "disposition.request" | "disposition.approve"
  | "users.manage" | "audit.view" | "apikeys.manage" | "share.create" | "export" | "import";

export const MATRIX: Record<Permission, Role[]> = {
  "dashboard.view": ["admin", "official", "records_officer", "employee", "regional"],
  "record.create": ["admin", "records_officer", "regional"],
  "record.edit": ["admin", "records_officer", "regional"],
  "record.delete": ["admin"],
  "qa.review": ["admin", "records_officer"],
  "fileplan.manage": ["admin", "records_officer"],
  "retention.manage": ["admin", "records_officer"],
  "disposition.request": ["admin", "records_officer"],
  "disposition.approve": ["admin", "official"],
  "users.manage": ["admin"],
  "audit.view": ["admin", "official"],
  "apikeys.manage": ["admin"],
  "share.create": ["admin", "official", "records_officer"],
  export: ["admin", "official", "records_officer"],
  import: ["admin", "records_officer"],
};

export function can(actor: Actor | null | undefined, perm: Permission): boolean {
  if (!actor) return false;
  return MATRIX[perm].includes(actor.role);
}

export function permissionsFor(role: Role): Permission[] {
  return (Object.keys(MATRIX) as Permission[]).filter((p) => MATRIX[p].includes(role));
}

export const FULL_ACCESS_ROLES: Role[] = ["admin", "official"];

/**
 * Single source of truth for record visibility. Every list/search/export/file query uses it.
 * `alias` is the SQL alias of the records table in the query.
 */
export function accessFilter(actor: Actor, alias = "r"): SQL {
  const a = sql.raw(alias);
  const office = actor.officeId ?? "__none__";
  switch (actor.role) {
    case "admin":
    case "official":
      return sql`TRUE`;
    case "records_officer":
      return sql`(${a}.sensitivity <> 'restricted' OR ${a}.office_id = ${office})`;
    case "employee":
      return sql`(${a}.sensitivity IN ('public','internal') AND ${a}.status NOT IN ('disposed','draft'))`;
    case "regional":
      return sql`(${a}.status NOT IN ('disposed') AND (${a}.sensitivity = 'public' OR (${a}.office_id = ${office} AND ${a}.sensitivity IN ('internal','confidential'))))`;
    case "public":
    default:
      return sql`(${a}.sensitivity = 'public' AND ${a}.status = 'active')`;
  }
}

/** Same rule in TypeScript for already-loaded rows (kept identical to accessFilter). */
export function canRead(actor: Actor, r: { sensitivity: Sensitivity; officeId: string | null; status: string }): boolean {
  switch (actor.role) {
    case "admin":
    case "official":
      return true;
    case "records_officer":
      return r.sensitivity !== "restricted" || (!!actor.officeId && r.officeId === actor.officeId);
    case "employee":
      return (r.sensitivity === "public" || r.sensitivity === "internal") && !["disposed", "draft"].includes(r.status);
    case "regional":
      return r.status !== "disposed" && (r.sensitivity === "public" ||
        (!!actor.officeId && r.officeId === actor.officeId && (r.sensitivity === "internal" || r.sensitivity === "confidential")));
    default:
      return r.sensitivity === "public" && r.status === "active";
  }
}

export function canEditRecord(actor: Actor, r: { officeId: string | null; sensitivity: Sensitivity; status: string }) {
  if (!can(actor, "record.edit") || !canRead(actor, r)) return false;
  if (actor.role === "regional") return !!actor.officeId && r.officeId === actor.officeId;
  return true;
}

/** Original-file download: redaction-pending files only for full-access roles. */
export function canDownload(actor: Actor, r: { sensitivity: Sensitivity; officeId: string | null; status: string; redactionRequired: boolean }) {
  if (!canRead(actor, r)) return false;
  if (r.redactionRequired && !FULL_ACCESS_ROLES.includes(actor.role)) return false;
  return true;
}

/** Whether personal data must be masked for this viewer. */
export function mustMaskPII(actor: Actor) {
  return actor.role === "public";
}
