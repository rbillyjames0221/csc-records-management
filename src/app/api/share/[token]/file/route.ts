import { resolveShare, shareFile } from "@/lib/share";
import { streamFile } from "@/lib/file-delivery";
import { writeAudit } from "@/lib/audit";
import { json, notFoundJson } from "@/lib/api-auth";

export async function GET(req: Request, ctx: RouteContext<"/api/share/[token]/file">) {
  const { token } = await ctx.params;
  const link = await resolveShare(token, false);
  if (!link) return notFoundJson();
  const download = new URL(req.url).searchParams.get("download") === "1";
  if (download && !link.allow_download) return json({ error: "download_not_allowed" }, 403);
  const f = await shareFile(link.record_id);
  if (!f) return notFoundJson();
  const out = await streamFile(f.id, { download });
  if (!out) return notFoundJson();
  if (download) await writeAudit({ actorId: null, actorLabel: "Share link visitor", actorRole: "public", action: "share.download", entityType: "record", entityId: link.record_id, ip: req.headers.get("x-forwarded-for")?.split(",")[0] ?? null, details: { linkId: link.id } });
  return out.response;
}
