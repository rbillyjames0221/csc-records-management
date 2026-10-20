# CSC Records Management System (RMS): Research and Implementation Plan

> **Scope.** This is a web-based Records Management System for the Philippine Civil Service Commission (CSC) records-digitization program. It implements every block of the "Records Management Cycle" diagram (sources, intake and digitization, digital ingestion, QA/validation, metadata and indexing, central repository, file plan, integration layer, access and retrieval, access control, delivery, users, governance, retention schedule, and manuals). It uses only free, open-source OCR engines.
>
> **Status of this document.** Versions and vendor limits were checked on **21 Oct 2026 (PHT, UTC+8)**. Anything marked *SAMPLE* (retention periods, classification codes, demo records) is a placeholder. CSC records officers must replace it with CSC's NAP-approved Records Disposition Schedule (RDS) and the official file plan.

---

## 1. Goals and non-goals

| Goals | Non-goals (for this phase) |
|---|---|
| One searchable repository for paper scans, born-digital PDFs, and legacy scans with bad OCR | Replacing HRIS, payroll, or the exam system (we integrate with them instead) |
| Free OCR that runs on CSC's own servers (Data Privacy Act) | Handwriting recognition at production accuracy (handwritten fields always get human review) |
| Fast full-text and fuzzy search over millions of pages | A national-scale public portal (only a public-records portal is in scope) |
| RBAC, audit trail, controlled delivery, retention and disposition with approval | A legally binding e-signature workflow |
| Responsive web app usable at 360 px (phone) and 1440 px (desktop), installable as a PWA | Native iOS/Android apps (the PWA covers this) |

---

## 2. What we learned from csc.gov.ph (input profile)

I sampled 11 public PDFs from csc.gov.ph and profiled them with `pdfinfo` and `pdftotext`:

| Sample | Pages | Text layer | Route |
|---|---|---|---|
| MC No. 01 s. 2026 (Wellness Leave Policy) | 2 | Clean, born-digital | Index text directly |
| CSC Resolution No. 2400721 (2024) | 16 | Clean | Index directly |
| CSC Resolution No. 962242 (1996) | 2 | **Garbled** old scanner OCR | Force re-OCR |
| CSC Resolution No. 992641 (1999) | 2 | Garbled or partial | Force re-OCR |
| MC No. 11 s. 2017 | 12 | **None** (image-only, 10.7 MB) | OCR |
| PSLMC Resolution No. 13 s. 2023 | 58 | **None** (34 MB) | OCR (worker, too big for browser) |
| List of Passers (2017) | 1 | Clean, tabular | Index directly, table extraction (Docling) |
| Citizen's Charter 2023 | 263 | Mostly text | Index directly |
| SALN FAQs | 18 | Clean | Index directly |

**Conclusions that drive the design:**
1. **Route by inspecting the text layer, not by year.** Every upload goes through text-layer detection, which returns one of `born_digital`, `image_only`, `garbled`, or `mixed`.
2. **Large scans can't be OCR'd on Vercel or reliably in a phone browser.** They go to a queue that an on-prem OCR worker processes.
3. **Identifying numbers (MC/Resolution No., "s. 2017") are often stamped or typed into blanks.** OCR suggests them, but QA must confirm them as metadata.
4. **Scanning baseline is 300 dpi color.** It matches CSC's own published scans. Keep the TIFF as the preservation master and produce a PDF/A access copy.

Record types the system models, from the diagram and the site:
Memorandum Circulars, Policy Resolutions, Must-Read Resolutions / case decisions, Government Issuances (RA/EO/OMs), Examination records (masterlists, PSPs / lists of passers), CSC Issuances (OMs, MCs, case decisions), COPIs, SALNs, Service Cards, Appointment papers (CS Form 33-A/B), Oath of Office (CS Form 32), Certificate of Assumption to Duty (CS Form 4), Personal Data Sheet (CS Form 212), and Others.

---

## 3. Technology choices (verified versions)

