import GithubSlugger from "github-slugger";
export interface TocItem { depth: 2 | 3; text: string; id: string; }

export function tocFromMarkdown(md: string): TocItem[] {
  const slugger = new GithubSlugger();
  const out: TocItem[] = [];
  let inFence = false;
  for (const line of md.split("\n")) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = line.match(/^(#{2,3})\s+(.+?)\s*$/);
    if (!m) continue;
    const depth = m[1].length as 2 | 3;
    const text = m[2].replace(/[*`]/g, "").trim();
    out.push({ depth, text, id: slugger.slug(text) });
  }
  return out;
}
