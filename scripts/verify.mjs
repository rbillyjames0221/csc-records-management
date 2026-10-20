// End-to-end smoke test against a running instance (local or deployed).
// Usage: BASE_URL=http://localhost:3000 SEED_DEMO_PASSWORD=… [WORKER_TOKEN=…] [SAMPLE_PDF=path] node scripts/verify.mjs
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const base = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const password = process.env.SEED_DEMO_PASSWORD || "ChangeMe!2026";
let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  · " + extra : ""}`); if (!ok) failures++; };

async function login(email) {
  const r = await fetch(`${base}/api/auth/sign-in/email`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ email, password }) });
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  return { ok: r.ok, cookie };
}
const get = (path, cookie, extra = {}) => fetch(base + path, { headers: { ...(cookie ? { Cookie: cookie } : {}), ...extra }, redirect: "manual" });

const health = await get("/api/health");
check("health endpoint", health.ok, JSON.stringify(await health.json().catch(() => ({}))));

const admin = await login("admin@rms.local");
check("admin login (Better Auth credentials)", admin.ok && admin.cookie.includes("session_token"));

const s = await (await get("/api/v1/records?q=wellness%20leave", admin.cookie)).json();
check("full-text search returns hits", s.total > 0, `${s.total} hit(s) in ${s.tookMs} ms`);
check("search snippet is highlighted", s.hits?.some((h) => h.snippet?.includes("⟦")), s.hits?.[0]?.snippet?.slice(0, 90));
const fuzzy = await (await get("/api/v1/records?q=welness", admin.cookie)).json();
check("fuzzy (typo) search", fuzzy.total > 0, `${fuzzy.total} hit(s)`);

// Upload flow: create record → upload PDF (fresh bytes) → duplicate upload rejected
const samplePath = process.env.SAMPLE_PDF;
if (samplePath) {
  const created = await fetch(`${base}/api/v1/records`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: admin.cookie, Origin: base },
    body: JSON.stringify({ title: `SAMPLE verify upload ${new Date().toISOString()}`, recordType: "memorandum_circular", classificationId: "LEG-MC", officeId: "CO", sensitivity: "internal", isSample: true, keywords: ["verify"] }) });
  const rec = await created.json();
  check("create record via API", created.status === 201, rec.recordNo);
  const bytes = Buffer.concat([readFileSync(samplePath), Buffer.from(`\n%rms-verify ${Date.now()}\n`)]);
  const fd = new FormData(); fd.append("file", new Blob([bytes], { type: "application/pdf" }), basename(samplePath));
  const up = await fetch(`${base}/api/v1/records/${rec.id}/files`, { method: "POST", headers: { Cookie: admin.cookie, Origin: base }, body: fd });
  check("upload PDF", up.status === 201, `status ${up.status}`);
  const fd2 = new FormData(); fd2.append("file", new Blob([bytes], { type: "application/pdf" }), basename(samplePath));
  const dup = await fetch(`${base}/api/v1/records/${rec.id}/files`, { method: "POST", headers: { Cookie: admin.cookie, Origin: base }, body: fd2 });
  check("duplicate upload detected (SHA-256)", dup.status === 409, `status ${dup.status}`);
  const pages = await fetch(`${base}/api/v1/records/${rec.id}/pages`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: admin.cookie, Origin: base },
    body: JSON.stringify({ engine: "verify-script", textLayer: "born_digital", pages: [{ pageNo: 1, text: "Verification page mentioning zyxwvutsrq marker" }] }) });
  check("index page text", pages.ok);
  const find = await (await get("/api/v1/records?q=zyxwvutsrq", admin.cookie)).json();
  check("uploaded text is searchable", find.hits?.some((h) => h.id === rec.id));
}

// RBAC
const restricted = await (await get("/api/v1/records?sensitivity=restricted&pageSize=1", admin.cookie)).json();
const rid = restricted.hits?.[0]?.id;
const emp = await login("employee@rms.local");
check("employee login", emp.ok);
if (rid) {
  const r = await get(`/api/v1/records/${rid}`, emp.cookie);
  check("employee blocked from restricted record", r.status === 404, `status ${r.status}`);
  const a = await get(`/api/v1/records/${rid}`, admin.cookie);
  check("admin can read restricted record", a.status === 200);
}
const empSearch = await (await get("/api/v1/records?sensitivity=restricted", emp.cookie)).json();
check("employee search excludes restricted", empSearch.total === 0, `${empSearch.total}`);
check("employee cannot export", (await get("/api/v1/export", emp.cookie)).status === 403);
// Pages stream (PPR), so a notFound() inside Suspense keeps HTTP 200: check the content instead.
const usersEmp = await (await get("/users", emp.cookie)).text();
const usersAdmin = await (await get("/users", admin.cookie)).text();
check("employee cannot open /users (RBAC page guard)", !usersEmp.includes("Permission matrix") && usersAdmin.includes("Permission matrix"));
const pub = await login("public@rms.local");
const pd = await get("/dashboard", pub.cookie);
check("public user redirected to portal", [307, 308, 303].includes(pd.status) && pd.headers.get("location")?.includes("/portal") || (await pd.text()).includes("/portal"), `status ${pd.status}`);
check("anonymous API call rejected", (await get("/api/v1/records")).status === 401);
check("anonymous staff page redirects to login", (await get("/dashboard")).headers.get("location")?.includes("/login"));
check("worker API without token → 401", (await fetch(`${base}/api/worker/jobs/claim`, { method: "POST" })).status === 401);
check("worker API with wrong token → 401", (await fetch(`${base}/api/worker/jobs/claim`, { method: "POST", headers: { Authorization: "Bearer not-the-right-token-123456" } })).status === 401);
const portal = await get("/portal?q=leave");
check("public portal reachable anonymously", portal.status === 200);

// Last sign-in attempt: Better Auth allows 5 sign-ins / 60 s per IP (sliding).
const bad = await fetch(`${base}/api/auth/sign-in/email`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ email: "admin@rms.local", password: "wrong-password-123" }) });
check("wrong password rejected", [400, 401, 403, 429].includes(bad.status), `status ${bad.status}`);

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
