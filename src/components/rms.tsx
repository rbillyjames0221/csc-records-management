import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock, ShieldAlert, Eye, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { HL_END, HL_START } from "@/lib/search-markers";
import { SENSITIVITY_LABELS, STATUS_LABELS, TEXT_LAYER_LABELS } from "@/lib/constants";

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between lg:mb-6">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium tracking-wider text-primary uppercase">{eyebrow}</div>}
        <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const SENS_STYLE: Record<string, string> = {
  public: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  internal: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  confidential: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  restricted: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};
const SENS_ICON = { public: Globe, internal: Eye, confidential: ShieldAlert, restricted: Lock } as const;

export function SensitivityBadge({ value, short = false }: { value: string; short?: boolean }) {
  const Icon = SENS_ICON[value as keyof typeof SENS_ICON] ?? Eye;
  const label = SENSITIVITY_LABELS[value as keyof typeof SENSITIVITY_LABELS] ?? value;
  return (
    <Badge variant="outline" className={cn("gap-1 border-transparent", SENS_STYLE[value])}>
      <Icon className="size-3" aria-hidden />
      {short ? label.split(" ")[0] : label}
    </Badge>
  );
}

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  qa_review: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  ocr_pending: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  draft: "bg-muted text-muted-foreground",
  on_hold: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  disposed: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  transferred: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
};
export function StatusBadge({ value }: { value: string }) {
  return <Badge variant="outline" className={cn("border-transparent", STATUS_STYLE[value])}>{STATUS_LABELS[value as keyof typeof STATUS_LABELS] ?? value}</Badge>;
}
export function TextLayerBadge({ value }: { value: string }) {
  const tone = value === "born_digital" ? "text-emerald-700 dark:text-emerald-400" : value === "image_only" ? "text-violet-700 dark:text-violet-400" : value === "garbled" ? "text-rose-700 dark:text-rose-400" : "text-muted-foreground";
  return <Badge variant="outline" className={tone}>{TEXT_LAYER_LABELS[value as keyof typeof TEXT_LAYER_LABELS] ?? value}</Badge>;
}

/** Renders ts_headline output safely: markers → <mark>, everything else as text (no HTML injection). */
export function Highlighted({ text, className }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = [];
  let rest = text;
  let i = 0;
  while (rest.length) {
    const s = rest.indexOf(HL_START);
    if (s < 0) { parts.push(rest); break; }
    const e = rest.indexOf(HL_END, s);
    if (e < 0) { parts.push(rest.replaceAll(HL_START, "")); break; }
    parts.push(rest.slice(0, s));
    parts.push(<mark key={i++}>{rest.slice(s + 1, e)}</mark>);
    rest = rest.slice(e + 1);
  }
  return <span className={className}>{parts}</span>;
}

export function EmptyState({ icon: Icon, title, children }: { icon?: React.ComponentType<{ className?: string }>; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center">
      {Icon && <Icon className="mb-3 size-8 text-muted-foreground" />}
      <div className="font-medium">{title}</div>
      {children && <div className="mt-1 max-w-md text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const btn = "inline-flex h-10 items-center gap-1 rounded-lg border px-3 text-sm hover:bg-muted aria-disabled:pointer-events-none aria-disabled:opacity-40";
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-2">
      <Link className={btn} aria-disabled={page <= 1} href={hrefFor(page - 1)}><ChevronLeft className="size-4" /> Previous</Link>
      <span className="text-sm text-muted-foreground">Page {page} of {pages}</span>
      <Link className={btn} aria-disabled={page >= pages} href={hrefFor(page + 1)}>Next <ChevronRight className="size-4" /></Link>
    </nav>
  );
}

export function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(7rem,38%)_1fr] gap-2 border-b py-2 text-sm last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children ?? "—"}</dd>
    </div>
  );
}

export function SampleBadge() {
  return <Badge variant="outline" className="border-gold/60 text-[10px] text-gold-foreground dark:text-gold">SAMPLE</Badge>;
}
