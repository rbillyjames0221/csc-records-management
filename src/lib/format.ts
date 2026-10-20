const TZ = "Asia/Manila";
export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d.length === 10 ? d + "T00:00:00+08:00" : d) : d;
  return new Intl.DateTimeFormat("en-PH", { timeZone: TZ, year: "numeric", month: "short", day: "numeric" }).format(date);
}
export function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-PH", { timeZone: TZ, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date) + " PHT";
}
export function fmtBytes(n: number | null | undefined) {
  if (n == null) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}
export const fmtNum = (n: number) => new Intl.NumberFormat("en-PH").format(n);