| Layer | Choice (version on 2026-10-21) | Why |
|---|---|---|
| Framework | **Next.js 16.4** App Router, **React 19.3**, TypeScript 5 | User requirement. Server Components keep DB access on the server. Cache Components / Partial Prerendering ship a static shell and stream in dynamic, permission-filtered data. `proxy.ts` replaces `middleware.ts` (Next 16). |
| Styling/UI | **Tailwind CSS 4.3** + **shadcn/ui** (base-nova style on Base UI primitives) + lucide icons + next-themes | Accessible primitives, owned source code (no runtime UI lock-in), and dark/light themes. |
| ORM | **Drizzle ORM 0.45** + node-postgres (`pg`) | SQL-first and thin, with no query engine binary or cold-start penalty on Vercel. It exposes Postgres features we rely on (tsvector, `websearch_to_tsquery`, `ts_headline`, `pg_trgm`, `FOR UPDATE SKIP LOCKED`, `COPY`) without workarounds. Prisma 6/7 is solid, but full-text search and partitioning end up as raw SQL anyway, and Drizzle's types follow the SQL we write. |
| Migrations | **Plain, versioned SQL files** (`db/migrations/*.sql`) and a small migrator that records applied files in `_rms_migrations` | Hash partitioning, generated tsvector columns, triggers (immutable audit log, search-vector maintenance), and GIN/trigram indexes are first-class in SQL. ORM generators handle these poorly. Drizzle's TypeScript schema mirrors the SQL for typed queries. |
| Auth | **Better Auth 1.7** (email + password with scrypt-hashed passwords, DB sessions, **twoFactor plugin** with TOTP and backup codes) | Since Sept 2025, Auth.js (NextAuth) has been maintained by the Better Auth team, which recommends Better Auth for new projects. It has a first-class Drizzle adapter, Next 16 `proxy` support, built-in rate limiting, 2FA, and generic OAuth/OIDC for future SSO (Microsoft Entra ID, Google Workspace, Keycloak). |
| Validation | **Zod 4** | Shared validation between server actions and API routes |
| File storage | **Vercel Blob, private store** (`@vercel/blob` ≥ 2.3 private stores; introduced Feb 2026) for cloud/pilot. **Local filesystem** driver for dev or an on-prem NAS. An **S3-compatible** driver (MinIO, Ceph, or a GovCloud bucket) is documented as an interface. | Private blobs can only be read through our authenticated route, so every view or download is permission-checked and audited. |
| In-browser OCR | **tesseract.js 7** (`eng+fil`) + **pdf.js** (`pdfjs-dist`) | Free, and runs on the user's device, so the file never leaves the device for OCR. Good for small uploads and the pilot. |
| Server OCR | **OCRmyPDF** (Tesseract 5, `-l eng+fil`, `--output-type pdfa`), with an optional **PaddleOCR / PaddleOCR-VL** second pass on low-confidence pages and **Docling** for tables | Free (MPL-2.0 / Apache-2.0 / MIT), works offline, can be government-hosted. Runs in `/worker` (Python, Docker). |
| DB | **PostgreSQL 17** with `pg_trgm` (Neon in the cloud, self-hosted on-prem) | See §4 |

---

## 4. Database recommendation

### 4.1 Comparison (free tiers as published 21 Oct 2026)

| | **Neon** (Vercel Marketplace) | Supabase | Prisma Postgres | Self-hosted PostgreSQL 17 (on-prem / GovCloud) |
|---|---|---|---|---|
| Free tier | 100 projects, **1 GB storage/project (20 GB account total)**, 100 CU-h/project/mo, autoscale to 2 CU, scale-to-zero after 5 min | 500 MB DB, 2 projects, **pauses after 7 days of inactivity** | 200k operations/mo, 2 GB storage, 10 pooled connections | Free software; you pay for hardware and ops |
| Vercel integration | **Native Marketplace** (env vars auto-injected, unified billing, preview branch per PR) | Marketplace | Marketplace | Manual |
| Branching | **Yes, instant copy-on-write** (one DB per preview deploy) | Paid | No | Manual (pg_dump / replicas) |
| Extensions we need | `pg_trgm`, `unaccent`, `pgcrypto` ✓ | ✓ | Limited extension support | ✓ All |
| Bulk ingest | `COPY` over the direct (unpooled) connection ✓ | ✓ | Ops-metered: bulk loads burn the operation quota | ✓ Fastest (local disk, tune `maintenance_work_mem`) |
| Data Privacy Act fit | Cloud (AWS regions, Singapore `ap-southeast-1` available). Needs a DPA outsourcing agreement and a PIA. | Cloud (Singapore available). Same. | Cloud. Same. | **Best**: data stays in CSC's data center |

