"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Archive, BookOpen, ClipboardCheck, FolderTree, LayoutDashboard, LogOut, Monitor, Moon, MoreHorizontal, Plug,
  ScrollText, Search, Settings, Sun, Upload, Users, FileSearch, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { NavItem } from "@/lib/nav";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard, records: FileSearch, intake: Upload, qa: ClipboardCheck, fileplan: FolderTree, retention: Archive,
  audit: ScrollText, users: Users, api: Plug, help: BookOpen, settings: Settings,
};

type ShellUser = { name: string; email?: string; roleLabel: string; officeName: string | null };

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 rounded-md outline-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" alt="" width={32} height={32} className="size-8 rounded-lg" />
      {!compact && (
        <span className="leading-tight">
          <span className="block text-sm font-semibold tracking-tight">CSC Records</span>
          <span className="block text-[11px] opacity-75">Management System</span>
        </span>
      )}
    </Link>
  );
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = ["Work", "Governance", "System"] as const;
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {groups.map((g) => {
        const list = items.filter((i) => i.group === g);
        if (!list.length) return null;
        return (
          <div key={g}>
            <div className="px-3 pb-1.5 text-[11px] font-medium tracking-wider uppercase opacity-60">{g}</div>
            <ul className="flex flex-col gap-0.5">
              {list.map((item) => {
                const Icon = ICONS[item.icon] ?? FileSearch;
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                        active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60",
                      )}
                    >
                      <Icon className={cn("size-4", active && "text-sidebar-primary")} aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function ThemeMenuItems() {
  const { setTheme, theme } = useTheme();
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>Theme</DropdownMenuLabel>
      {[["light", Sun, "Light"], ["dark", Moon, "Dark"], ["system", Monitor, "System"]].map(([v, I, l]) => {
        const Icon = I as LucideIcon;
        return (
          <DropdownMenuItem key={v as string} onClick={() => setTheme(v as string)}>
            <Icon className="size-4" /> {l as string} {theme === v ? "✓" : ""}
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuGroup>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const router = useRouter();
  const initials = user.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" className="h-10 gap-2 px-2" aria-label="Account menu">
            <span className="grid size-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{initials}</span>
            <span className="hidden text-left leading-tight lg:block">
              <span className="block max-w-40 truncate text-sm font-medium">{user.name}</span>
              <span className="block max-w-40 truncate text-[11px] text-muted-foreground">{user.roleLabel}</span>
            </span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="truncate text-sm font-medium text-foreground">{user.name}</div>
            <div className="truncate text-xs font-normal">{user.email}</div>
            <div className="mt-1 text-xs font-normal">{user.roleLabel}{user.officeName ? ` · ${user.officeName}` : ""}</div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <ThemeMenuItems />
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/settings")}><Settings className="size-4" /> Settings & 2FA</DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await authClient.signOut();
            router.push("/login");
            router.refresh();
          }}
        >
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GlobalSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const el = document.getElementById("global-search");
      if (el && el.offsetParent !== null) { e.preventDefault(); el.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/records?q=${encodeURIComponent(q)}`);
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <label htmlFor="global-search" className="sr-only">Search all records</label>
      <Input
        id="global-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search records, full text, MC/Resolution no., names…"
        className="h-10 rounded-full bg-muted/60 pl-9"
      />
    </form>
  );
}

export function AppShell({ items, user, children }: { items: NavItem[]; user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const tabs = items.filter((i) => i.mobile).slice(0, 4);
  const moreActive = !tabs.some((t) => isActive(pathname, t.href));

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only z-50 rounded bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 overflow-y-auto bg-sidebar p-4 text-sidebar-foreground lg:flex">
        <Brand />
        <NavLinks items={items} />
        <div className="mt-auto rounded-lg bg-sidebar-accent/50 p-3 text-[11px] leading-relaxed opacity-90">
          One record · One standard · One system
          <div className="opacity-70">Easy to find · Easy to trust</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-backdrop-filter:bg-background/70 sm:px-4 lg:h-16 lg:px-6">
          <div className="lg:hidden">
            <Brand compact />
          </div>
          <GlobalSearch className="min-w-0 flex-1 lg:max-w-xl" />
          <div className="ml-auto flex items-center gap-1">
            <UserMenu user={user} />
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-3 pt-4 pb-24 sm:px-4 lg:px-8 lg:pt-6 lg:pb-10">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav aria-label="Primary" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur lg:hidden">
        <ul className="grid grid-cols-5">
          {tabs.map((t) => {
            const Icon = ICONS[t.icon] ?? FileSearch;
            const active = isActive(pathname, t.href);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]", active ? "font-medium text-primary" : "text-muted-foreground")}
                >
                  <Icon className="size-5" aria-hidden />
                  {t.label}
                </Link>
              </li>
            );
          })}
          {Array.from({ length: Math.max(0, 4 - tabs.length) }).map((_, i) => <li key={`pad${i}`} />)}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              className={cn("flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px]", moreActive ? "font-medium text-primary" : "text-muted-foreground")}
            >
              <MoreHorizontal className="size-5" aria-hidden />
              More
            </button>
          </li>
        </ul>
      </nav>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-4 text-sidebar-foreground">
          <SheetHeader className="p-0">
            <SheetTitle className="text-sidebar-foreground"><Brand /></SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto">
            <NavLinks items={items} onNavigate={() => setMoreOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
