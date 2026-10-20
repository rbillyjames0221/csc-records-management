# CSC Records Management System (RMS)

A records digitization and management system for the Civil Service Commission. It follows the plan
**Collect → Prepare → Scan → OCR → Index → QA → Store → Deliver**, with a file plan, retention and
disposition, role-based access, an audit trail and an integration API. It runs on **free and open-source OCR**.

> Prototype. All demo data is **SAMPLE** data: synthetic records with fictitious names, plus (locally only)
> public documents from csc.gov.ph. No real personal data is included.

The full research and design is in **[docs/PLAN.md](docs/PLAN.md)**.

## Features

| Area | What you get |
| --- | --- |
| Responsive UI | Next.js 16 App Router, Tailwind v4, shadcn/ui. Desktop sidebar and mobile bottom tab bar. Dark/light themes, PWA manifest, keyboard and screen-reader friendly. |
| Search | PostgreSQL full-text search over metadata and **per-page OCR text** (English + simple config for Filipino), `websearch` syntax (`"phrase"`, `-not`, `or`), trigram fuzzy matching on titles, names and MC/Resolution numbers, highlighted snippets with the page number. |
| Intake wizard | Drag-and-drop, SHA-256 duplicate check, **text-layer detection** (born-digital / image-only / garbled 1990s OCR), metadata with file-plan defaults, naming-convention check, QA checklist. OCR runs either in the browser (tesseract.js) or through the server queue. |
| OCR | Born-digital PDFs are indexed straight from the text layer. Scans go to **tesseract.js** (eng+fil) in the browser, or to the **on-prem Python worker** (`worker/`: Tesseract 5 + OCRmyPDF PDF/A, with an optional PaddleOCR second pass). |
| QA | Review queue of low-confidence pages. Side-by-side scanned page and editable text, then checklist approval. |
| Governance | File plan (6 categories, 23 SAMPLE series), retention schedules, a disposition workflow with segregation of duties and a NAP authority reference, legal hold, and tombstones. |
| Security | Better Auth (scrypt hashes, DB sessions, rate limiting, TOTP 2FA, no self sign-up). RBAC across 6 roles, access levels, office scope, PII masking, an append-only audit log (DB triggers), expiring share links and API keys stored as hashes. |
| Delivery | Public portal (public records only), expiring and revocable share links, audited view, download and print. |
| Integration | REST API (`/api/v1/*`), OpenAPI 3.1 at `/api/v1/openapi`, CSV import and export, worker queue API. |

## Stack

* **Next.js 16** (App Router, Cache Components, `proxy.ts`) and **React 19**, TypeScript, Tailwind v4, shadcn/ui (Base UI)
* **PostgreSQL 15+**, using `pg_trgm`, `unaccent` and `pgcrypto`. Drizzle ORM plus plain-SQL migrations (`db/migrations`).
  * `record_pages` is hash-partitioned ×16 with a generated `tsvector` and a GIN index per partition.
  * The job queue uses `FOR UPDATE SKIP LOCKED`.
  * The audit table is BRIN-indexed and append-only.
* **Better Auth** for credentials, 2FA and SSO-ready auth. **Vercel Blob (private)** or local disk for files.
* **pdf.js** viewer and **tesseract.js 7** for in-browser OCR. The on-prem worker uses **Tesseract 5 + OCRmyPDF**.

## Quick start (local)

```bash
# Postgres 15+ with a database and user, e.g.
createdb csc_rms
cp .env.example .env.local      # set DATABASE_URL, AUTH_SECRET (openssl rand -base64 32), WORKER_TOKEN
npm install
npm run db:migrate
SAMPLES_DIR=/path/to/csc_pdfs npm run db:seed   # SAMPLES_DIR optional; omit for synthetic data only
NEXT_PUBLIC_DEMO_MODE=1 npm run dev
```

Demo accounts (password = `SEED_DEMO_PASSWORD`):

| Account | Role | Can do |
| --- | --- | --- |
| `admin@rms.local` | Administrator | Everything |
| `official@rms.local` | Official | Read all records, approve disposition, audit log |
| `records@rms.local` | Records officer | Intake, QA, file plan, retention, share |
| `employee@rms.local` | Employee | Public and internal records only |
| `ncr@rms.local` | Regional (NCR) | Own office's records |
| `public@rms.local` | Public | Portal only |

Scripts:
* `npm run lint`, `npm run typecheck`, `npm run build`
* `npm run db:reset`: drops the **public schema of the configured DB**, then migrates and seeds
* `npm run screenshots`: Playwright screenshots at 390 px and 1440 px

## Deploy to Vercel

