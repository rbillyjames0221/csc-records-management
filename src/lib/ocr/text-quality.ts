/**
 * Text-layer quality heuristics shared by the browser (pdf.js) and the seed/worker tooling.
 * Classifies each page as empty / good / garbled, then the document as
 * born_digital | image_only | garbled | mixed.
 */

// ~400 very common English + Filipino words plus civil-service vocabulary.
const WORDS = `the of and to in a is that for it as was with be by on not he this are or his from at which but have an they you were
her she there been one all we their has would when if so no will more can said who what up its about into than them only other new some
could time these two may then do first any my now such like our over man me even most made after also did many before must through back
years where much your way well down should because each just those how too little state good very make world still own see men work long get
here between both life being under never day same another know while last might us great old year off come since against go came right used
take three shall section rule commission civil service office government employee employees officer public memorandum circular resolution
pursuant hereby policy policies provided provisions effective date issued approved agency agencies personnel position appointment
leave leaves benefits salary performance guidelines implementation rules regulations amended amendment republic act order executive
chairperson commissioner national regional director attest secretary whereas resolved date series nos number accordance subject
following including within upon such shall all applicable purpose coverage statement assets liabilities net worth examination eligibility
passers list career professional subprofessional board decision case appeal complaint respondent petitioner granted denied
ang ng sa mga na at ay ito para kung hindi siya ako ikaw kami kayo sila may wala pa lamang din rin naman ni nina kay kina
upang dahil bilang tungkol ayon pamahalaan kawani tanggapan katungkulan panunumpa kalihim komisyon serbisyo sibil
taon araw buwan opisina lingkod bayan karapatan tungkulin batas kautusan pinuno pangulo republika pilipinas ako'y
sumusumpa tapat tutuparin ipagtatanggol saligang susundin`.split(/\s+/);
const DICT = new Set(WORDS);

export type PageQuality = { chars: number; tokens: number; dictRatio: number; junkRatio: number; avgLen: number; noiseRatio: number; verdict: "empty" | "good" | "garbled" };

// Typical OCR-error tokens: letters mixed with digits/symbols ("9$26{1", "welJare", "Phtltpptnes", "lmplementing").
const NOISE = [/\p{L}[\d$\{\}|\\@#^~]|[\d$\{\}|\\@#^~]\p{L}/u, /\p{Ll}\p{Lu}/u, /^l[bcdfghjkmnpqrstvwxz]/u, /(?:tlt|ltp|pptn|vv)/u];

/** @param scanned true when the page is dominated by a raster image (i.e. the text is an OCR layer). */
export function pageQuality(text: string, scanned = false): PageQuality {
  const clean = text.replace(/\s+/g, " ").trim();
  const chars = clean.replace(/\s/g, "").length;
  if (chars < 25) return { chars, tokens: 0, dictRatio: 0, junkRatio: 0, avgLen: 0, noiseRatio: 0, verdict: "empty" };
  const rawTokens = clean.split(" ").filter((t) => t.replace(/[^\p{L}\p{N}]/gu, "").length >= 3);
  const noisy = rawTokens.filter((t) => { const core = t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""); return !/^\d[\d.,\-/]*$/.test(core) && !/^[A-Z]{2,}[\d-]*$/.test(core) && NOISE.some((re) => re.test(core)); }).length;
  const noiseRatio = rawTokens.length ? noisy / rawTokens.length : 0;
  const nonSpace = clean.replace(/\s/g, "");
  const junk = nonSpace.replace(/[\p{L}\p{N}.,;:'"()\-–—/%&§°ñÑ]/gu, "").length;
  const tokens = clean.toLowerCase().split(/[^\p{L}']+/u).filter((t) => t.length > 0);
  const wordTokens = tokens.filter((t) => t.length >= 2);
  const hits = wordTokens.filter((t) => DICT.has(t)).length;
  const dictRatio = wordTokens.length ? hits / wordTokens.length : 0;
  const avgLen = wordTokens.length ? wordTokens.reduce((s, t) => s + t.length, 0) / wordTokens.length : 0;
  const junkRatio = junk / nonSpace.length;
  // Single-letter soup ("t h e  c o m m") is a typical bad-OCR artefact
  const singleRatio = tokens.length ? tokens.filter((t) => t.length === 1).length / tokens.length : 0;
  const garbled = (wordTokens.length >= 8 && dictRatio < 0.18) || junkRatio > (scanned ? 0.25 : 0.4) || avgLen < 2.2 || avgLen > 15 || singleRatio > 0.45 || noiseRatio > (scanned ? 0.012 : 0.1);
  return { chars, tokens: tokens.length, dictRatio: +dictRatio.toFixed(3), junkRatio: +junkRatio.toFixed(3), avgLen: +avgLen.toFixed(2), noiseRatio: +noiseRatio.toFixed(3), verdict: garbled ? "garbled" : "good" };
}

export type DocVerdict = "born_digital" | "image_only" | "garbled" | "mixed";

export function classifyDocument(pages: string[], scanned: boolean[] = []): { verdict: DocVerdict; perPage: PageQuality[]; badPages: number[] } {
  const perPage = pages.map((t, i) => pageQuality(t, !!scanned[i]));
  const n = perPage.length || 1;
  const empty = perPage.filter((p) => p.verdict === "empty").length;
  const garbled = perPage.filter((p) => p.verdict === "garbled").length;
  const good = n - empty - garbled;
  const badPages = perPage.map((p, i) => (p.verdict === "good" ? -1 : i + 1)).filter((i) => i > 0);
  let verdict: DocVerdict;
  if (empty / n >= 0.8) verdict = "image_only";
  else if (good / n >= 0.9) verdict = "born_digital";
  else if (garbled / n >= 0.3 || ((garbled + empty) / n >= 0.6 && garbled > 0)) verdict = "garbled";
  else verdict = "mixed";
  return { verdict, perPage, badPages };
}
