export interface Source { title: string; url: string; }

export function parseSources(sourcesMd: string): Record<string, Source> {
  const out: Record<string, Source> = {};
  const blocks = sourcesMd.split(/^##\s+/m).slice(1);
  for (const b of blocks) {
    const head = b.split("\n")[0];
    const m = head.match(/^(S\d+)\s*[—\-:]\s*(.+?)\s*$/);
    if (!m) continue;
    const id = m[1];
    const title = m[2].trim();
    const url = (b.match(/https?:\/\/\S+/) || [""])[0];
    out[id] = { title, url };
  }
  return out;
}

export function resolveFootnotes(lessonMd: string, sourcesMd: string): string {
  const sources = parseSources(sourcesMd);
  const used = new Set([...lessonMd.matchAll(/\[\^(S\d+)\]/g)].map((m) => m[1]));
  const defs: string[] = [];
  for (const id of used) {
    const s = sources[id];
    if (!s) continue;
    defs.push(`[^${id}]: ${s.title}${s.url ? ` — ${s.url}` : ""}`);
  }
  if (defs.length === 0) return lessonMd;
  return `${lessonMd.trimEnd()}\n\n${defs.join("\n")}\n`;
}
