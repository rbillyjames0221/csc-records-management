import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
config({ path: [".env.local", ".env"], quiet: true });

// Used for `npm run db:studio` / `drizzle-kit pull` only. Migrations are plain SQL in db/migrations.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL! },
});
