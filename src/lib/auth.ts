import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";
import { createAuthMiddleware } from "better-auth/api";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { writeAudit } from "@/lib/audit";

export const auth = betterAuth({
  appName: "CSC Records Management System",
  // AUTH_SECRET (Vercel) or BETTER_AUTH_SECRET – both accepted.
  secret: process.env.AUTH_SECRET || process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined),
  trustedOrigins: [
    process.env.BETTER_AUTH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
    process.env.VERCEL_BRANCH_URL && `https://${process.env.VERCEL_BRANCH_URL}`,
  ].filter((v): v is string => !!v),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      twoFactor: schema.twoFactor,
    },
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true, // accounts are provisioned by administrators only
    minPasswordLength: 10,
  },
  user: {
    additionalFields: {
      role: { type: "string", input: false, defaultValue: "employee" },
      officeId: { type: "string", required: false, input: false },
      position: { type: "string", required: false, input: false },
      active: { type: "boolean", input: false, defaultValue: true },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: { "/sign-in/email": { window: 60, max: 5 }, "/two-factor/*": { window: 60, max: 5 } },
  },
  advanced: { database: { generateId: () => crypto.randomUUID() } },
  databaseHooks: {
    session: {
      create: {
        before: async (s) => {
          const [u] = await db.select({ active: schema.user.active }).from(schema.user).where(eq(schema.user.id, s.userId));
          if (!u?.active) return false; // disabled accounts cannot sign in
          return { data: s };
        },
      },
    },
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-in/email" || ctx.path.startsWith("/two-factor/verify")) {
        const s = ctx.context.newSession;
        const ip = ctx.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
        const ua = ctx.headers?.get("user-agent") ?? null;
        if (s) {
          await writeAudit({ actorId: s.user.id, actorLabel: s.user.email, actorRole: (s.user as { role?: string }).role ?? null, action: "auth.login", entityType: "user", entityId: s.user.id, ip, userAgent: ua });
        } else if (ctx.path === "/sign-in/email") {
          const email = (ctx.body as { email?: string } | undefined)?.email ?? null;
          await writeAudit({ actorLabel: email, action: "auth.login_failed_or_2fa", entityType: "user", ip, userAgent: ua });
        }
      }
    }),
  },
  plugins: [twoFactor({ issuer: "CSC RMS" }), nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