### 4.2 Recommendation
* **Cloud / pilot on Vercel: Neon Postgres via the Vercel Marketplace**, region **AWS ap-southeast-1 (Singapore)**, the closest to Manila. Vercel functions run in `sin1` (set in `vercel.json`) to keep query latency in the low milliseconds. Use `DATABASE_URL` (pooled, PgBouncer) for the app and `DATABASE_URL_UNPOOLED` for migrations and `COPY` bulk loads. Preview deployments get a Neon branch each, so a schema change can be tested on a copy of production data.
  *The free tier (≈1 GB) holds roughly 150k–300k OCR'd pages of text. For the full archive, use the Launch or Scale plan ($0.35/GB-mo storage).*
* **Production with personal data (SALN, PDS, appointments): self-hosted PostgreSQL 17** on CSC or DICT GovCloud infrastructure, together with the on-prem OCR worker and an S3-compatible store (MinIO). The application code is identical. Only `DATABASE_URL` and `STORAGE_DRIVER` change. This is the cleanest way to comply with RA 10173 (no cross-border transfer, no third-party processor), and Neon remains available for the public-records tier.
* Prisma Postgres's operation-metered model penalizes bulk ingest. Supabase's 7-day pause and 500 MB cap are risky for a records system. Both are viable, but neither beats Neon on Vercel.

### 4.3 Why Postgres is fast enough (no separate search engine needed)
* **Full-text search:** each page stores `tsv = to_tsvector('english', text) || to_tsvector('simple', text)` as a *stored generated column*. `english` adds stemming for English issuances. `simple` keeps exact tokens for **Filipino/Tagalog**, which has no built-in Postgres stemmer, and for numbers ("2400721", "s. 2017"). Queries use `websearch_to_tsquery` (Google-style syntax: `"wellness leave" -draft OR sick`) against both configs, OR-ed together.
* **Record-level vector:** `records.search_tsv` is a weighted vector (A = record no., document no., title; B = keywords, subject name; C = description) maintained by trigger. Title hits outrank body hits.
* **Fuzzy matching:** `pg_trgm` GIN indexes on `title`, `document_number`, `record_no`, `subject_name` handle typos and spacing differences ("Dela Cruz" vs "Delacruz", "MC 11 2017" vs "MC No. 11, s. 2017").
* **Snippets:** `ts_headline` runs *only on the top-N page of each result after ranking*, because running it on every hit is the classic FTS performance trap.
* **Scale:** `record_pages` is **hash-partitioned by `record_id` (16 partitions)**. Each partition has its own GIN index, so index builds, VACUUM and REINDEX stay small, and the planner touches only the partitions that hold candidate rows. At about 3 KB of text per page, 10 M pages ≈ 30 GB of text plus ≈ 10–15 GB of GIN, which is comfortable on one Postgres node. Partitions can later be split, or moved to a read replica for search. `audit_events` is append-only and has a **BRIN** index on time (tiny, ideal for time-ordered logs). It can be range-partitioned by month once it passes about 50 M rows, which allows cheap archival with `DETACH PARTITION`.
* **Ingest:** the worker posts page text in batches. The server inserts with multi-row `INSERT ... ON CONFLICT (record_id, page_no) DO UPDATE` (500 rows per statement). The CSV importer uses batched multi-row inserts. For backfilling millions of legacy rows, `scripts/bulk-load.md` documents `COPY ... FROM STDIN` through the unpooled connection, with GIN indexes created *after* the load and `maintenance_work_mem` raised.
* **Work queue:** `ingest_jobs` uses `SELECT ... FOR UPDATE SKIP LOCKED`, so multiple OCR workers can pull jobs concurrently without Redis or RabbitMQ.

