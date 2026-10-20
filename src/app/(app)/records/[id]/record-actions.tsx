"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Archive, Copy, Download, Pencil, Printer, RefreshCw, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { createShareLinkAction, logPrintAction, reOcrAction, requestDispositionAction, type ActionState } from "../actions";

type Props = {
  id: string; fileId: string | null; canDownload: boolean; canEdit: boolean; canShare: boolean; canDispose: boolean; canReOcr: boolean; redaction: boolean;
};

export function RecordActions(p: Props) {
  const [share, shareAction, sharing] = useActionState<ActionState, FormData>(createShareLinkAction.bind(null, p.id), null);
  const [disp, dispAction, disposing] = useActionState<ActionState, FormData>(requestDispositionAction.bind(null, p.id), null);
  const [busy, setBusy] = useState(false);
  const fileUrl = p.fileId ? `/api/files/${p.fileId}` : null;
  const fullShareUrl = share?.url && typeof window !== "undefined" ? `${window.location.origin}${share.url}` : share?.url;

  return (
    <div className="flex flex-wrap gap-2">
      {fileUrl && p.canDownload && <a href={`${fileUrl}?download=1`} className={buttonVariants({ variant: "outline" })}><Download className="size-4" /> Download</a>}
      {fileUrl && p.canDownload && (
        <Button variant="outline" onClick={async () => { await logPrintAction(p.id); window.open(fileUrl, "_blank", "noopener"); }}>
          <Printer className="size-4" /> Print
        </Button>
      )}
      {fileUrl && !p.canDownload && p.redaction && <span className="self-center text-xs text-muted-foreground">Original withheld pending redaction</span>}
      {p.canShare && (
        <Dialog>
          <DialogTrigger render={<Button variant="outline"><Share2 className="size-4" /> Share</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Controlled share link</DialogTitle>
              <DialogDescription>Creates a view-only link that expires. Every access is logged. Revoke any time.</DialogDescription>
            </DialogHeader>
            {share?.url ? (
              <div className="grid gap-2">
                <Label htmlFor="share-url">Share URL (shown once)</Label>
                <div className="flex gap-2">
                  <Input id="share-url" readOnly value={fullShareUrl} className="h-10 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                  <Button variant="outline" size="icon-lg" aria-label="Copy link" onClick={() => { navigator.clipboard.writeText(fullShareUrl!); toast.success("Link copied"); }}><Copy /></Button>
                </div>
                <p className="text-xs text-muted-foreground">{share.message}</p>
              </div>
            ) : (
              <form action={shareAction} className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5"><Label htmlFor="hours">Expires after</Label>
                    <NativeSelect id="hours" name="hours" defaultValue="72"><option value="1">1 hour</option><option value="24">24 hours</option><option value="72">3 days</option><option value="168">7 days</option><option value="720">30 days</option></NativeSelect></div>
                  <div className="grid gap-1.5"><Label htmlFor="maxUses">Max uses</Label><Input id="maxUses" name="maxUses" type="number" min={1} max={1000} placeholder="Unlimited" className="h-10" /></div>
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allowDownload" className="size-4 accent-primary" disabled={p.redaction} /> Allow download {p.redaction && "(blocked: redaction required)"}</label>
                <div className="grid gap-1.5"><Label htmlFor="note">Purpose / recipient</Label><Input id="note" name="note" placeholder="e.g. COA auditor request ref. 2026-114" className="h-10" /></div>
                {share?.error && <p className="text-sm text-destructive">{share.error}</p>}
                <DialogFooter><Button type="submit" disabled={sharing}>Create link</Button></DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      )}
      {p.canEdit && <Link href={`/records/${p.id}/edit`} className={buttonVariants({ variant: "outline" })}><Pencil className="size-4" /> Edit metadata</Link>}
      {p.canReOcr && p.fileId && (
        <Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { await reOcrAction(p.id); toast.success("Queued for OCR worker"); } catch (e) { toast.error((e as Error).message); } setBusy(false); }}>
          <RefreshCw className="size-4" /> Re-OCR
        </Button>
      )}
      {p.canDispose && (
        <Dialog>
          <DialogTrigger render={<Button variant="outline"><Archive className="size-4" /> Disposition</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request disposition</DialogTitle>
              <DialogDescription>Requires approval by a CSC Official. Destroy/transfer must cite the NAP authority on approval.</DialogDescription>
            </DialogHeader>
            {disp?.ok ? <p className="text-sm">{disp.message}</p> : (
              <form action={dispAction} className="grid gap-3">
                <div className="grid gap-1.5"><Label htmlFor="d-action">Action</Label>
                  <NativeSelect id="d-action" name="action" defaultValue="destroy"><option value="keep">Keep (extend / permanent)</option><option value="transfer">Transfer to archives (NAP)</option><option value="destroy">Destroy</option></NativeSelect></div>
                <div className="grid gap-1.5"><Label htmlFor="d-reason">Justification</Label><Textarea id="d-reason" name="reason" required minLength={10} placeholder="Retention period lapsed per RDS item …; no pending case or audit." /></div>
                {disp?.error && <p className="text-sm text-destructive">{disp.error}</p>}
                <DialogFooter><Button type="submit" disabled={disposing}>Submit request</Button></DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
