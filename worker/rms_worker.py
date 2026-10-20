#!/usr/bin/env python3
"""
CSC RMS OCR worker.

Polls the RMS job queue (pull model: no inbound firewall rules needed), downloads each scanned or
garbled original, OCRs it with Tesseract (eng+fil; "fil" = Filipino) page by page to obtain text *and* word
confidences, optionally produces a searchable PDF/A-2b access copy with OCRmyPDF, and posts the
results back. Low-confidence pages can get an optional PaddleOCR second opinion.

Environment:
  RMS_URL             https://your-rms.example.gov.ph   (required)
  WORKER_TOKEN        shared secret, same as the app's WORKER_TOKEN (required)
  WORKER_ID           name shown in the queue (default: hostname)
  OCR_LANGS           default "eng+fil" (unavailable languages are dropped with a warning)
  OCR_DPI             rasterisation DPI for OCR (default 300)
  MAKE_PDFA           1 = upload OCRmyPDF PDF/A access copy (default 1)
  PADDLE_SECOND_PASS  1 = re-OCR pages below LOW_CONF with PaddleOCR if installed (default 0)
  LOW_CONF            confidence threshold for second pass (default 70)
  POLL_SECONDS        idle poll interval (default 10)
  ONCE                1 = process the queue until empty, then exit (cron / CI)
"""
from __future__ import annotations

import csv
import io
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

RMS_URL = os.environ.get("RMS_URL", "").rstrip("/")
TOKEN = os.environ.get("WORKER_TOKEN", "")
WORKER_ID = os.environ.get("WORKER_ID", socket.gethostname())[:64]
DPI = int(os.environ.get("OCR_DPI", "300"))
MAKE_PDFA = os.environ.get("MAKE_PDFA", "1") == "1"
PADDLE = os.environ.get("PADDLE_SECOND_PASS", "0") == "1"
LOW_CONF = float(os.environ.get("LOW_CONF", "70"))
POLL = int(os.environ.get("POLL_SECONDS", "10"))
ONCE = os.environ.get("ONCE", "0") == "1"
MAX_ARTIFACT = int(os.environ.get("MAX_ARTIFACT_MB", "4")) * 1024 * 1024  # Vercel request body limit is 4.5 MB


def log(*a):
    print(time.strftime("%Y-%m-%dT%H:%M:%S%z"), *a, flush=True)


def api(method: str, path: str, body: bytes | dict | None = None, ctype: str = "application/json", raw: bool = False):
    data = json.dumps(body).encode() if isinstance(body, dict) else body
    req = urllib.request.Request(RMS_URL + path, data=data, method=method, headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": ctype, "User-Agent": f"rms-worker/{WORKER_ID}"})
    with urllib.request.urlopen(req, timeout=600) as r:
        payload = r.read()
        return payload if raw else json.loads(payload or b"{}")


def available_langs(requested: str) -> str:
    out = subprocess.run(["tesseract", "--list-langs"], capture_output=True, text=True).stdout.split()
    have = [l for l in requested.split("+") if l in out]
    missing = [l for l in requested.split("+") if l not in out]
    if missing:
        log("WARNING: tesseract languages not installed:", ",".join(missing))
    return "+".join(have) or "eng"


def run(cmd: list[str], **kw):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw)


def to_pdf(src: Path, mime: str, work: Path) -> Path:
    """Images are wrapped into a PDF so every path below handles one format."""
    if mime == "application/pdf":
        return src
    out = work / "input.pdf"
    run(["img2pdf", str(src), "-o", str(out)]) if shutil.which("img2pdf") else run(["convert", str(src), str(out)])
    return out


def page_count(pdf: Path) -> int:
    info = run(["pdfinfo", str(pdf)]).stdout
    for line in info.splitlines():
        if line.startswith("Pages:"):
            return int(line.split()[1])
    return 0


def tesseract_page(png: Path, langs: str) -> tuple[str, float | None]:
    """Returns (text, mean word confidence 0–100) from Tesseract TSV output."""
    tsv = run(["tesseract", str(png), "stdout", "-l", langs, "--psm", "3", "tsv"]).stdout
    lines: dict[tuple, list[str]] = {}
    confs: list[float] = []
    for row in csv.DictReader(io.StringIO(tsv), delimiter="\t", quoting=csv.QUOTE_NONE):
        if row.get("level") != "5":
            continue
        word = (row.get("text") or "").strip()
        conf = float(row.get("conf") or -1)
        if not word or conf < 0:
            continue
        key = (int(row["block_num"]), int(row["par_num"]), int(row["line_num"]))
        lines.setdefault(key, []).append(word)
        confs.append(conf)
    text, prev = [], None
    for key in sorted(lines):
        if prev and key[:2] != prev[:2]:
            text.append("")  # paragraph break
        text.append(" ".join(lines[key]))
        prev = key
    return "\n".join(text), (sum(confs) / len(confs) if confs else None)


_paddle = None


