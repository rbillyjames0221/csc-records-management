/* Seeds SAMPLE reference data + demo users + sample records. Usage: npm run db:seed  (add --reset to wipe first) */
import { config } from "dotenv";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { makeClient, type ScriptClient } from "./pg-client";
import { hashPassword } from "better-auth/crypto";
import { classifyDocument } from "../src/lib/ocr/text-quality";
import { CLASSIFICATIONS, OFFICES, PUBLIC_SAMPLES, RETENTION, SYNTHETIC, USERS } from "./seed-data";

config({ path: [".env.local", ".env"], quiet: true });

const PII_TYPES = ["saln", "service_card", "appointment", "oath_of_office", "assumption_certificate", "pds", "exam_masterlist", "copi"];
const PERSON_KEYS = ["declarant", "employee", "appointee", "affiant", "subject"];

const DB_URL = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "";
let db: ScriptClient;
let seq = 0;

function due(date: string, r: (typeof RETENTION)[number] | undefined) {
  if (!r || r.permanent) return null;
  const d = new Date(date + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + r.activeYears + r.inactiveYears);
  return d.toISOString().slice(0, 10);
}

async function insertRecord(o: {
  title: string; type: string; docNo?: string; cls: string; office: string; date: string; keywords: string[]; desc?: string;
  sens?: string; loc?: string; status: string; textLayer: string; sourceFormat: string; meta?: Record<string, string>;
  conf?: number | null; engine?: string | null; language?: string; createdBy: string;
}) {
  const c = CLASSIFICATIONS.find((x) => x.id === o.cls)!;
  const r = RETENTION.find((x) => x.id === c.ret);
  const pii = PII_TYPES.includes(o.type);
  const sens = o.sens ?? (pii ? "restricted" : c.sens ?? "internal");
  const subject = PERSON_KEYS.map((k) => o.meta?.[k]).find(Boolean) ?? null;
  seq++;
  const recordNo = `CSC-${o.date.slice(0, 4)}-${String(seq).padStart(6, "0")}`;
  const { rows } = await db.query(
    `INSERT INTO records (record_no, title, description, record_type, document_number, classification_id, office_id, date_created, date_received,
       retention_schedule_id, disposition_due, sensitivity, contains_pii, redaction_required, physical_location, keywords, subject_name, language,
       status, source_format, text_layer, ocr_engine, ocr_confidence, metadata, is_sample, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,true,$24,$24) RETURNING id`,
    [recordNo, o.title, o.desc ?? null, o.type, o.docNo ?? null, c.id, o.office, o.date, r?.id ?? null, due(o.date, r), sens, pii,
      pii && o.type === "copi", o.loc ?? null, o.keywords, subject, o.language ?? "eng", o.status, o.sourceFormat, o.textLayer, o.engine ?? null, o.conf ?? null,
      JSON.stringify({ ...(o.meta ?? {}), sample: "true" }), o.createdBy],
  );
  return rows[0].id as string;
}

