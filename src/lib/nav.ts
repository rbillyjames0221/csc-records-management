import type { Permission } from "@/lib/rbac";

export type NavItem = { href: string; label: string; icon: string; perm?: Permission; group: "Work" | "Governance" | "System"; mobile?: boolean };

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", group: "Work", mobile: true },
  { href: "/records", label: "Records", icon: "records", group: "Work", mobile: true },
  { href: "/intake", label: "Intake", icon: "intake", perm: "record.create", group: "Work", mobile: true },
  { href: "/qa", label: "QA Review", icon: "qa", perm: "qa.review", group: "Work", mobile: true },
  { href: "/file-plan", label: "File Plan", icon: "fileplan", group: "Governance" },
  { href: "/retention", label: "Retention", icon: "retention", group: "Governance" },
  { href: "/audit", label: "Audit Log", icon: "audit", perm: "audit.view", group: "Governance" },
  { href: "/users", label: "Users & Roles", icon: "users", perm: "users.manage", group: "System" },
  { href: "/integrations", label: "Integrations & API", icon: "api", group: "System" },
  { href: "/help", label: "Help & Manuals", icon: "help", group: "System" },
  { href: "/settings", label: "Settings", icon: "settings", group: "System" },
];
