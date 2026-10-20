// Copies browser-side OCR/PDF assets into /public so nothing is loaded from third-party CDNs at runtime
// (except Tesseract language models, configurable with NEXT_PUBLIC_TESSDATA_URL).
import { cpSync, mkdirSync } from "node:fs";
const copies = [
  ["node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/vendor/pdfjs/pdf.worker.min.mjs"],
  ["node_modules/tesseract.js/dist/worker.min.js", "public/vendor/tesseract/worker.min.js"],
  ...["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"].map((f) => [`node_modules/tesseract.js-core/${f}`, `public/vendor/tesseract/core/${f}`]),
];
for (const [from, to] of copies) {
  mkdirSync(to.slice(0, to.lastIndexOf("/")), { recursive: true });
  cpSync(from, to);
}
console.log(`copied ${copies.length} browser assets to public/vendor`);
