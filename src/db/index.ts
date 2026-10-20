import "server-only";
import { Pool, types } from "pg";

// Return DATE columns as "YYYY-MM-DD" strings (avoid timezone shifts).
types.setTypeParser(1082, (v) => v);
import { drizzle } from "drizzle-orm/node-postgres";
import { attachDatabasePool } from "@vercel/functions";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __rmsPool?: Pool };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and configure PostgreSQL.");
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 10_000,
    ssl: /sslmode=require|neon\.tech/.test(url) ? { rejectUnauthorized: true } : undefined,
  });
  // On Vercel Fluid compute, release idle clients before the instance is suspended.
  if (process.env.VERCEL) attachDatabasePool(pool);
  return pool;
}

export const pool = globalForDb.__rmsPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.__rmsPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