1. Import the GitHub repo into Vercel (framework: Next.js). Functions region: **sin1** (`vercel.json`).
2. Add a Postgres database. **Neon** via the Vercel Marketplace (Singapore) injects `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
3. Create a **private Blob store**, which injects `BLOB_READ_WRITE_TOKEN`.
4. Set the environment variables:

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Pooled connection string, used at runtime |
| `DATABASE_URL_UNPOOLED` | recommended | Direct connection, used for migrations and bulk loads |
| `AUTH_SECRET` | yes | ≥ 32 random bytes |
| `STORAGE_DRIVER` | yes | Set to `blob` on Vercel (the local disk is ephemeral) |
| `BLOB_READ_WRITE_TOKEN` | yes (blob) | From the private Blob store |
| `WORKER_TOKEN` | for OCR worker | Shared secret, `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | optional | Defaults to the production domain (`VERCEL_PROJECT_PRODUCTION_URL`) |
| `OCR_REVIEW_THRESHOLD` | optional | Default 80 |
| `REQUIRE_2FA_ROLES` | optional | e.g. `admin,official,records_officer` |
| `NEXT_PUBLIC_DEMO_MODE` | optional | `1` shows demo-account hints on the login page |

5. Run the migrations once against the database. They are idempotent and tracked in `_rms_migrations`:
   ```bash
   DATABASE_URL_UNPOOLED="postgres://…" npm run db:migrate
   DATABASE_URL_UNPOOLED="postgres://…" SEED_DEMO_PASSWORD='…' npm run db:seed   # optional SAMPLE data
   ```
6. Deploy. The build is a standard `next build`. `prebuild` copies the pdf.js and tesseract.js assets into `public/vendor`.

Data residency: RA 10173 personnel data (201 files, SALN, cases) should live on CSC-controlled
infrastructure. The same app runs on-prem with Docker and self-hosted PostgreSQL 17, using `STORAGE_DRIVER=local` on a NAS.
Use the cloud deployment for public issuances and pilots. See PLAN §5.

## OCR worker

See [worker/README.md](worker/README.md). It is pull-based, so it needs only outbound HTTPS from inside the CSC network:

```bash
cd worker && docker build -t rms-ocr-worker . && docker run -e RMS_URL=https://<app> -e WORKER_TOKEN=… rms-ocr-worker
```

## API

* Authentication: a session cookie, or `Authorization: Bearer rms_…` with an API key created by an admin in **Integrations**.
* Spec: `GET /api/v1/openapi`

```bash
curl -H "Authorization: Bearer $KEY" "$APP/api/v1/records?q=wellness%20leave&type=memorandum_circular"
curl -H "Authorization: Bearer $KEY" -o records.csv "$APP/api/v1/export?dataset=records"
curl -H "Authorization: Bearer $KEY" -H "Content-Type: text/csv" --data-binary @legacy.csv "$APP/api/v1/import?dryRun=1"
```

## Bulk loading legacy text (millions of pages)

For large back-catalogues, skip the API and load page text with `COPY` over the direct connection:

```sql
-- staging file: record_id, page_no, text, confidence, ocr_engine
\copy record_pages (record_id, page_no, text, confidence, ocr_engine) FROM 'pages.csv' WITH (FORMAT csv, HEADER true)
-- then refresh record stats:
UPDATE records r SET page_count = s.n, ocr_confidence = s.c
FROM (SELECT record_id, count(*) n, avg(confidence) c FROM record_pages GROUP BY 1) s WHERE s.record_id = r.id;
```

The `tsvector` column is generated, so no reindex step is needed. 16 hash partitions keep each GIN index small.
Run `VACUUM (ANALYZE) record_pages;` afterwards.

## SSO (Microsoft Entra ID / Google Workspace / Keycloak)

Better Auth's `genericOAuth` plugin adds OIDC sign-in without changing the data model:

```ts
// src/lib/auth.ts
import { genericOAuth } from "better-auth/plugins";
plugins: [
  genericOAuth({ config: [{
    providerId: "entra",
    discoveryUrl: `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}/v2.0/.well-known/openid-configuration`,
    clientId: process.env.ENTRA_CLIENT_ID!, clientSecret: process.env.ENTRA_CLIENT_SECRET!,
    scopes: ["openid", "email", "profile"],
  }] }),
  // …existing plugins
]
```

Then:
* Add `authClient.signIn.oauth2({ providerId: "entra" })` to the login page.
* Pre-provision users in **Users & Roles**. Matching emails are linked; keep `disableSignUp` so unknown identities are rejected.
* Optionally, map an IdP group claim to `user.role` in a `databaseHooks.user.create.before` hook.

## Project layout

```
src/app/(app)/*        staff pages (dashboard, records, intake, qa, file-plan, retention, users, audit, integrations, help, settings)
src/app/(public)/*     public portal and share-link pages
src/app/api/*          REST, worker and file routes
src/lib/*              rbac, search, records, ingest, storage, ocr heuristics, audit
db/migrations/*.sql    schema (plain SQL)
scripts/               migrate, seed, screenshots
worker/                Python OCR worker + Dockerfile
docs/                  PLAN.md and screenshots
```

## Known limitations

* The OCR worker's PDF/A upload goes through the API, which Vercel caps at 4.5 MB. Larger access copies need shared storage or an on-prem deployment.
* In-browser OCR is capped at 20 pages. Larger scans use the worker queue.
* The redaction workflow flags records (`redaction_required`) and serves only a `redacted` file kind through share links. There is no built-in redaction editor yet.
* The retention schedules and file plan are SAMPLE values. Replace them with CSC's approved RDS and file plan.