async function insertPages(recordId: string, pages: { text: string; conf: number | null; engine: string; review?: boolean }[], fileId: string | null) {
  for (let i = 0; i < pages.length; i += 200) {
    const chunk = pages.slice(i, i + 200);
    const vals: unknown[] = [];
    const ph = chunk.map((p, j) => {
      const b = j * 7;
      vals.push(recordId, i + j + 1, fileId, p.text.replace(/\u0000/g, ""), p.conf, p.engine, !!p.review);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`;
    });
    await db.query(`INSERT INTO record_pages (record_id, page_no, file_id, text, confidence, ocr_engine, needs_review) VALUES ${ph.join(",")}`, vals);
  }
  await db.query(`UPDATE records SET page_count = $2 WHERE id = $1`, [recordId, pages.length]);
}

function scannedPages(file: string, n: number) {
  try {
    const out = execFileSync("pdfimages", ["-l", String(n), "-list", file]).toString().split("\n").slice(2);
    const s: boolean[] = [];
    for (const line of out) {
      const c = line.trim().split(/\s+/);
      if (c.length < 13) continue;
      if (+c[3] * +c[4] > 1_500_000 && +c[12] >= 100) s[+c[0] - 1] = true;
    }
    return s;
  } catch { return []; }
}

async function main() {
  const reset = process.argv.includes("--reset");
  db = await makeClient(DB_URL);
  await db.connect();
  if (reset) {
    if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) throw new Error("Refusing to reset in production");
    console.log("Resetting schema…");
    await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await db.end();
    execFileSync("npx", ["tsx", "scripts/migrate.ts"], { stdio: "inherit" });
    return main2();
  }
  return main2(true);
}

async function main2(connected = false) {
  if (!connected) { db = await makeClient(DB_URL); await db.connect(); }
  const { rows: existing } = await db.query("SELECT count(*)::int AS n FROM records");
  if (existing[0].n > 0) { console.log(`Database already has ${existing[0].n} records – skipping (use --reset).`); await db.end(); return; }

  for (const o of OFFICES) await db.query("INSERT INTO offices (id, code, name, type, region) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", [o.id, o.code, o.name, o.type, o.region]);
  for (const r of RETENTION) await db.query(
    "INSERT INTO retention_schedules (id, code, record_series, active_years, inactive_years, permanent, final_disposition, legal_basis) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING",
    [r.id, r.code, r.recordSeries, r.activeYears, r.inactiveYears, r.permanent, r.finalDisposition, r.legalBasis]);
  let order = 0;
  for (const c of CLASSIFICATIONS) await db.query(
    "INSERT INTO classifications (id, code, name, category, parent_id, description, default_retention_id, default_sensitivity, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING",
    [c.id, c.code, c.name, c.category, c.parentId ?? null, c.desc ?? null, c.ret ?? null, c.sens ?? "internal", order++]);

  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password || password.length < 10) throw new Error("Set SEED_DEMO_PASSWORD (≥10 chars) to seed demo users");
  const hash = await hashPassword(password);
  const ids: Record<string, string> = {};
  for (const u of USERS) {
    const id = randomUUID();
    ids[u.role] = id;
    await db.query(`INSERT INTO "user" (id, name, email, email_verified, role, office_id, position) VALUES ($1,$2,$3,true,$4,$5,$6)`, [id, u.name, u.email, u.role, u.officeId, u.position]);
    await db.query(`INSERT INTO account (id, account_id, provider_id, user_id, password) VALUES ($1,$2,'credential',$2,$3)`, [randomUUID(), id, hash]);
  }
  const by = ids.records_officer;

  // Real public CSC documents (optional)
  const dir = process.env.SAMPLES_DIR ? resolve(process.env.SAMPLES_DIR) : "";
  const storageRoot = resolve(process.env.STORAGE_LOCAL_DIR || "./storage");
  let real = 0;
  if (dir && existsSync(dir)) {
    if ((process.env.STORAGE_DRIVER || "local") !== "local") console.warn("SAMPLES_DIR seeding copies files with the local driver only – skipping file copy.");
    for (const [file, m] of Object.entries(PUBLIC_SAMPLES)) {
      const path = join(dir, file);
      if (!existsSync(path)) continue;
      const buf = readFileSync(path);
      const sha = createHash("sha256").update(buf).digest("hex");
      const txt = execFileSync("pdftotext", [path, "-"], { maxBuffer: 512 * 1024 * 1024 }).toString();
      const pages = txt.split("\f");
      if (pages.length > 1 && pages.at(-1)!.trim() === "") pages.pop();
      const verdict = classifyDocument(pages.slice(0, 30), scannedPages(path, 30)).verdict;
      const scanned = verdict !== "born_digital";
      const recordId = await insertRecord({
        title: m.title, type: m.type, docNo: m.docNo, cls: m.cls, office: "CO", date: m.date, keywords: m.keywords, desc: m.desc,
        status: verdict === "born_digital" ? "active" : "ocr_pending", textLayer: verdict, sourceFormat: scanned ? "paper_scan" : "born_digital",
        engine: verdict === "born_digital" ? "pdf-text-layer" : null, createdBy: by,
      });
      await db.query(`UPDATE records SET metadata = metadata || '{"source":"csc.gov.ph public download"}'::jsonb WHERE id = $1`, [recordId]);
      const key = `records/${recordId}/${sha.slice(0, 16)}.pdf`;
      mkdirSync(join(storageRoot, "records", recordId), { recursive: true });
      copyFileSync(path, join(storageRoot, key));
      const { rows } = await db.query(
        `INSERT INTO record_files (record_id, kind, storage_driver, storage_key, filename, mime_type, size_bytes, sha256, page_count, dpi, created_by)
         VALUES ($1,'original','local',$2,$3,'application/pdf',$4,$5,$6,$7,$8) RETURNING id`,
        [recordId, key, file, statSync(path).size, sha, pages.length, scanned ? 300 : null, by]);
      const fileId = rows[0].id;
      if (verdict === "born_digital") {
        await insertPages(recordId, pages.map((t) => ({ text: t, conf: null, engine: "pdf-text-layer" })), fileId);
        for (const k of ["image_quality", "metadata_complete", "naming_compliance", "dedup", "pii_review"]) await db.query("INSERT INTO qa_checks (record_id, check_key, passed, checked_by) VALUES ($1,$2,true,$3)", [recordId, k, by]);
      } else {
        if (verdict === "garbled" || verdict === "mixed") await insertPages(recordId, pages.map((t) => ({ text: t, conf: 40, engine: "legacy-ocr-layer", review: false })), fileId);
        else await db.query("UPDATE records SET page_count = $2 WHERE id = $1", [recordId, pages.length]);
        await db.query(`INSERT INTO ingest_jobs (record_id, file_id, mode, priority) VALUES ($1,$2,$3,$4)`, [recordId, fileId, verdict === "image_only" ? "ocr" : "redo_ocr", pages.length > 20 ? 7 : 5]);
      }
      real++;
      console.log(`  • ${file} → ${verdict} (${pages.length} pages)`);
    }
  }

  // Synthetic SAMPLE records
  const syntheticIds: string[] = [];
  for (const s of SYNTHETIC) {
    const isScan = s.textLayer === "image_only";
    const status = s.status ?? "active";
    const id = await insertRecord({
      title: s.title, type: s.type, docNo: s.docNo, cls: s.cls, office: s.office, date: s.date, keywords: s.keywords, sens: s.sens, loc: s.loc,
      status, textLayer: s.textLayer ?? "born_digital", sourceFormat: isScan ? "paper_scan" : "born_digital", meta: s.meta, conf: s.conf ?? null,
      engine: isScan ? "ocrmypdf-tesseract (eng+fil)" : "pdf-text-layer", language: s.language, createdBy: by,
    });
    syntheticIds.push(id);
    await insertPages(id, s.pages.map((t, i) => ({ text: t, conf: isScan ? (s.review?.includes(i + 1) ? Math.min(s.conf ?? 60, 72) : s.conf ?? 90) : null, engine: isScan ? "ocrmypdf-tesseract" : "pdf-text-layer", review: s.review?.includes(i + 1) })), null);
    const allPass = status === "active";
    for (const k of ["image_quality", "metadata_complete", "naming_compliance", "dedup", "pii_review"]) await db.query("INSERT INTO qa_checks (record_id, check_key, passed, checked_by) VALUES ($1,$2,$3,$4)", [id, k, allPass || k !== "image_quality", by]);
  }
  // Relations: oath + assumption relate to appointment; RA 6713 ↔ SALN FAQ
  const byDoc = async (d: string) => (await db.query("SELECT id FROM records WHERE document_number = $1", [d])).rows[0]?.id as string | undefined;
  const pairs: [string, string, string][] = [
    ["OATH-2022-NCR-0451 (SAMPLE)", "APPT-2022-NCR-0451 (SAMPLE)", "attachment"],
    ["CAD-2022-NCR-0451 (SAMPLE)", "APPT-2022-NCR-0451 (SAMPLE)", "attachment"],
    ["SALN FAQs", "Republic Act No. 6713", "implements"],
  ];
  for (const [a, b, rel] of pairs) {
    const [x, y] = [await byDoc(a), await byDoc(b)];
    if (x && y) await db.query("INSERT INTO record_relations (record_id, related_id, relation) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [x, y, rel]);
  }
  // A pending disposition request (OM 2014 is past its SAMPLE retention)
  const om = await byDoc("OM No. 03, s. 2014 (SAMPLE)");
  if (om) await db.query("INSERT INTO disposition_requests (record_id, action, reason, requested_by) VALUES ($1,'destroy','Retention period (5+5 yrs, SAMPLE RS-OM) lapsed; no legal hold; no pending case.',$2)", [om, by]);
  // Some audit history
  for (const [role, action, idx] of [["admin", "auth.login", -1], ["records_officer", "record.create", 0], ["employee", "record.view", 0], ["official", "record.view", 10], ["official", "file.download", 10], ["regional", "search", -1]] as const) {
    await db.query("INSERT INTO audit_events (actor_id, actor_label, actor_role, action, entity_type, entity_id, ip, details) VALUES ($1,$2,$3,$4,$5,$6,'127.0.0.1',$7)",
      [ids[role], USERS.find((u) => u.role === role)!.email, role, action, idx >= 0 ? "record" : null, idx >= 0 ? syntheticIds[idx] : null, JSON.stringify({ seeded: true })]);
  }
  await db.query(`SELECT setval('record_no_seq', $1)`, [seq + 1]);
  await db.query("ANALYZE");
  console.log(`Seeded ${OFFICES.length} offices, ${CLASSIFICATIONS.length} classifications, ${RETENTION.length} retention schedules, ${USERS.length} demo users, ${real} public CSC documents, ${SYNTHETIC.length} synthetic SAMPLE records.`);
  console.log(`Demo logins: ${USERS.map((u) => u.email).join(", ")} (password from SEED_DEMO_PASSWORD)`);
  await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
