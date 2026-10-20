import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";

export async function GET() {
  await connection();
  const t0 = performance.now();
  try {
    await db.execute(sql`SELECT 1`);
    return Response.json({ ok: true, db: "up", dbMs: Math.round(performance.now() - t0) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503 });
  }
}
