import Link from "next/link";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/portal" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="" className="size-8 rounded-lg" />
            <span className="leading-tight"><span className="block text-sm font-semibold">CSC Records</span><span className="block text-xs text-muted-foreground">Public portal</span></span>
          </Link>
          <Link href="/login" className="text-sm text-primary hover:underline">Staff sign in</Link>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t py-5 text-center text-xs text-muted-foreground">Only records classified <b>Public</b> are shown. Personal information is masked per RA 10173. Prototype · SAMPLE data.</footer>
    </div>
  );
}