---

## 5. Architecture

```
            Browser / PWA (phone, tablet, desktop)
   ┌──────────────────────────────────────────────────────────┐
   │ Intake wizard: drag-drop → SHA-256 → pdf.js text-layer   │
   │ detection → (born-digital: extract text)                 │
   │            (image-only/garbled ≤ 20 pages: tesseract.js  │
   │             eng+fil, optional) → metadata form → QA list │
   └───────────────┬──────────────────────────────────────────┘
                   │ HTTPS (session cookie / API key)
   ┌───────────────▼──────────────────────────────────────────┐
   │ Next.js 16 on Vercel (sin1)                              │
   │  proxy.ts: optimistic auth redirect                      │
   │  Server Components + Server Actions (RBAC checked again) │
   │  /api/v1/* REST (search, records, import/export, OpenAPI)│
   │  /api/files/* authenticated streaming (+ audit)          │
   │  /api/worker/* job queue for OCR workers (bearer token)  │
   └──────┬───────────────────────┬───────────────────────────┘
          │ SQL (pooled)          │ private object storage
   ┌──────▼─────────┐     ┌──────▼──────────────┐
   │ PostgreSQL 17  │     │ Vercel Blob (private)│  or local FS / S3 (MinIO)
   │ Neon / on-prem │     └─────────────────────┘
   └──────▲─────────┘
          │ HTTPS, WORKER_TOKEN, pulls jobs, posts results
   ┌──────┴────────────────────────────────────────────────────┐
   │ On-prem OCR worker (Docker, Python 3.12)                  │
   │  OCRmyPDF --output-type pdfa -l eng+fil --deskew --clean  │
   │  --redo-ocr (garbled) / --force-ocr (bad layer)           │
   │  per-page Tesseract confidence (hOCR) → low pages →       │
   │  PaddleOCR-VL second pass (GPU optional) → results POST   │
   └───────────────────────────────────────────────────────────┘
```

### 5.1 OCR routing rules
1. **Hash** the file (SHA-256, computed in the browser and recomputed on the server for direct uploads). Matching an existing hash means a *duplicate*, which is blocked unless an authorized user overrides it.
2. **Inspect the text layer** with pdf.js for up to 30 sampled pages (`src/lib/ocr/text-layer.ts`):
   * `image_only`: fewer than 25 non-space characters on ≥ 80 % of sampled pages.
   * `garbled`: text exists, but the share of dictionary words (≈ 400 common English + Filipino words plus civil-service vocabulary) is under 35 %, or the share of non-alphanumeric "junk" characters is over 25 %, or the average token length falls outside 2–15. This catches 1990s scanner OCR such as CSC Resolution No. 962242.
   * `born_digital`: everything else. Page text is extracted in the browser and indexed immediately.
   * `mixed`: pages disagree, so OCR only the bad pages.
3. **Choose the engine:**
   * Browser `tesseract.js eng+fil` if the file is image-only or garbled, **≤ 20 pages**, and the user opts in. The pilot default is on for ≤ 5 pages.
   * Otherwise, **queue an `ingest_jobs` row** for the on-prem worker: `ocrmypdf` (with `--redo-ocr` for garbled files), then `paddleocr-vl` on pages with confidence below `OCR_REVIEW_THRESHOLD` (default 80).
4. **Pages under the threshold** get `needs_review = true` and appear in the **QA review queue**, with the page image beside an editable text box. Saving a correction sets `ocr_engine = 'human'` and confidence to 100.

### 5.2 Vercel limits handled
* The function request body limit is 4.5 MB, so cloud uploads go **browser → Vercel Blob directly** (client upload with a token issued by `/api/files/blob` after an RBAC check). Only the metadata and page text pass through functions.
* Function duration: no OCR runs in functions, and the worker is pull-based. Search is a single SQL round-trip.
* Region: `vercel.json` pins `regions: ["sin1"]`, next to Neon `ap-southeast-1`.

---

## 6. Data model (summary; full DDL in `db/migrations`)