def paddle_page(png: Path) -> tuple[str, float | None]:
    global _paddle
    if _paddle is None:
        from paddleocr import PaddleOCR  # type: ignore  # optional dependency
        _paddle = PaddleOCR(lang="en", use_textline_orientation=True)
    res = _paddle.predict(str(png))
    texts, scores = [], []
    for r in res:
        texts += list(r.get("rec_texts", []))
        scores += list(r.get("rec_scores", []))
    return "\n".join(texts), (100 * sum(scores) / len(scores) if scores else None)


def process(job: dict, langs: str):
    jid = job["id"]
    with tempfile.TemporaryDirectory(prefix="rms-") as tmp:
        work = Path(tmp)
        src = work / ("source" + Path(job["file"]["filename"]).suffix.lower())
        src.write_bytes(api("GET", job["sourceUrl"], raw=True))
        pdf = to_pdf(src, job["file"]["mime_type"], work)
        n = page_count(pdf)
        log(f"job {jid}: {n} page(s), mode={job['mode']}, langs={langs}")
        pages, low = [], 0
        for i in range(1, n + 1):
            prefix = work / f"p{i}"
            run(["pdftoppm", "-r", str(DPI), "-gray", "-png", "-f", str(i), "-l", str(i), "-singlefile", str(pdf), str(prefix)])
            png = prefix.with_suffix(".png")
            text, conf = tesseract_page(png, langs)
            engine = "tesseract5"
            if PADDLE and (conf is None or conf < LOW_CONF):
                try:
                    p_text, p_conf = paddle_page(png)
                    if p_conf is not None and (conf is None or p_conf > conf):
                        text, conf, engine = p_text, p_conf, "paddleocr"
                except Exception as e:  # noqa: BLE001
                    log(f"paddle second pass unavailable: {e}")
            if conf is not None and conf < LOW_CONF:
                low += 1
            pages.append({"pageNo": i, "text": text, "confidence": round(conf, 1) if conf is not None else None})
            png.unlink(missing_ok=True)

        if MAKE_PDFA and shutil.which("ocrmypdf"):
            out = work / "access.pdf"
            mode = {"redo_ocr": "--redo-ocr", "force_ocr": "--force-ocr"}.get(job["mode"], "--skip-text")
            try:
                run(["ocrmypdf", mode, "--output-type", "pdfa-2", "-l", langs, "--rotate-pages", "--deskew" if mode != "--redo-ocr" else "--clean", "--optimize", "1", "--jobs", "2", str(pdf), str(out)])
                size = out.stat().st_size
                if size <= MAX_ARTIFACT:
                    api("PUT", f"/api/worker/jobs/{jid}/artifact", out.read_bytes(), "application/pdf")
                else:
                    log(f"job {jid}: PDF/A is {size // 1024} KB > limit, not uploaded (store via shared storage instead)")
            except subprocess.CalledProcessError as e:
                log(f"job {jid}: ocrmypdf failed (text still indexed): {e.stderr[-400:]}")

        engine_label = "tesseract5+paddleocr" if PADDLE else "tesseract5"
        res = api("POST", f"/api/worker/jobs/{jid}/complete", {
            "engine": f"{engine_label}-{langs}", "pages": pages,
            "stats": {"worker": WORKER_ID, "dpi": DPI, "lowConfidencePages": low},
        })
        log(f"job {jid}: done → record status {res.get('record', {}).get('status')}, avg conf {res.get('record', {}).get('ocrConfidence')}")


def main():
    if not RMS_URL or len(TOKEN) < 16:
        sys.exit("Set RMS_URL and WORKER_TOKEN (≥16 chars).")
    for tool in ("tesseract", "pdftoppm", "pdfinfo"):
        if not shutil.which(tool):
            sys.exit(f"Missing dependency: {tool}")
    langs = available_langs(os.environ.get("OCR_LANGS", "eng+fil"))
    log(f"worker {WORKER_ID} polling {RMS_URL} (langs={langs}, pdfa={MAKE_PDFA and bool(shutil.which('ocrmypdf'))}, paddle={PADDLE})")
    while True:
        try:
            jobs = api("POST", "/api/worker/jobs/claim", {"workerId": WORKER_ID, "limit": 1, "leaseSeconds": 1800}).get("jobs", [])
        except urllib.error.URLError as e:
            log("claim failed:", e)
            jobs = []
        if not jobs:
            if ONCE:
                log("queue empty, exiting")
                return
            time.sleep(POLL)
            continue
        for job in jobs:
            try:
                process(job, langs)
            except Exception as e:  # noqa: BLE001
                msg = getattr(e, "stderr", None) or str(e)
                log(f"job {job['id']} failed: {msg[-500:]}")
                try:
                    api("POST", f"/api/worker/jobs/{job['id']}/fail", {"error": str(msg)[-2000:]})
                except Exception as e2:  # noqa: BLE001
                    log("could not report failure:", e2)


if __name__ == "__main__":
    main()
