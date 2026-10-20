"use client";
import dynamic from "next/dynamic";

const PdfViewer = dynamic(() => import("@/components/viewer/pdf-viewer").then((m) => m.PdfViewer), { ssr: false, loading: () => <div className="h-96 animate-pulse rounded-lg bg-muted" /> });

export function FileViewer({ fileId, mime, initialPage, filename, src }: { fileId: string; mime: string; initialPage?: number; filename: string; src?: string }) {
  const url = src ?? `/api/files/${fileId}`;
  if (mime === "application/pdf") return <PdfViewer url={url} initialPage={initialPage} />;
  if (mime.startsWith("image/") && mime !== "image/tiff")
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={`Scan: ${filename}`} className="max-h-[75vh] w-full rounded-lg border bg-white object-contain" />;
  return <div className="rounded-lg border p-6 text-sm text-muted-foreground">Preview not available for {mime}. Use Download (TIFF masters are previewed via their PDF/A access copy).</div>;
}
