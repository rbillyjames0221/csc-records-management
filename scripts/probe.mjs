// Dev helper: node scripts/probe.mjs <path> [email]  → prints page text (logged-in)
import { chromium } from "playwright";
const [, , path = "/dashboard", email = "admin@rms.local", width = "1440"] = process.argv;
const base = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: +width, height: 900 } });
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => m.type() === "error" && console.log("CONSOLE", m.text().slice(0, 300)));
if (email !== "-") {
  await page.goto(base + "/login");
  await page.fill("#email", email);
  await page.fill("#password", process.env.SEED_DEMO_PASSWORD || "ChangeMe!2026");
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => console.log("login did not redirect"));
}
await page.goto(base + path, { waitUntil: "networkidle" });
console.log("URL", page.url());
console.log((await page.locator("main, body").first().innerText()).slice(0, 3000));
await browser.close();
