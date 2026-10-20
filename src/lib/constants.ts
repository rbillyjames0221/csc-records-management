import type { RecordType, Role, Sensitivity } from "@/db/schema";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "System Administrator",
  official: "CSC Official",
  records_officer: "Records Officer",
  employee: "CSC Employee",
  regional: "Field / Regional Office",
  public: "Public / External",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Full access, user & role management, API keys, file plan.",
  official: "Full read access incl. restricted records; approves dispositions; audit log.",
  records_officer: "Intake, QA, metadata, file plan & retention; up to Confidential.",
  employee: "Role-based: Public and Internal records.",
  regional: "Public records + Internal/Confidential of own office; intake for own office.",
  public: "Public records only, personal data masked.",
};

export const SENSITIVITY_LABELS: Record<Sensitivity, string> = {
  public: "Public",
  internal: "Internal",
  confidential: "Confidential",
  restricted: "Restricted (Personal Data)",
};

export const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  memorandum_circular: "Memorandum Circular",
  policy_resolution: "Policy Resolution",
  must_read_resolution: "Must-Read Resolution",
  government_issuance: "Government Issuance (RA/EO)",
  office_memorandum: "Office Memorandum",
  case_decision: "Case Decision",
  exam_masterlist: "Examination Masterlist",
  list_of_passers: "List of Passers (PSP)",
  copi: "COPI",
  saln: "SALN",
  service_card: "Service Card",
  appointment: "Appointment (CS Form 33-A/B)",
  oath_of_office: "Oath of Office (CS Form 32)",
  assumption_certificate: "Certificate of Assumption (CS Form 4)",
  pds: "Personal Data Sheet (CS Form 212)",
  report: "Report / Publication",
  other: "Other Records",
};

/** Record types that carry personal / sensitive personal information (RA 10173). */
export const PII_RECORD_TYPES: RecordType[] = [
  "saln", "service_card", "appointment", "oath_of_office", "assumption_certificate", "pds", "exam_masterlist", "copi",
];

/** Extra metadata fields captured per record type in the intake wizard. */
export const TYPE_FIELDS: Partial<Record<RecordType, { key: string; label: string; placeholder?: string }[]>> = {
  memorandum_circular: [{ key: "series", label: "Series (year)", placeholder: "2026" }, { key: "signatory", label: "Signatory" }],
  policy_resolution: [{ key: "series", label: "Series (year)" }, { key: "promulgated", label: "Date promulgated" }],
  must_read_resolution: [{ key: "caseTitle", label: "Case title" }, { key: "ponente", label: "Ponente / signatory" }],
  case_decision: [{ key: "caseTitle", label: "Case title" }, { key: "docketNo", label: "Docket no." }],
  government_issuance: [{ key: "issuingBody", label: "Issuing body", placeholder: "Congress / Office of the President" }],
  exam_masterlist: [{ key: "examTitle", label: "Examination", placeholder: "Career Service Exam – Professional" }, { key: "examDate", label: "Exam date" }, { key: "testingCenter", label: "Testing center" }],
  list_of_passers: [{ key: "examTitle", label: "Examination" }, { key: "examDate", label: "Exam date" }],
  saln: [{ key: "declarant", label: "Declarant (full name)" }, { key: "position", label: "Position" }, { key: "agency", label: "Agency" }, { key: "asOf", label: "As of (date)" }],
  pds: [{ key: "employee", label: "Employee (full name)" }, { key: "agency", label: "Agency" }],
  service_card: [{ key: "employee", label: "Employee (full name)" }, { key: "agency", label: "Agency" }],
  appointment: [{ key: "appointee", label: "Appointee" }, { key: "position", label: "Position title" }, { key: "salaryGrade", label: "Salary grade" }, { key: "natureOfAppointment", label: "Nature (original/promotion…)" }],
  oath_of_office: [{ key: "affiant", label: "Affiant" }, { key: "position", label: "Position" }],
  assumption_certificate: [{ key: "employee", label: "Employee" }, { key: "assumptionDate", label: "Date of assumption" }],
  copi: [{ key: "subject", label: "Subject / person" }],
};

export const PERSON_FIELD_KEYS = ["declarant", "employee", "appointee", "affiant", "subject"];

export const STATUS_LABELS = {
  draft: "Draft",
  ocr_pending: "OCR pending",
  qa_review: "In QA review",
  active: "Active",
  on_hold: "On hold",
  disposed: "Disposed",
  transferred: "Transferred",
} as const;

export const TEXT_LAYER_LABELS = {
  unknown: "Unknown",
  born_digital: "Born-digital text",
  image_only: "Image-only scan",
  garbled: "Garbled OCR layer",
  mixed: "Mixed",
  not_applicable: "N/A",
} as const;

export const CATEGORY_LABELS = {
  governance: "1. Governance Records",
  human_resource: "2. Human Resource Records",
  examination: "3. Examination & Eligibility Records",
  legal: "4. Legal / Issuances & Decisions",
  administrative: "5. Administrative Records",
  others: "6. Others",
} as const;

export const QA_CHECKS = [
  { key: "image_quality", label: "Image quality (≥300 dpi, legible, straight, complete pages)" },
  { key: "metadata_complete", label: "Metadata completeness (all required fields)" },
  { key: "naming_compliance", label: "File naming convention followed" },
  { key: "dedup", label: "No duplicate (SHA-256 checked)" },
  { key: "pii_review", label: "Personal data reviewed / redaction flagged" },
] as const;

/** File naming convention: <OFFICE>_<TYPE>_<YYYY>_<NUMBER or SLUG>[_pNN].<ext>  e.g. CO_MC_2026_01.pdf */
export const NAMING_PATTERN = /^[A-Z0-9]{2,8}_[A-Z0-9]{2,8}_(19|20)\d{2}_[A-Za-z0-9-]{1,40}(_p\d{1,4})?\.(pdf|tif|tiff|jpg|jpeg|png)$/;
export const NAMING_EXAMPLE = "CO_MC_2026_01.pdf  ·  NCR_SALN_2025_DELACRUZ-J.pdf";
