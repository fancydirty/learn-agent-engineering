// NOTE: course-guard has a semantically aligned twin parser
// (../../scripts/course-guard.mjs parseReadmeFrontmatter) — guard is standalone .mjs and cannot import this TS.
// When changing parse semantics here (trigger conditions, inline vs block tags, quote stripping), sync that copy
// or guard-accepted frontmatter will drift from reader-rendered frontmatter.
export interface Frontmatter {
  domain?: string;
  tags?: string[];
  lang?: string;
  /** Ladder tier: 1 on-ramp, 2 workflow, 3 engineering. Drives library grouping. */
  tier?: number;
  /** One sentence naming what the reader can do after finishing. Shown on the course card. */
  outcome?: string;
  /** Reading order within a tier. Lower first. */
  order?: number;
}

function clean(s: string): string {
  return s.trim().replace(/^["']|["']$/g, "").trim();
}

export function parseFrontmatter(md: string): { data: Frontmatter; body: string } {
  const lines = md.split(/\r?\n/);
  if (lines[0] !== "---") return { data: {}, body: md };
  let i = 1;
  const fm: string[] = [];
  while (i < lines.length && lines[i] !== "---") {
    fm.push(lines[i]);
    i++;
  }
  if (i >= lines.length) return { data: {}, body: md };
  const body = lines.slice(i + 1).join("\n");
  const data: Frontmatter = {};
  for (let k = 0; k < fm.length; k++) {
    const m = fm[k].match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2];
    if (key === "tags") {
      if (val.trim().startsWith("[")) {
        data.tags = val.trim().replace(/^\[|\]$/g, "").split(",").map(clean).filter(Boolean);
      } else {
        const arr: string[] = [];
        let j = k + 1;
        while (j < fm.length && /^\s*-\s+/.test(fm[j])) {
          arr.push(clean(fm[j].replace(/^\s*-\s+/, "")));
          j++;
        }
        data.tags = arr.filter(Boolean);
        k = j - 1;
      }
    } else if (key === "domain") {
      data.domain = clean(val);
    } else if (key === "lang") {
      data.lang = clean(val);
    } else if (key === "tier") {
      const n = Number.parseInt(clean(val), 10);
      if (Number.isInteger(n) && n >= 1 && n <= 3) data.tier = n;
    } else if (key === "outcome") {
      data.outcome = clean(val);
    } else if (key === "order") {
      const n = Number.parseInt(clean(val), 10);
      if (Number.isInteger(n)) data.order = n;
    }
  }
  return { data, body };
}
