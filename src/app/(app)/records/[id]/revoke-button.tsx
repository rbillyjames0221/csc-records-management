"use client";
import { Button } from "@/components/ui/button";
import { revokeShareLinkAction } from "../actions";

export function RevokeButton({ recordId, linkId }: { recordId: string; linkId: string }) {
  return <Button size="xs" variant="destructive" onClick={() => revokeShareLinkAction(recordId, linkId)}>Revoke</Button>;
}
