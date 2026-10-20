import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <FileQuestion className="mx-auto mb-4 size-10 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold">Not found</h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">The page or record does not exist, or your role does not have access to it.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href="/dashboard" className={buttonVariants()}>Dashboard</Link>
          <Link href="/portal" className={buttonVariants({ variant: "outline" })}>Public portal</Link>
        </div>
      </div>
    </main>
  );
}
