const recordId = { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } };
const bearer = [{ apiKey: [] }, { session: [] }];
const worker = [{ workerToken: [] }];
const ok = (description: string, schema: object = { type: "object" }) => ({ description, content: { "application/json": { schema } } });

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "CSC Records Management System API",
    version: "1.0.0",
    description: "REST API for search, records, file ingest, OCR worker jobs and CSV import/export. Authenticate with a session cookie (browser) or `Authorization: Bearer rms_…` API key. OCR workers use `Authorization: Bearer <WORKER_TOKEN>`. All responses respect role, office scope and access level; PII is masked for roles without clearance.",
  },
  servers: [{ url: "/" }],
  components: {
    securitySchemes: {
      apiKey: { type: "http", scheme: "bearer", description: "API key created under Integrations (prefix rms_)" },
      session: { type: "apiKey", in: "cookie", name: "better-auth.session_token" },
      workerToken: { type: "http", scheme: "bearer", description: "Shared WORKER_TOKEN secret" },
    },
    schemas: {
      RecordInput: {
        type: "object", required: ["title", "recordType", "classificationId", "officeId"],
        properties: {
          title: { type: "string" }, recordType: { type: "string", example: "memorandum_circular" }, documentNumber: { type: "string", example: "MC No. 01, s. 2026" },
          classificationId: { type: "string", example: "LEG-MC" }, officeId: { type: "string", example: "CO" }, dateCreated: { type: "string", format: "date" },
          sensitivity: { type: "string", enum: ["public", "internal", "confidential", "restricted"] }, keywords: { type: "array", items: { type: "string" } },
          description: { type: "string" }, metadata: { type: "object", additionalProperties: { type: "string" } },
        },
      },
      Pages: {
        type: "object", required: ["engine", "pages"],
        properties: { engine: { type: "string", example: "ocrmypdf-tesseract5" }, textLayer: { type: "string" }, pages: { type: "array", items: { type: "object", required: ["pageNo", "text"], properties: { pageNo: { type: "integer" }, text: { type: "string" }, confidence: { type: "number" } } } } },
      },
    },
  },
  paths: {
    "/api/health": { get: { summary: "Liveness + DB check", responses: { 200: ok("OK") } } },
    "/api/v1/records": {
      get: {
        summary: "Full-text search records", security: bearer,
        parameters: ["q", "type", "category", "classification", "office", "sensitivity", "status", "textLayer", "yearFrom", "yearTo", "sort", "page", "pageSize"].map((n) => ({ name: n, in: "query", schema: { type: "string" } })),
        responses: { 200: ok("Hits with highlighted snippets (⟦ ⟧ markers)") },
      },
      post: { summary: "Create a record (metadata)", security: bearer, requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/RecordInput" } } } }, responses: { 201: ok("Created") } },
    },
    "/api/v1/records/{id}": { get: { summary: "Get a record with files and relations", security: bearer, parameters: [recordId], responses: { 200: ok("Record"), 404: ok("Not found or not permitted") } } },
    "/api/v1/records/{id}/files": { post: { summary: "Upload original file (multipart field `file`, ≤4.5 MB on Vercel; larger via Blob client upload)", security: bearer, parameters: [recordId], responses: { 201: ok("Stored"), 409: ok("Duplicate (same SHA-256)") } } },
    "/api/v1/records/{id}/pages": { post: { summary: "Index page text (pdf.js / browser OCR)", security: bearer, parameters: [recordId], requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Pages" } } } }, responses: { 200: ok("Indexed") } } },
    "/api/v1/records/{id}/ocr-jobs": { post: { summary: "Queue server-side OCR for the original file", security: bearer, parameters: [recordId], responses: { 201: ok("Queued") } } },
    "/api/v1/export": { get: { summary: "CSV export (dataset=records|audit, same filters as search)", security: bearer, responses: { 200: { description: "text/csv" } } } },
    "/api/v1/import": { post: { summary: "Bulk metadata import from CSV (?dryRun=1 to validate)", security: bearer, requestBody: { content: { "text/csv": { schema: { type: "string" } } } }, responses: { 200: ok("Import report") } } },
    "/api/worker/jobs/claim": { post: { summary: "Claim OCR jobs (SKIP LOCKED queue with leases)", security: worker, requestBody: { content: { "application/json": { schema: { type: "object", properties: { workerId: { type: "string" }, limit: { type: "integer" }, leaseSeconds: { type: "integer" } } } } } }, responses: { 200: ok("Jobs") } } },
    "/api/worker/jobs/{id}/source": { get: { summary: "Download the job's original file", security: worker, parameters: [recordId], responses: { 200: { description: "File bytes" } } } },
    "/api/worker/jobs/{id}/complete": { post: { summary: "Submit OCR text per page and mark done", security: worker, parameters: [recordId], requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Pages" } } } }, responses: { 200: ok("Stored") } } },
    "/api/worker/jobs/{id}/artifact": { put: { summary: "Upload searchable PDF/A access copy", security: worker, parameters: [recordId], requestBody: { content: { "application/pdf": { schema: { type: "string", format: "binary" } } } }, responses: { 200: ok("Stored") } } },
    "/api/worker/jobs/{id}/fail": { post: { summary: "Report failure (requeues until max attempts)", security: worker, parameters: [recordId], responses: { 200: ok("Updated") } } },
  },
} as const;
