"use client";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-[60dvh] place-items-center p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{error.message.startsWith("Forbidden") ? error.message : "An unexpected error occurred. The incident has been logged."}{error.digest ? ` (ref ${error.digest})` : ""}</p>
        <Button className="mt-5" onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}
