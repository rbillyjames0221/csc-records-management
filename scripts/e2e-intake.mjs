// UI end-to-end test of the intake wizard: duplicate detection + upload of a fresh copy of a sample PDF,
// then confirms the new record is searchable with highlights. Usage:
//   SAMPLE_PDF=/path/to/file.pdf BASE_URL=http://localhost:3000 node scripts/e2e-intake.mjs
import { copyFileSync, appendFileSync, mkdirSync } from "node:fs";
import { basename } from "node:path";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://localhost:3000";
const sample = process.env.SAMPLE_PDF;
if (!sample) throw new Error("Set SAMPLE_PDF");
mkdirSync("/tmp/rms-e2e", { recursive: true });
const fresh = `/tmp/rms-e2e/CO_MC_2026_E2E-${Date.now()}.pdf`;
copyFileSync(sample, fresh);
appendFileSync(fresh, `\n%rms-e2e ${Date.now()}\n`); // new SHA-256, same content

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto(base + "/login");
await page.fill("#email", "records@rms.local");
await page.fill("#password", process.env.SEED_DEMO_PASSWORD || "ChangeMe!2026");
await page.click("button[type=submit]");
await page.waitForURL((u) => !u.pathname.startsWith("/login"));

await page.goto(base + "/intake", { waitUntil: "networkidle" });
await page.locator('input[type=file][aria-label="Choose files"]').setInputFiles([sample, fresh]);
await page.getByText("Duplicate of").first().waitFor({ timeout: 30000 });
console.log("PASS  duplicate detected for", basename(sample));
await page.screenshot({ path: "/tmp/rms-e2e/1-files.png", fullPage: true });
await page.getByRole("button", { name: `Remove ${basename(sample)}` }).click();
await page.getByRole("button", { name: "Continue to metadata" }).click();

const title = page.locator('input[name="title"]').first();
if (!(await title.inputValue())) await title.fill("SAMPLE E2E intake – Wellness Leave circular copy");
else await title.fill("SAMPLE E2E " + (await title.inputValue()));
const sel = async (name, value) => { const s = page.locator(`select[name="${name}"]`).first(); if (!(await s.inputValue())) await s.selectOption(value); };
await sel("recordType", "memorandum_circular");
await sel("classificationId", "LEG-MC");
await sel("officeId", "CO");
await page.screenshot({ path: "/tmp/rms-e2e/2-metadata.png", fullPage: true });
await page.getByRole("button", { name: "Continue to OCR & QA" }).click();
await page.screenshot({ path: "/tmp/rms-e2e/3-ocr.png", fullPage: true });
await page.getByRole("button", { name: "Review & submit" }).click();
await page.getByRole("button", { name: /Submit 1 record/ }).click();
await page.getByRole("button", { name: "Start new intake" }).waitFor({ timeout: 60000 });
await page.screenshot({ path: "/tmp/rms-e2e/4-done.png", fullPage: true });
const link = await page.locator("main a[href^='/records/']").last().getAttribute("href");
console.log("PASS  record created via wizard:", link);

await page.goto(base + "/records?q=" + encodeURIComponent('"wellness leave" E2E'), { waitUntil: "networkidle" });
const marks = await page.locator("main mark").count();
const found = await page.locator(`main a[href^='${link}']`).count();
console.log(found ? "PASS" : "FAIL", " new record found by full-text search;", marks, "highlight <mark> elements");
await page.screenshot({ path: "/tmp/rms-e2e/5-search.png" });
await browser.close();
