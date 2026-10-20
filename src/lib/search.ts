import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { accessFilter, mustMaskPII, type Actor } from "@/lib/rbac";
import { maskPII } from "@/lib/pii";
import { recordTypeEnum, sensitivityEnum, recordStatus, textLayerEnum, planCategory } from "@/db/schema";

export type SearchParams = {
  q?: string;
  type?: string;
  category?: string;
  classification?: string;
  office?: string;
  sensitivity?: string;
  status?: string;
  textLayer?: string;
  yearFrom?: number;
  yearTo?: number;
  sort?: "relevance" | "newest" | "oldest" | "title";
  page?: number;
  pageSize?: number;
};

export type SearchHit = {
  id: string;
  recordNo: string;
  title: string;
  documentNumber: string | null;
  recordType: string;
  sensitivity: string;
  status: string;
  textLayer: string;
  dateCreated: string | null;
  officeName: string | null;
  officeCode: string | null;
  classificationCode: string | null;
  classificationName: string | null;
  pageCount: number;
  containsPii: boolean;
  isSample: boolean;
  ocrConfidence: number | null;
  score: number | null;
  hitPage: number | null;
  snippet: string | null;
};

export { HL_START, HL_END } from "@/lib/search-markers";
import { HL_START, HL_END } from "@/lib/search-markers";

const SORTS: Record<string, SQL> = {
  newest: sql`r.date_created DESC NULLS LAST, r.created_at DESC`,
  oldest: sql`r.date_created ASC NULLS LAST, r.created_at ASC`,
  title: sql`r.title ASC`,
};

function filters(p: SearchParams, alias: string): SQL[] {
  const a = sql.raw(alias);
  const w: SQL[] = [];
  if (p.type) w.push(sql`${a}.record_type = ${p.type}::record_type`);
  if (p.sensitivity) w.push(sql`${a}.sensitivity = ${p.sensitivity}::sensitivity`);
  if (p.status) w.push(sql`${a}.status = ${p.status}::record_status`);
  if (p.textLayer) w.push(sql`${a}.text_layer = ${p.textLayer}::text_layer`);
  if (p.office) w.push(sql`${a}.office_id = ${p.office}`);
  if (p.classification) w.push(sql`${a}.classification_id IN (SELECT id FROM classifications WHERE id = ${p.classification} OR parent_id = ${p.classification})`);
  if (p.category) w.push(sql`${a}.classification_id IN (SELECT id FROM classifications WHERE category = ${p.category}::plan_category)`);
  if (p.yearFrom) w.push(sql`${a}.date_created >= make_date(${p.yearFrom}::int, 1, 1)`);
  if (p.yearTo) w.push(sql`${a}.date_created < make_date(${p.yearTo}::int + 1, 1, 1)`);
  return w;
}

const and = (parts: SQL[]) => sql.join(parts.length ? parts : [sql`TRUE`], sql` AND `);

