-- CSC RMS initial schema. PostgreSQL 15+ (tested on 17). Neon-compatible.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS unaccent; -- reserved for accent-insensitive search configs

-- ───────────── Enums ─────────────
CREATE TYPE user_role AS ENUM ('admin','official','records_officer','employee','regional','public');
CREATE TYPE office_type AS ENUM ('central','regional','field');
CREATE TYPE plan_category AS ENUM ('governance','human_resource','examination','legal','administrative','others');
CREATE TYPE final_disposition AS ENUM ('keep','transfer','destroy');
CREATE TYPE sensitivity AS ENUM ('public','internal','confidential','restricted');
CREATE TYPE record_type AS ENUM (
  'memorandum_circular','policy_resolution','must_read_resolution','government_issuance','office_memorandum',
  'case_decision','exam_masterlist','list_of_passers','copi','saln','service_card','appointment',
  'oath_of_office','assumption_certificate','pds','report','other');
CREATE TYPE record_status AS ENUM ('draft','ocr_pending','qa_review','active','on_hold','disposed','transferred');
CREATE TYPE text_layer AS ENUM ('unknown','born_digital','image_only','garbled','mixed','not_applicable');
CREATE TYPE file_kind AS ENUM ('original','master','access','redacted');
CREATE TYPE job_status AS ENUM ('queued','processing','done','failed');
CREATE TYPE disposition_status AS ENUM ('pending','approved','rejected','executed');

