"use client";
/* Browser-side intake helpers: hashing, PDF text-layer detection (pdf.js) and free OCR (tesseract.js eng+fil). */
import { classifyDocument, type DocVerdict } from "@/lib/ocr/text-quality";

export async function sha256File(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function pdfjs() {
  const lib = await import("pdfjs-dist");
  lib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
  return lib;
}

export type Analysis = {
  kind: "pdf" | "image" | "other";
  pageCount: number;
  verdict: DocVerdict | "image_only";
  pages: string[]; // extracted text-layer text (PDF)
  badPages: number[];
  estDpi: number | null;
  sampled: number;
};

const MAX_SAMPLE = 30;

export async function analyzeFile(file: File): Promise<Analysis> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const n = doc.numPages;
    const texts: string[] = [];
    const scanned: boolean[] = [];
    let estDpi: number | null = null;
    const imageOps = new Set([lib.OPS.paintImageXObject, lib.OPS.paintInlineImageXObject, lib.OPS.paintImageMaskXObject]);
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      texts.push(tc.items.map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : "")).join(""));
      if (i <= MAX_SAMPLE) {
        const ops = await page.getOperatorList();
        const hasImg = ops.fnArray.some((f) => imageOps.has(f));
        scanned.push(hasImg);
        if (hasImg && estDpi == null) {
          // Estimate scan resolution from the largest image painted on the first scanned page
          const idx = ops.fnArray.findIndex((f) => f === lib.OPS.paintImageXObject);
          const name = idx >= 0 ? (ops.argsArray[idx]?.[0] as string) : null;
          if (name) {
            const img = await new Promise<{ width: number } | null>((res) => { try { page.objs.get(name, (o: { width: number }) => res(o)); } catch { res(null); } setTimeout(() => res(null), 1500); });
            const widthIn = page.view[2] / 72;
            if (img?.width && widthIn) estDpi = Math.round(img.width / widthIn);
          }
        }
      }
      page.cleanup();
    }
    const c = classifyDocument(texts.slice(0, MAX_SAMPLE), scanned);
    await doc.destroy();
    return { kind: "pdf", pageCount: n, verdict: c.verdict, pages: texts, badPages: c.badPages, estDpi, sampled: Math.min(n, MAX_SAMPLE) };
  }
  if (file.type.startsWith("image/")) {
    let estDpi: number | null = null;
    if (file.type !== "image/tiff") {
      const bmp = await createImageBitmap(file).catch(() => null);
      if (bmp) { estDpi = Math.round(Math.min(bmp.width, bmp.height) / 8.27); bmp.close(); } // A4 short side 8.27 in
    }
    return { kind: "image", pageCount: 1, verdict: "image_only", pages: [""], badPages: [1], estDpi, sampled: 1 };
  }
  return { kind: "other", pageCount: 0, verdict: "image_only", pages: [], badPages: [], estDpi: null, sampled: 0 };
}

/** Suggest metadata from the first page text (document no., subject/title, date). */
export function suggestMetadata(text: string) {
  const t = text.replace(/\s+/g, " ");
  const out: { documentNumber?: string; title?: string; dateCreated?: string; recordType?: string } = {};
  const mc = /M(?:emorandum)?\.?\s*C(?:ircular)?\.?\s*No\.?[_\s,:]*(\d{1,3})\s*,?\s*s(?:eries)?\.?\s*(?:of\s*)?((?:19|20)\d{2})/i.exec(t)
    ?? /(\d{1,3})\s*s\.\s*((?:19|20)\d{2})\s*MC No/i.exec(t);
  const res = /Resolution\s*No\.?\s*:?\s*(\d{6,8})/i.exec(t) ?? /Number\s+(\d{7})/i.exec(t);
  if (mc) { out.documentNumber = `MC No. ${mc[1].padStart(2, "0")}, s. ${mc[2]}`; out.recordType = "memorandum_circular"; }
  else if (/MEMORANDUM CIRCULAR/.test(t.slice(0, 600))) out.recordType = "memorandum_circular";
  else if (res) { out.documentNumber = `Resolution No. ${res[1]}`; out.recordType = "policy_resolution"; }
  else if (/sworn statement of assets/i.test(t)) out.recordType = "saln";
  else if (/personal data sheet/i.test(t)) out.recordType = "pds";
  else if (/panunumpa|oath of office/i.test(t)) out.recordType = "oath_of_office";
  else if (/assumption to duty/i.test(t)) out.recordType = "assumption_certificate";
  else if (/list of passers/i.test(t)) out.recordType = "list_of_passers";
  const subj = /SUBJECT\s*:\s*(.{5,140}?)(?:\s{2,}|Pursuant|WHEREAS|$)/i.exec(t);
  if (subj) out.title = subj[1].trim();
  const months = "January|February|March|April|May|June|July|August|September|October|November|December";
  const d = new RegExp(`(\\d{1,2})\\s+(${months})\\s+((?:19|20)\\d{2})|(${months})\\s+(\\d{1,2}),?\\s+((?:19|20)\\d{2})`, "i").exec(t);
  if (d) {
    const [day, mon, yr] = d[1] ? [d[1], d[2], d[3]] : [d[5], d[4], d[6]];
    const m = months.split("|").findIndex((x) => x.toLowerCase() === mon.toLowerCase()) + 1;
    out.dateCreated = `${yr}-${String(m).padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return out;
}

type OcrProgress = (p: { page: number; total: number; status: string; progress: number }) => void;

/** Free OCR in the browser. Files never leave the device for OCR; only the language model is downloaded. */
export async function ocrInBrowser(file: File, pageCount: number, onProgress: OcrProgress, onlyPages?: number[]) {
  const Tesseract = await import("tesseract.js");
  let current = 0;
  const total = onlyPages?.length || pageCount;
  const worker = await Tesseract.createWorker(["eng", "fil"], Tesseract.OEM.LSTM_ONLY, {
    workerPath: "/vendor/tesseract/worker.min.js",
    corePath: "/vendor/tesseract/core",
    ...(process.env.NEXT_PUBLIC_TESSDATA_URL ? { langPath: process.env.NEXT_PUBLIC_TESSDATA_URL } : {}),
    logger: (m: { status: string; progress: number }) => onProgress({ page: current, total, status: m.status, progress: m.progress }),
  });
  const results: { pageNo: number; text: string; confidence: number }[] = [];
  try {
    if (file.type.startsWith("image/")) {
      current = 1;
      const { data } = await worker.recognize(file);
      results.push({ pageNo: 1, text: data.text, confidence: data.confidence });
    } else {
      const lib = await pdfjs();
      const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const pages = onlyPages?.length ? onlyPages : Array.from({ length: doc.numPages }, (_, i) => i + 1);
      for (const pn of pages) {
        current = pn;
        const page = await doc.getPage(pn);
        const vp = page.getViewport({ scale: 3 }); // ≈216 dpi
        const canvas = document.createElement("canvas");
        canvas.width = vp.width;
        canvas.height = vp.height;
        await page.render({ canvas, viewport: vp }).promise;
        const { data } = await worker.recognize(canvas);
        results.push({ pageNo: pn, text: data.text, confidence: data.confidence });
        canvas.width = canvas.height = 0;
        page.cleanup();
      }
      await doc.destroy();
    }
  } finally {
    await worker.terminate();
  }
  return results;
}