export async function searchRecords(actor: Actor, p: SearchParams): Promise<{ hits: SearchHit[]; total: number; page: number; pageSize: number; tookMs: number }> {
  const t0 = performance.now();
  const pageSize = Math.min(Math.max(p.pageSize ?? 25, 1), 100);
  const page = Math.max(p.page ?? 1, 1);
  const offset = (page - 1) * pageSize;
  const q = p.q?.trim().slice(0, 300);
  const rWhere = and([accessFilter(actor, "r"), ...filters(p, "r")]);

  const baseCols = sql`r.id, r.record_no AS "recordNo", r.title, r.document_number AS "documentNumber", r.record_type AS "recordType",
    r.sensitivity, r.status, r.text_layer AS "textLayer", to_char(r.date_created, 'YYYY-MM-DD') AS "dateCreated",
    o.name AS "officeName", o.code AS "officeCode", c.code AS "classificationCode", c.name AS "classificationName",
    r.page_count AS "pageCount", r.contains_pii AS "containsPii", r.is_sample AS "isSample", r.ocr_confidence AS "ocrConfidence"`;

  let rows: (SearchHit & { total: string })[];
  if (!q) {
    const order = SORTS[p.sort ?? "newest"] ?? SORTS.newest;
    const res = await db.execute(sql`
      SELECT ${baseCols}, NULL::real AS score, NULL::int AS "hitPage", NULL::text AS snippet, count(*) OVER() AS total
      FROM records r
      LEFT JOIN offices o ON o.id = r.office_id
      LEFT JOIN classifications c ON c.id = r.classification_id
      WHERE ${rWhere}
      ORDER BY ${order}
      LIMIT ${pageSize} OFFSET ${offset}`);
    rows = res.rows as typeof rows;
  } else {
    const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    const pWhere = and([accessFilter(actor, "r2"), ...filters(p, "r2")]);
    const order = p.sort && p.sort !== "relevance" ? SORTS[p.sort] : sql`c2.score DESC, r.date_created DESC NULLS LAST`;
    const opts = `StartSel=${HL_START},StopSel=${HL_END},MaxWords=30,MinWords=12,MaxFragments=2,FragmentDelimiter=" … "`;
    const res = await db.execute(sql`
      WITH q AS (SELECT websearch_to_tsquery('english', ${q}) || websearch_to_tsquery('simple', ${q}) AS tq),
      page_hits AS (
        SELECT DISTINCT ON (p.record_id) p.record_id, p.page_no, ts_rank_cd(p.tsv, q.tq) AS prank
        FROM record_pages p
        JOIN records r2 ON r2.id = p.record_id
        CROSS JOIN q
        WHERE p.tsv @@ q.tq AND ${pWhere}
        ORDER BY p.record_id, ts_rank_cd(p.tsv, q.tq) DESC
      ),
      cand AS (
        SELECT r.id,
          coalesce(ts_rank_cd(r.search_tsv, q.tq), 0) * 4
          + coalesce(ph.prank, 0)
          + greatest(word_similarity(${q}, r.title), word_similarity(${q}, coalesce(r.document_number, '')),
                     word_similarity(${q}, coalesce(r.subject_name, ''))) * 1.5 AS score,
          ph.page_no AS hit_page,
          count(*) OVER() AS total
        FROM records r
        CROSS JOIN q
        LEFT JOIN page_hits ph ON ph.record_id = r.id
        WHERE ${rWhere} AND (
          r.search_tsv @@ q.tq OR ph.record_id IS NOT NULL
          OR ${q} <% r.title OR ${q} <% r.document_number OR ${q} <% r.subject_name
          OR r.record_no ILIKE ${like} OR r.document_number ILIKE ${like}
        )
      ),
      top AS (
        SELECT c2.*, r.description FROM cand c2 JOIN records r ON r.id = c2.id
        ORDER BY ${order}
        LIMIT ${pageSize} OFFSET ${offset}
      )
      SELECT ${baseCols}, t.score::real AS score, t.hit_page AS "hitPage", t.total,
        CASE WHEN t.hit_page IS NOT NULL THEN
          (SELECT ts_headline('english', left(pg.text, 30000), q.tq, ${opts}) FROM record_pages pg WHERE pg.record_id = t.id AND pg.page_no = t.hit_page)
        ELSE ts_headline('english', coalesce(nullif(t.description, ''), r.title), q.tq, ${opts}) END AS snippet
      FROM top t
      JOIN records r ON r.id = t.id
      CROSS JOIN q
      LEFT JOIN offices o ON o.id = r.office_id
      LEFT JOIN classifications c ON c.id = r.classification_id
      ORDER BY t.score DESC`);
    rows = res.rows as typeof rows;
    if (p.sort && p.sort !== "relevance") {
      // preserve requested sort for the final page
      const key = p.sort;
      rows.sort((x, y) => key === "title" ? x.title.localeCompare(y.title) : key === "oldest" ? String(x.dateCreated).localeCompare(String(y.dateCreated)) : String(y.dateCreated).localeCompare(String(x.dateCreated)));
    }
  }
  const total = rows.length ? Number(rows[0].total) : 0;
  const mask = mustMaskPII(actor);
  const hits = rows.map(({ total: _t, ...h }) => {
    void _t;
    const snippet = h.snippet ? focusSnippet(h.snippet) : h.snippet;
    return { ...h, snippet: snippet && mask ? maskPII(snippet) : snippet };
  });
  return { hits, total, page, pageSize, tookMs: Math.round(performance.now() - t0) };
}

/** Collapses whitespace and starts the snippet shortly before the first highlight so it survives line clamping. */
function focusSnippet(s: string) {
  const t = s.replace(/\s+/g, " ").trim();
  const i = t.indexOf(HL_START);
  if (i <= 70) return t;
  const cut = t.lastIndexOf(" ", i - 45);
  return "… " + t.slice(cut > 0 ? cut + 1 : i - 45);
}

export function parseSearchParams(sp: Record<string, string | string[] | undefined> | URLSearchParams): SearchParams {
  const get = (k: string) => {
    const v = sp instanceof URLSearchParams ? sp.get(k) : sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() ? s.trim() : undefined;
  };
  const num = (k: string) => {
    const v = get(k);
    const n = v ? parseInt(v, 10) : NaN;
    return Number.isFinite(n) ? n : undefined;
  };
  const allowed = (v: string | undefined, re: RegExp) => (v && re.test(v) ? v : undefined);
  const oneOf = (v: string | undefined, list: readonly string[]) => (v && list.includes(v) ? v : undefined);
  return {
    q: get("q"),
    type: oneOf(get("type"), recordTypeEnum.enumValues),
    category: oneOf(get("category"), planCategory.enumValues),
    classification: allowed(get("classification"), /^[A-Za-z0-9_-]{1,40}$/),
    office: allowed(get("office"), /^[A-Za-z0-9_-]{1,40}$/),
    sensitivity: oneOf(get("sensitivity"), sensitivityEnum.enumValues),
    status: oneOf(get("status"), recordStatus.enumValues),
    textLayer: oneOf(get("textLayer"), textLayerEnum.enumValues),
    yearFrom: num("yearFrom"),
    yearTo: num("yearTo"),
    sort: (["relevance", "newest", "oldest", "title"] as const).find((s) => s === get("sort")),
    page: num("page"),
    pageSize: num("pageSize"),
  };
}