-- ───────────── Better Auth core ─────────────
CREATE TABLE offices (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  type office_type NOT NULL,
  region text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  role user_role NOT NULL DEFAULT 'employee',
  office_id text REFERENCES offices(id),
  position text,
  active boolean NOT NULL DEFAULT true,
  two_factor_enabled boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE session (
  id text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX session_user_idx ON session(user_id);

CREATE TABLE account (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_user_idx ON account(user_id);

CREATE TABLE verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verification_identifier_idx ON verification(identifier);

CREATE TABLE two_factor (
  id text PRIMARY KEY,
  secret text NOT NULL,
  backup_codes text NOT NULL,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  verified boolean DEFAULT true,
  failed_verification_count integer DEFAULT 0,
  locked_until timestamptz
);
CREATE INDEX two_factor_user_idx ON two_factor(user_id);
CREATE INDEX two_factor_secret_idx ON two_factor(secret);

-- ───────────── File plan & retention ─────────────
CREATE TABLE retention_schedules (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  record_series text NOT NULL,
  description text,
  active_years integer NOT NULL DEFAULT 0 CHECK (active_years >= 0),
  inactive_years integer NOT NULL DEFAULT 0 CHECK (inactive_years >= 0),
  permanent boolean NOT NULL DEFAULT false,
  final_disposition final_disposition NOT NULL,
  legal_basis text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE classifications (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category plan_category NOT NULL,
  parent_id text REFERENCES classifications(id),
  description text,
  default_retention_id text REFERENCES retention_schedules(id),
  default_sensitivity sensitivity NOT NULL DEFAULT 'internal',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX classifications_parent_idx ON classifications(parent_id);

-- ───────────── Records ─────────────
CREATE SEQUENCE record_no_seq START 1;

CREATE TABLE records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_no text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  record_type record_type NOT NULL,
  document_number text,
  classification_id text REFERENCES classifications(id),
  office_id text REFERENCES offices(id),
  date_created date,
  date_received date,
  retention_schedule_id text REFERENCES retention_schedules(id),
  disposition_due date,
  sensitivity sensitivity NOT NULL DEFAULT 'internal',
  contains_pii boolean NOT NULL DEFAULT false,
  redaction_required boolean NOT NULL DEFAULT false,
  legal_hold boolean NOT NULL DEFAULT false,
  physical_location text,
  keywords text[] NOT NULL DEFAULT '{}',
  subject_name text,
  language text NOT NULL DEFAULT 'eng',
  status record_status NOT NULL DEFAULT 'draft',
  source_format text NOT NULL DEFAULT 'born_digital', -- paper_scan | born_digital | harvested
  text_layer text_layer NOT NULL DEFAULT 'unknown',
  ocr_engine text,
  ocr_confidence real,
  page_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_sample boolean NOT NULL DEFAULT false,
  created_by text REFERENCES "user"(id),
  updated_by text REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  search_tsv tsvector
);
CREATE INDEX records_search_idx ON records USING gin (search_tsv);
CREATE INDEX records_title_trgm ON records USING gin (title gin_trgm_ops);
CREATE INDEX records_docno_trgm ON records USING gin (document_number gin_trgm_ops);
CREATE INDEX records_recno_trgm ON records USING gin (record_no gin_trgm_ops);
CREATE INDEX records_subject_trgm ON records USING gin (subject_name gin_trgm_ops);
CREATE INDEX records_keywords_idx ON records USING gin (keywords);
CREATE INDEX records_filter_idx ON records (sensitivity, office_id, record_type, status);
CREATE INDEX records_class_idx ON records (classification_id);
CREATE INDEX records_date_idx ON records (date_created DESC);
CREATE INDEX records_due_idx ON records (disposition_due) WHERE status IN ('active','on_hold') AND legal_hold = false;
CREATE INDEX records_created_idx ON records (created_at DESC);

CREATE OR REPLACE FUNCTION records_search_tsv_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv :=
      setweight(to_tsvector('simple', coalesce(NEW.record_no,'') || ' ' || coalesce(NEW.document_number,'')), 'A')
   || setweight(to_tsvector('english', coalesce(NEW.title,'')), 'A')
   || setweight(to_tsvector('simple', coalesce(NEW.title,'')), 'B')
   || setweight(to_tsvector('simple', array_to_string(NEW.keywords, ' ') || ' ' || coalesce(NEW.subject_name,'')), 'B')
   || setweight(to_tsvector('english', coalesce(NEW.description,'')), 'C');
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER records_search_tsv_trg BEFORE INSERT OR UPDATE ON records
  FOR EACH ROW EXECUTE FUNCTION records_search_tsv_update();

CREATE TABLE record_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  kind file_kind NOT NULL DEFAULT 'original',
  storage_driver text NOT NULL,
  storage_key text NOT NULL,
  filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 char(64) NOT NULL,
  page_count integer,
  dpi integer,
  deleted_at timestamptz,
  created_by text REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Dedup: one live copy of a given byte stream per kind
CREATE UNIQUE INDEX record_files_sha_uniq ON record_files (sha256, kind) WHERE deleted_at IS NULL;
CREATE INDEX record_files_record_idx ON record_files (record_id);

-- Page text: hash-partitioned by record_id for multi-million-page scale.
CREATE TABLE record_pages (
  record_id uuid NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  page_no integer NOT NULL CHECK (page_no >= 1),
  file_id uuid,
  text text NOT NULL DEFAULT '',
  confidence real,
  ocr_engine text,
  needs_review boolean NOT NULL DEFAULT false,
  reviewed_by text,
  reviewed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  tsv tsvector GENERATED ALWAYS AS (
    to_tsvector('english'::regconfig, left(text, 200000)) || to_tsvector('simple'::regconfig, left(text, 200000))
  ) STORED,
  PRIMARY KEY (record_id, page_no)
) PARTITION BY HASH (record_id);

DO $$
BEGIN
  FOR i IN 0..15 LOOP
    EXECUTE format('CREATE TABLE record_pages_p%s PARTITION OF record_pages FOR VALUES WITH (MODULUS 16, REMAINDER %s)', lpad(i::text,2,'0'), i);
  END LOOP;
END $$;
CREATE INDEX record_pages_tsv_idx ON record_pages USING gin (tsv);
CREATE INDEX record_pages_review_idx ON record_pages (needs_review) WHERE needs_review;

CREATE TABLE record_relations (
  record_id uuid NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  related_id uuid NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  relation text NOT NULL DEFAULT 'references', -- amends | supersedes | implements | references | attachment
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (record_id, related_id, relation),
  CHECK (record_id <> related_id)
);
CREATE INDEX record_relations_related_idx ON record_relations (related_id);

-- ───────────── Ingest / OCR queue ─────────────
CREATE TABLE ingest_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES record_files(id) ON DELETE CASCADE,
  status job_status NOT NULL DEFAULT 'queued',
  mode text NOT NULL DEFAULT 'ocr', -- ocr | redo_ocr | force_ocr
  engine text NOT NULL DEFAULT 'ocrmypdf',
  languages text NOT NULL DEFAULT 'eng+fil',
  priority integer NOT NULL DEFAULT 5,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  locked_by text,
  lease_expires_at timestamptz,
  error text,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX ingest_jobs_queue_idx ON ingest_jobs (priority, created_at) WHERE status = 'queued';
CREATE INDEX ingest_jobs_record_idx ON ingest_jobs (record_id);

-- ───────────── QA ─────────────
CREATE TABLE qa_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  check_key text NOT NULL, -- image_quality | metadata_complete | naming_compliance | dedup | pii_review | ocr_confidence
  passed boolean NOT NULL,
  note text,
  checked_by text REFERENCES "user"(id),
  checked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (record_id, check_key)
);

-- ───────────── Disposition ─────────────
CREATE TABLE disposition_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  action final_disposition NOT NULL,
  reason text NOT NULL,
  status disposition_status NOT NULL DEFAULT 'pending',
  requested_by text NOT NULL REFERENCES "user"(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by text REFERENCES "user"(id),
  decided_at timestamptz,
  decision_note text,
  authority_ref text, -- e.g. NAP Authority to Dispose No.
  executed_at timestamptz
);
CREATE UNIQUE INDEX disposition_one_open ON disposition_requests (record_id) WHERE status IN ('pending','approved');

-- ───────────── Delivery: share links ─────────────
CREATE TABLE share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  created_by text NOT NULL REFERENCES "user"(id),
  expires_at timestamptz NOT NULL,
  max_uses integer,
  uses integer NOT NULL DEFAULT 0,
  allow_download boolean NOT NULL DEFAULT false,
  note text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX share_links_record_idx ON share_links (record_id);

-- ───────────── Integration: API keys ─────────────
CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  prefix text NOT NULL,
  key_hash char(64) NOT NULL UNIQUE,
  role user_role NOT NULL DEFAULT 'employee',
  office_id text REFERENCES offices(id),
  created_by text NOT NULL REFERENCES "user"(id),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ───────────── Audit trail (append-only) ─────────────
CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_id text,
  actor_label text,
  actor_role text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  ip text,
  user_agent text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_at_brin ON audit_events USING brin (at);
CREATE INDEX audit_entity_idx ON audit_events (entity_type, entity_id, at DESC);
CREATE INDEX audit_actor_idx ON audit_events (actor_id, at DESC);
CREATE INDEX audit_action_idx ON audit_events (action, at DESC);

CREATE OR REPLACE FUNCTION audit_events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END $$;
CREATE TRIGGER audit_events_no_update BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_immutable();
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_immutable();
