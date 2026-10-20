// Captures UI screenshots at mobile (390×844) and desktop (1440×900) widths into docs/screenshots/.
// Usage: BASE_URL=http://localhost:3000 SEED_DEMO_PASSWORD=… node scripts/screenshots.mjs
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://localhost:3000";
const out = "docs/screenshots";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

let storageState = null; // sign in once and reuse the session (sign-in is rate limited to 5/min)
async function login(page, email) {
  if (storageState) { await page.context().addCookies(storageState.cookies); return; }
  await page.goto(base + "/login");
  await page.fill("#email", email);
  await page.fill("#password", process.env.SEED_DEMO_PASSWORD || "ChangeMe!2026");
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  storageState = await page.context().storageState();
}

async function firstHref(page, path, selector) {
  await page.goto(base + path, { waitUntil: "networkidle" });
  const loc = page.locator(selector);
  return (await loc.count()) ? loc.first().getAttribute("href") : null;
}

const VIEWPORTS = { mobile: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } };

for (const [vp, size] of Object.entries(VIEWPORTS)) {
  for (const scheme of vp === "desktop" ? ["light", "dark"] : ["light"]) {
    const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: vp === "mobile" ? 2 : 1, colorScheme: scheme });
    const page = await ctx.newPage();
    const shot = async (name, opts = {}) => {
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(600);
      const file = `${out}/${vp}-${scheme === "dark" ? "dark-" : ""}${name}.png`;
      await page.screenshot({ path: file, fullPage: opts.fullPage ?? false });
      console.log("saved", file);
    };
    if (scheme === "dark") {
      await login(page, "admin@rms.local");
      await page.goto(base + "/records?q=wellness+leave"); await shot("search");
      await page.goto(base + "/dashboard"); await shot("dashboard");
      await ctx.close();
      continue;
    }
    await page.goto(base + "/"); await shot("landing");
    await page.goto(base + "/portal?q=leave"); await shot("portal");
    await page.goto(base + "/login"); await shot("login");
    await login(page, "admin@rms.local");
    await page.goto(base + "/dashboard"); await shot("dashboard", { fullPage: vp === "desktop" });
    await page.goto(base + "/records?q=wellness+leave"); await shot("search-highlight");
    const rec = await firstHref(page, "/records?q=wellness+leave", "main a[href^='/records/']");
    if (rec) { await page.goto(base + rec); await page.waitForSelector("canvas", { timeout: 15000 }).catch(() => {}); await shot("record-detail"); }
    await page.goto(base + "/intake"); await shot("intake");
    await page.goto(base + "/qa"); await shot("qa-queue");
    // Prefer a scanned public issuance so the side-by-side view shows a real page image.
    const qa = (await firstHref(page, "/qa", "main a[href^='/qa/']:has-text('Memorandum Circular No. 11')")) ?? (await firstHref(page, "/qa", "main a[href^='/qa/']"));
    if (qa) { await page.goto(base + qa); await page.waitForSelector("canvas", { timeout: 15000 }).catch(() => {}); await shot("qa-review"); }
    await page.goto(base + "/file-plan"); await shot("file-plan");
    await page.goto(base + "/retention"); await shot("retention");
    await page.goto(base + "/users"); await shot("users");
    await page.goto(base + "/audit"); await shot("audit");
    await page.goto(base + "/integrations"); await shot("integrations");
    await page.goto(base + "/help"); await shot("help");
    await page.goto(base + "/settings"); await shot("settings");
    if (vp === "mobile") {
      await page.goto(base + "/dashboard");
      await page.getByRole("button", { name: /more/i }).last().click().catch(() => {});
      await shot("more-menu");
    }
    await ctx.close();
  }
}
await browser.close();
