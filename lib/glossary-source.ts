// Glossary "Source" column link resolution (pure logic). Local and public courses each had a copy: the public one
// footnotes linked straight to upstream sites ("public visitors have no local sources page"), but /s/<token>/<course>/sources
// has always been 200 — public glossary kicked readers off-site and rendered footnotes without URLs as dead text.
// One implementation for both: public course slug is disguised as "s/<token>/<slug>", so in-site anchors stay correct.
import type { Source } from "./footnotes";

export interface GlossarySourceRef {
  label: string;
  href: string | null;
  /** External links open in a new window; in-site anchors same tab (readers shouldn't stack tabs for one citation). */
  external: boolean;
}

export function glossarySourceRef(
  src: string,
  sources: Record<string, Source>,
  courseSlug: string,
  slugAnchor: (text: string) => string,
): GlossarySourceRef {
  const fn = src.match(/^\[\^S(\d+)\]$/i);
  if (fn) {
    const id = "S" + fn[1];
    const s = sources[id];
    if (s) return { label: s.title, href: `/${courseSlug}/sources#${slugAnchor(`${id} — ${s.title}`)}`, external: false };
    return { label: id, href: `/${courseSlug}/sources`, external: false };
  }
  if (/^https?:\/\//.test(src)) {
    try {
      return { label: new URL(src).hostname.replace(/^www\./, ""), href: src, external: true };
    } catch {
      return { label: src, href: src, external: true };
    }
  }
  return { label: src || "—", href: null, external: false };
}
