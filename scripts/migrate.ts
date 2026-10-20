/* Applies db/migrations/*.sql in order, once each, inside a transaction. */
import { config } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL (or DATABASE_URL_UNPOOLED) is required");
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS _rms_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const dir = join(process.cwd(), "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await client.query<{ name: string }>("SELECT name FROM _rms_migrations");
  const applied = new Set(rows.map((r) => r.name));
  for (const f of files) {
    if (applied.has(f)) continue;
    process.stdout.write(`→ applying ${f} … `);
    try {
      await client.query("BEGIN");
      await client.query(readFileSync(join(dir, f), "utf8"));
      await client.query("INSERT INTO _rms_migrations(name) VALUES ($1)", [f]);
      await client.query("COMMIT");
      console.log("ok");
    } catch (e) {
      await client.query("ROLLBACK");
      console.log("FAILED");
      throw e;
    }
  }
  console.log(`migrations up to date (${files.length} files)`);
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
