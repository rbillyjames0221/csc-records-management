import "server-only";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { classifications, offices, retentionSchedules } from "@/db/schema";

export async function getLookups() {
  const [o, c, r] = await Promise.all([
    db.select().from(offices).orderBy(asc(offices.type), asc(offices.name)),
    db.select().from(classifications).orderBy(asc(classifications.sortOrder)),
    db.select().from(retentionSchedules).orderBy(asc(retentionSchedules.code)),
  ]);
  return { offices: o, classifications: c, retention: r };
}