| Table | Purpose |
|---|---|
| `user`, `session`, `account`, `verification`, `two_factor` | Better Auth core. `user.role` and `user.office_id` drive RBAC. |
| `offices` | Central, Regional (RO I–XVI, NCR, CAR, BARMM), Field offices |
| `classifications` | File plan tree: 6 top-level categories (Governance, Human Resource, Examination & Eligibility, Legal/Issuances & Decisions, Administrative, Others) → series codes (e.g. `LEG-MC`, `HR-SALN`) with a default retention schedule and default sensitivity |
| `retention_schedules` | Record series → active + inactive years → final disposition `keep`/`transfer`/`destroy`, legal basis (NAP RDS item no.) |
| `records` | The record and the diagram's metadata block: Record ID (`record_no`), Title/Description, Record Type, Classification Code, Office/Origin, Date Created, Retention Period (→ `disposition_due`), Access Rights (`sensitivity` + office scope), Physical Location, Related Records, Keywords/Tags. Plus status, text-layer status, OCR engine and confidence, PII and redaction flags, legal hold, type-specific `metadata jsonb`, `subject_name` (for personnel records), `search_tsv` |
| `record_files` | Original, preservation master (TIFF), access copy (PDF/A), redacted copy. `sha256` UNIQUE for dedup. Storage driver and key. |
| `record_pages` (**hash-partitioned ×16**) | Per-page text, OCR engine, confidence, `needs_review`, reviewer, generated `tsv` + GIN |
| `record_relations` | amends / supersedes / implements / references / attachment-of |
| `ingest_jobs` | OCR queue (`queued → processing → done / failed / needs_review`), attempts, lock owner, lease expiry |
| `qa_checks` | Per-record QA checklist (image quality, metadata completeness, naming compliance, dedup, PII review) with result and reviewer |
| `disposition_requests` | keep / transfer / destroy request → approve / reject → executed, NAP authority reference |
| `share_links` | Controlled share: token **hash** only, expiry, max uses, download allowed?, revocation |
| `api_keys` | Integration-layer keys (hash only, prefix shown), role/office scope, last used |
| `audit_events` (**append-only**, trigger blocks UPDATE/DELETE) | Every view, download, print, search, edit, share, QA, disposition, login, and API call: who, role, IP, UA, entity, details |

---

## 7. Access control (RBAC + data privacy)

### 7.1 Roles (from the diagram's **Users** column)

| Role | Diagram | Can |
|---|---|---|
| `admin` | System administrator | Everything, including user/role management, API keys, file plan |
| `official` | **CSC Officials (Full Access)** | Read all sensitivities including Restricted. Approve dispositions. View audit log. |
| `records_officer` | CSC Employee: records management unit | Intake, QA, edit metadata, file plan and retention maintenance, request disposition. Reads up to Confidential (all offices). Restricted only within own office. |
| `employee` | **CSC Employees (Role-based)** | Search and read Public + Internal. Download only what they can read. |
| `regional` | **Field / Regional Offices (Authorized)** | Public everywhere. Internal + Confidential **of own office**. Intake for own office. |
| `public` | **Public / External (As allowed by policy)** | Public records only, PII masked. Also served unauthenticated through `/portal`. |

### 7.2 Sensitivity levels
`public` (issuances, MCs, resolutions, lists of passers), `internal` (office memos, administrative), `confidential` (case records, exam masterlists with ratings), `restricted` (SALN, PDS, appointment and personnel files: personal and sensitive personal information under RA 10173 §3(l)).

Enforcement happens in **one SQL predicate builder** (`src/lib/rbac.ts → accessFilter()`) used by *every* list, search, export, and file route. Pages never filter in JavaScript after fetching.

