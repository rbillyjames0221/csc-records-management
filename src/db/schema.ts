/**
 * Typed mirror of db/migrations/*.sql (the SQL files are the source of truth).
 * Generated/trigger-maintained columns (tsvector) are omitted on purpose.
 */
import {
  pgTable, pgEnum, text, boolean, timestamp, integer, uuid, date, real, jsonb, bigint, char, primaryKey,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["admin", "official", "records_officer", "employee", "regional", "public"]);
export const officeType = pgEnum("office_type", ["central", "regional", "field"]);
export const planCategory = pgEnum("plan_category", ["governance", "human_resource", "examination", "legal", "administrative", "others"]);
export const finalDisposition = pgEnum("final_disposition", ["keep", "transfer", "destroy"]);
export const sensitivityEnum = pgEnum("sensitivity", ["public", "internal", "confidential", "restricted"]);
export const recordTypeEnum = pgEnum("record_type", [
  "memorandum_circular", "policy_resolution", "must_read_resolution", "government_issuance", "office_memorandum",
  "case_decision", "exam_masterlist", "list_of_passers", "copi", "saln", "service_card", "appointment",
  "oath_of_office", "assumption_certificate", "pds", "report", "other",
]);
export const recordStatus = pgEnum("record_status", ["draft", "ocr_pending", "qa_review", "active", "on_hold", "disposed", "transferred"]);
export const textLayerEnum = pgEnum("text_layer", ["unknown", "born_digital", "image_only", "garbled", "mixed", "not_applicable"]);
export const fileKind = pgEnum("file_kind", ["original", "master", "access", "redacted"]);
export const jobStatus = pgEnum("job_status", ["queued", "processing", "done", "failed"]);
export const dispositionStatus = pgEnum("disposition_status", ["pending", "approved", "rejected", "executed"]);

const tz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const offices = pgTable("offices", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  type: officeType("type").notNull(),
  region: text("region"),
  address: text("address"),
  createdAt: tz("created_at").notNull().defaultNow(),
});

