FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends \
      ocrmypdf tesseract-ocr tesseract-ocr-eng poppler-utils img2pdf ghostscript python3 curl ca-certificates \
    && TESSDATA=$(dirname "$(find /usr/share/tesseract-ocr -name eng.traineddata | head -1)") \
    && curl -fsSL -o "$TESSDATA/fil.traineddata" https://github.com/tesseract-ocr/tessdata_fast/raw/main/fil.traineddata \
    && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
RUN useradd --system --uid 10001 worker
WORKDIR /app
COPY rms_worker.py .
USER worker
CMD ["python3", "/app/rms_worker.py"]