### 7.3 Data Privacy Act (RA 10173) controls
* **PII flagging:** record types SALN/PDS/appointment/service card/oath/assumption default to `restricted` + `contains_pii`.
* **Masking:** for the `public` role and the portal, OCR text and snippets pass through `maskPII()` (TIN `###-###-###`, PH mobile numbers, emails, birth dates, GSIS/SSS/PhilHealth/Pag-IBIG numbers) before rendering. Restricted metadata fields (e.g. `subject_name`) are hidden.
* **Redaction flag:** `redaction_required` blocks download of the original for everyone below `official` until a redacted access copy is uploaded. The worker roadmap adds PyMuPDF `apply_redactions()` for burn-in.
* **Audit:** every access to restricted records is logged with purpose-of-access. A purpose prompt for restricted records is on the roadmap.
* **Hosting:** keep restricted series on-prem (see §4.2). Cloud OCR APIs are not used.
* **Retention:** personal data is not kept longer than the schedule. Disposition requires approval and leaves a tombstone: metadata plus the certificate/NAP authority, not the content.

### 7.4 Authentication hardening
Scrypt password hashing (Better Auth default), DB sessions (7-day expiry, refreshed daily), built-in rate limiting on sign-in, `disableSignUp` (accounts are created by an admin only), **TOTP 2FA** enrolment in Settings (enforce for `admin`/`official` with `REQUIRE_2FA_ROLES`), secure cookies, CSRF protection via Better Auth origin checks, and SSO-ready configuration (§12).

---

## 8. Feature map (diagram block → app)

| Diagram block | Where in the app |
|---|---|
| Sources of records (A. types, B. locations, C. current state) | `record_type` enum + per-type metadata forms; `offices` (Central/Field/Regional); text-layer status captures "current state" (digitized / harvestable / paper) |
| 1 Creation/Receipt → Intake & Digitization | **/intake** wizard: drag-drop multi-file, camera capture on mobile (`accept="image/*,application/pdf" capture`), scanning standards shown inline, naming convention check, virus-scan hook (worker ClamAV, documented) |
| Digital ingestion (harvest / API / upload) | Upload, **/api/v1/import** (CSV), **/api/v1/records** (POST, JSON) for HRIS/Finance integrations |
| QA / Validation | Intake QA checklist (image quality ≥ 300 dpi estimate, metadata completeness, naming compliance, SHA-256 dedup) + **/qa** queue for low-confidence pages (side-by-side correction) |
| 2 Organization/Classification → Metadata & Indexing | Metadata form (all 12 diagram fields), auto-suggestions from OCR text (document number regex, date, title) |
| 3 Storage/Preservation → Central Repository | Private object storage + `record_files` (original / master / PDF/A), SHA-256 fixity, physical location field |
| File plan / classification scheme | **/file-plan**: tree of 6 categories → series, default retention + sensitivity |
| Integration layer | **/integrations**: REST API docs (OpenAPI 3.1 JSON), API keys, CSV import/export |
| 4 Access/Use → Search & Retrieve | **/records**: simple + advanced search, filters (type, classification, office, sensitivity, year, status, OCR status), full-text OCR search with highlighted snippets, fuzzy names/numbers |
| Access control | RBAC (§7), audit trail **/audit**, 2FA in **/settings** |
| Delivery | Record viewer (pdf.js, works on mobile), secure download (streamed, audited), print (audited), **controlled share links** with expiry/max-uses/revoke (`/s/[token]`) |
| Users | **/users** (admin): create, change role/office, disable |
| Governance, policies & procedures | **/help/guidelines**: digitization, uploading, access policy, classification & file plan policy, records disposal policy |
| Retention schedule + 5 Disposition | **/retention**: schedules, records due for disposition, request → approval → execute (keep/transfer/destroy), legal hold |
| Manuals & user guides | **/help**: user manual, quick reference, FAQ, step-by-step tutorials, system administration guide |
| "One record, one standard, one system" | One `records` row per record, one search index, one audit trail |

---