// ── Better Auth core models (field names must match Better Auth's model fields) ──
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRole("role").notNull().default("employee"),
  officeId: text("office_id"),
  position: text("position"),
  active: boolean("active").notNull().default(true),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: tz("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: tz("access_token_expires_at"),
  refreshTokenExpiresAt: tz("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: tz("expires_at").notNull(),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});

export const twoFactor = pgTable("two_factor", {
  id: text("id").primaryKey(),
  secret: text("secret").notNull(),
  backupCodes: text("backup_codes").notNull(),
  userId: text("user_id").notNull(),
  verified: boolean("verified").default(true),
  failedVerificationCount: integer("failed_verification_count").default(0),
  lockedUntil: tz("locked_until"),
});

// ── Domain ──
export const retentionSchedules = pgTable("retention_schedules", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  recordSeries: text("record_series").notNull(),
  description: text("description"),
  activeYears: integer("active_years").notNull().default(0),
  inactiveYears: integer("inactive_years").notNull().default(0),
  permanent: boolean("permanent").notNull().default(false),
  finalDisposition: finalDisposition("final_disposition").notNull(),
  legalBasis: text("legal_basis"),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});

export const classifications = pgTable("classifications", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: planCategory("category").notNull(),
  parentId: text("parent_id"),
  description: text("description"),
  defaultRetentionId: text("default_retention_id"),
  defaultSensitivity: sensitivityEnum("default_sensitivity").notNull().default("internal"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const records = pgTable("records", {
  id: uuid("id").primaryKey().defaultRandom(),
  recordNo: text("record_no").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  recordType: recordTypeEnum("record_type").notNull(),
  documentNumber: text("document_number"),
  classificationId: text("classification_id"),
  officeId: text("office_id"),
  dateCreated: date("date_created"),
  dateReceived: date("date_received"),
  retentionScheduleId: text("retention_schedule_id"),
  dispositionDue: date("disposition_due"),
  sensitivity: sensitivityEnum("sensitivity").notNull().default("internal"),
  containsPii: boolean("contains_pii").notNull().default(false),
  redactionRequired: boolean("redaction_required").notNull().default(false),
  legalHold: boolean("legal_hold").notNull().default(false),
  physicalLocation: text("physical_location"),
  keywords: text("keywords").array().notNull().default([]),
  subjectName: text("subject_name"),
  language: text("language").notNull().default("eng"),
  status: recordStatus("status").notNull().default("draft"),
  sourceFormat: text("source_format").notNull().default("born_digital"),
  textLayer: textLayerEnum("text_layer").notNull().default("unknown"),
  ocrEngine: text("ocr_engine"),
  ocrConfidence: real("ocr_confidence"),
  pageCount: integer("page_count").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
  isSample: boolean("is_sample").notNull().default(false),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});

export const recordFiles = pgTable("record_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  recordId: uuid("record_id").notNull(),
  kind: fileKind("kind").notNull().default("original"),
  storageDriver: text("storage_driver").notNull(),
  storageKey: text("storage_key").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  sha256: char("sha256", { length: 64 }).notNull(),
  pageCount: integer("page_count"),
  dpi: integer("dpi"),
  deletedAt: tz("deleted_at"),
  createdBy: text("created_by"),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const recordPages = pgTable("record_pages", {
  recordId: uuid("record_id").notNull(),
  pageNo: integer("page_no").notNull(),
  fileId: uuid("file_id"),
  text: text("text").notNull().default(""),
  confidence: real("confidence"),
  ocrEngine: text("ocr_engine"),
  needsReview: boolean("needs_review").notNull().default(false),
  reviewedBy: text("reviewed_by"),
  reviewedAt: tz("reviewed_at"),
  updatedAt: tz("updated_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.recordId, t.pageNo] })]);

export const recordRelations = pgTable("record_relations", {
  recordId: uuid("record_id").notNull(),
  relatedId: uuid("related_id").notNull(),
  relation: text("relation").notNull().default("references"),
  createdAt: tz("created_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.recordId, t.relatedId, t.relation] })]);

export const ingestJobs = pgTable("ingest_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  recordId: uuid("record_id").notNull(),
  fileId: uuid("file_id").notNull(),
  status: jobStatus("status").notNull().default("queued"),
  mode: text("mode").notNull().default("ocr"),
  engine: text("engine").notNull().default("ocrmypdf"),
  languages: text("languages").notNull().default("eng+fil"),
  priority: integer("priority").notNull().default(5),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  lockedBy: text("locked_by"),
  leaseExpiresAt: tz("lease_expires_at"),
  error: text("error"),
  result: jsonb("result"),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
  finishedAt: tz("finished_at"),
});

export const qaChecks = pgTable("qa_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  recordId: uuid("record_id").notNull(),
  checkKey: text("check_key").notNull(),
  passed: boolean("passed").notNull(),
  note: text("note"),
  checkedBy: text("checked_by"),
  checkedAt: tz("checked_at").notNull().defaultNow(),
});

export const dispositionRequests = pgTable("disposition_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  recordId: uuid("record_id").notNull(),
  action: finalDisposition("action").notNull(),
  reason: text("reason").notNull(),
  status: dispositionStatus("status").notNull().default("pending"),
  requestedBy: text("requested_by").notNull(),
  requestedAt: tz("requested_at").notNull().defaultNow(),
  decidedBy: text("decided_by"),
  decidedAt: tz("decided_at"),
  decisionNote: text("decision_note"),
  authorityRef: text("authority_ref"),
  executedAt: tz("executed_at"),
});

export const shareLinks = pgTable("share_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  recordId: uuid("record_id").notNull(),
  tokenHash: char("token_hash", { length: 64 }).notNull(),
  createdBy: text("created_by").notNull(),
  expiresAt: tz("expires_at").notNull(),
  maxUses: integer("max_uses"),
  uses: integer("uses").notNull().default(0),
  allowDownload: boolean("allow_download").notNull().default(false),
  note: text("note"),
  revokedAt: tz("revoked_at"),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  keyHash: char("key_hash", { length: 64 }).notNull(),
  role: userRole("role").notNull().default("employee"),
  officeId: text("office_id"),
  createdBy: text("created_by").notNull(),
  lastUsedAt: tz("last_used_at"),
  revokedAt: tz("revoked_at"),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const auditEvents = pgTable("audit_events", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  at: tz("at").notNull().defaultNow(),
  actorId: text("actor_id"),
  actorLabel: text("actor_label"),
  actorRole: text("actor_role"),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
});

export type RecordRow = typeof records.$inferSelect;
export type Role = (typeof userRole.enumValues)[number];
export type Sensitivity = (typeof sensitivityEnum.enumValues)[number];
export type RecordType = (typeof recordTypeEnum.enumValues)[number];
