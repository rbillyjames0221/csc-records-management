/** Masks common Philippine personal identifiers before showing text to public viewers (RA 10173). */
const PATTERNS: [RegExp, string][] = [
  [/\b\d{3}[- ]?\d{3}[- ]?\d{3}(?:[- ]?\d{3,5})?\b/g, "[TIN/ID REDACTED]"], // TIN 123-456-789(-000)
  [/\b(?:\+?63|0)9\d{2}[- ]?\d{3}[- ]?\d{4}\b/g, "[MOBILE REDACTED]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[EMAIL REDACTED]"],
  [/\b\d{2}-\d{7}-\d\b/g, "[SSS REDACTED]"],
  [/\b\d{2}-\d{9}-\d\b/g, "[PHILHEALTH REDACTED]"],
  [/\b\d{4}-\d{4}-\d{4}\b/g, "[PAG-IBIG REDACTED]"],
  [/\b(?:birth\s*date|date\s*of\s*birth|kapanganakan)\s*[:\-]?\s*[\w ,./-]{6,20}/gi, "[BIRTH DATE REDACTED]"],
];

export function maskPII(text: string): string {
  let out = text;
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out;
}