## 9. UI / responsiveness plan
* **Layouts:** desktop (≥ 1024 px) has a collapsible left sidebar with grouped navigation and a top bar (global search, theme toggle, user menu). Mobile (< 1024 px) has a sticky top bar with search, a **bottom tab bar** (Dashboard · Records · Intake · QA · More), and a "More" sheet for the remaining sections. All tap targets are ≥ 44 px.
* **Tables → cards:** record lists render as cards below `md` and as a dense table at `md` and up.
* **Viewer:** pdf.js canvas, fit-to-width on phones, pinch/zoom buttons, page navigation, text/metadata/audit in tabs below the viewer (mobile) or beside it (desktop).
* **Accessibility:** semantic landmarks, skip link, visible focus rings, `aria-current` on nav, labelled form controls, colour contrast AA in both themes, `prefers-reduced-motion` honoured.
* **Theme:** CSC-inspired navy primary with a gold accent (the diagram's palette). Light/dark/system.
* **PWA:** `app/manifest.ts` (standalone, icons, theme colour), installable on Android/desktop Chrome/Edge and via iOS "Add to Home Screen". Offline caching of records data is deliberately *not* enabled (privacy).
* **Performance:** Cache Components shell plus Suspense streaming. Lists are paginated on the server (25/page). No client-side data fetching for lists.

---

## 10. Retention and disposition workflow
1. `disposition_due = date_created + (active_years + inactive_years)` from the classification's schedule, recomputed when the classification changes.
2. **/retention** lists records that are due (excluding `legal_hold`).
3. A records officer files a **request** (keep / transfer to NAP or archives / destroy) with a reason.
4. An official or admin **approves or rejects** it, with an NAP authority reference for destroy/transfer.
5. **Execute:** *destroy* deletes stored files and page text, sets `status = disposed`, and keeps a tombstone row with the certificate number. *Transfer* sets `status = transferred` and records the receiving archive. *Keep* extends `disposition_due` or marks the record permanent.
6. Every step is audited.

> Legal basis to confirm with CSC Records Section: RA 9470 (National Archives of the Philippines Act of 2007), NAP General Records Disposition Schedule, CSC-specific RDS, RA 10173 retention limitation.

---

## 11. Rollout plan
| Phase | Duration | Exit criteria |
|---|---|---|
| 0. Setup | 1 wk | Neon (or on-prem PG) + Blob/MinIO + worker VM, repo, CI, demo seeded |
| 1. Pilot: public issuances (MCs, Resolutions) | 4 wk | ≥ 2,000 records, OCR char accuracy ≥ 97 % on clean scans, search p95 < 300 ms |
| 2. Exam & eligibility (masterlists, PSPs) | 4 wk | Docling table extraction validated on 200 lists |
| 3. Personnel (PDS, SALN, appointments, service cards), **on-prem only** | 6 wk | PIA signed off, RBAC/audit tested by DPO, handwriting review workflow staffed |
| 4. Regional rollout | ongoing | Each RO trained and given scanning standard kits |

**QA targets:** sample 5 % of pages per batch (min. 20). Reject the batch if the character error rate on the sample exceeds 3 % or more than 2 % of records have incomplete metadata. 100 % human verification of document numbers and dates on scans.

---

## 12. Future: SSO, scaling, hardening
* **SSO:** Better Auth `genericOAuth` plugin (OIDC) for Microsoft Entra ID / Google Workspace / Keycloak (on-prem). Map an IdP group claim to `user.role`. See README §SSO.
* **Search scale-out:** read replica for `/api/v1/search`. If semantic search is needed later, `pgvector` with multilingual embeddings computed on the worker.
* **Virus scanning:** ClamAV step in the worker before OCR (documented hook).
* **Redaction burn-in:** worker job type `redact` (PyMuPDF).
* **Observability:** Vercel Observability + Postgres `pg_stat_statements`.

---

## 13. Verification checklist (done for this build)
- `npm run lint`, `npm run typecheck`, `npm run build` pass
- Local PostgreSQL 17: migrations, seed (sample records + real public CSC sample PDFs if `SAMPLES_DIR` is set)
- Login per role, RBAC denial (employee → restricted record → 404; public → `/dashboard` redirect; worker API without token → 401)
- Upload a born-digital PDF (text extracted), an image-only PDF (queued → worker OCR), duplicate detection
- Search with highlighted snippets (English + Filipino terms), fuzzy record number
- Screenshots at 390×844 (mobile) and 1440×900 (desktop) in `docs/screenshots/`
