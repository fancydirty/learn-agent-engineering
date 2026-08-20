// Pure logic (no node:fs), safe for client import. Disk read loadGlossaryTerms lives in glossary-load.ts.
// Data contract (2026-07-19 learning layer plan): glossary.json entries may have deeper (extended explanation, [^Sn])
// and related (terms within course glossary); glossary.live.json is buyer BYOK sediment with origin:"live",
// live never writes course files; reader always labels live entries as not guard-verified.
export interface Term {
  term: string;
  def: string;
  source?: string;
  deeper?: string;
  related?: string[];
  origin?: "live";
  savedAt?: string;
  model?: string;
}
export interface Seg { text: string; def?: string; term?: string; }

const str = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

// Per-entry sanitize: drop non-objects / missing term|def; optional fields only when typed correctly.
function sanitize(e: unknown, live: boolean): Term | null {
  if (!e || typeof e !== "object") return null;
  const o = e as Record<string, unknown>;
  if (!str(o.term) || !str(o.def)) return null;
  const t: Term = { term: o.term, def: o.def };
  if (str(o.source)) t.source = o.source;
  if (str(o.deeper)) t.deeper = o.deeper;
  if (Array.isArray(o.related)) {
    const rel = o.related.filter(str);
    if (rel.length) t.related = rel;
  }
  if (live) {
    // Live entries pinned origin "live" (guard validates format; reader does not trust source)
    t.origin = "live";
    if (str(o.savedAt)) t.savedAt = o.savedAt;
    if (str(o.model)) t.model = o.model;
  }
  return t;
}

// Merge course glossary with live sediment:
// - Course entries win; live entry with same term dropped (guard-verified beats unverified live).
// - related keeps only anchors in merged term set (dead anchors dropped silently; guard reports),
//   dedupe and remove self-links.
export function mergeGlossary(base: unknown, live: unknown): Term[] {
  const baseTerms = (Array.isArray(base) ? base : []).map((e) => sanitize(e, false)).filter((t): t is Term => t !== null);
  const seen = new Set(baseTerms.map((t) => t.term));
  const liveTerms = (Array.isArray(live) ? live : [])
    .map((e) => sanitize(e, true))
    .filter((t): t is Term => t !== null && !seen.has(t.term) && (seen.add(t.term), true));
  const all = [...baseTerms, ...liveTerms];
  const names = new Set(all.map((t) => t.term));
  for (const t of all) {
    if (!t.related) continue;
    const rel = [...new Set(t.related)].filter((r) => r !== t.term && names.has(r));
    if (rel.length) t.related = rel;
    else delete t.related;
  }
  return all;
}

// Term match candidate set (2026-07-19 pedagogy audit P1-1): full key, outside parentheses, inside each paren (CN/EN brackets).
// Example 「备菜就位（mise en place）」→ full + 「备菜就位」 + 「mise en place」;
// "hot pan, cold oil (热锅凉油)" → full + "hot pan, cold oil" + "热锅凉油".
// Candidates only for body matching; hover/knowledge-tree/review identity key remains full term (Seg.term = full key).
// Candidates length <2 (e.g. "." from "dot (.)") skipped to avoid single-char scan of full text.
// scripts/course-guard.mjs termMatchCandidates mirrors this in .mjs (guard does not import TS) — keep in sync.
const PAREN_RE = /（[^（）]*）|\([^()]*\)/g;
export function termCandidates(term: string): string[] {
  const insides = [...term.matchAll(PAREN_RE)].map((m) => m[0].slice(1, -1).trim());
  const outside = term.replace(PAREN_RE, " ").replace(/\s+/g, " ").trim();
  const out: string[] = [];
  for (const c of [term, outside, ...insides]) {
    if (c.length >= 2 && !out.includes(c)) out.push(c);
  }
  return out;
}

export function segmentText(text: string, terms: Term[], used: Set<string>): Seg[] {
  // Expand to (candidate, term) pairs, match longest candidate first — nested false positives
  // («编码 agent» before «agent»; aliases same). Any candidate hit counts; used dedupes by full key.
  const cands: Array<{ cand: string; term: string; def: string }> = [];
  for (const { term, def } of terms) {
    for (const cand of termCandidates(term)) cands.push({ cand, term, def });
  }
  cands.sort((a, b) => b.cand.length - a.cand.length);
  const taken: Array<[number, number]> = [];
  const hits: Array<{ start: number; end: number; def: string; term: string }> = [];
  for (const { cand, term, def } of cands) {
    if (used.has(term)) continue;
    const i = text.indexOf(cand);
    if (i === -1) continue;
    const end = i + cand.length;
    if (taken.some(([s, e]) => i < e && end > s)) continue;
    hits.push({ start: i, end, def, term });
    taken.push([i, end]);
    used.add(term);
  }
  if (!hits.length) return [{ text }];
  hits.sort((a, b) => a.start - b.start);
  const segs: Seg[] = [];
  let pos = 0;
  for (const h of hits) {
    if (h.start > pos) segs.push({ text: text.slice(pos, h.start) });
    segs.push({ text: text.slice(h.start, h.end), def: h.def, term: h.term });
    pos = h.end;
  }
  if (pos < text.length) segs.push({ text: text.slice(pos) });
  return segs;
}
