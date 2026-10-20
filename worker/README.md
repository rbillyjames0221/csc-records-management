# RMS OCR worker

Pull-based OCR worker for scanned and garbled records. Runs **inside the CSC network** (recommended for
RA 10173 data) and talks to the RMS only over outbound HTTPS, so no inbound firewall rules are needed.

Pipeline per job:

1. `POST /api/worker/jobs/claim` — claims a job (Postgres `FOR UPDATE SKIP LOCKED`, 30-minute lease; a crashed worker's job is re-claimed automatically).
2. `GET /api/worker/jobs/{id}/source` — downloads the original.
3. Each page is rasterised at 300 dpi (`pdftoppm`) and OCR'd with **Tesseract 5** (`eng+fil`), producing text plus mean word confidence from TSV output.
4. Optional: pages below `LOW_CONF` are re-OCR'd with **PaddleOCR** when installed (`PADDLE_SECOND_PASS=1`); the higher-confidence result wins.
5. Optional (default on): **OCRmyPDF** builds a searchable **PDF/A-2b** access copy (`--skip-text`, `--redo-ocr` for garbled text layers, `--force-ocr` on request) and uploads it with `PUT /api/worker/jobs/{id}/artifact`.
6. `POST /api/worker/jobs/{id}/complete` — page text and confidences are indexed; pages below the app's `OCR_REVIEW_THRESHOLD` go to the QA queue.
   Failures call `/fail`, which re-queues up to 3 attempts.

## Run

```bash
docker build -t rms-ocr-worker .
docker run --rm -e RMS_URL=https://<your-app> -e WORKER_TOKEN=<same as app> rms-ocr-worker
# scale out: run more containers – the queue is safe for concurrent workers
```

Without Docker (Debian/Ubuntu): `apt install ocrmypdf tesseract-ocr tesseract-ocr-eng poppler-utils img2pdf`,
add `fil.traineddata` from [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) to the tessdata folder, then
`RMS_URL=… WORKER_TOKEN=… python3 rms_worker.py`. Set `ONCE=1` to drain the queue and exit (cron).

## Notes

- Confidence comes from a dedicated Tesseract pass; the OCRmyPDF pass is only for the PDF/A file. Turn it off with `MAKE_PDFA=0` to halve CPU time when access copies are not needed.
- Vercel limits request bodies to 4.5 MB, so PDF/A files above `MAX_ARTIFACT_MB` (default 4) are not uploaded through the API. For production, give the worker write access to the same object storage (or self-host the app on-prem) for large access copies.
- Filipino (`fil`, the LSTM-era replacement for the old `tgl` model) is a `tessdata_fast` model; for 1990s typewritten circulars, `eng` alone is often as good. Measure on your own samples.
