export interface VisualBlock {
  id: string;
  src: string;
  title: string;
  caption: string;
  interactive: boolean;
}

export type VisualParseResult = { ok: true; block: VisualBlock } | { ok: false; error: string };

// Keep in sync with scripts/course-guard.mjs (mjs cannot import here).
export const MAX_VISUAL_BYTES = 120 * 1024;
export const MAX_VISUALS_PER_LESSON = 2;
export const VISUAL_SRC_RE = /^visuals\/[A-Za-z0-9][A-Za-z0-9._-]*\.html$/;
const EXTERNAL_URL = /https?:\/\//i;

function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function isSafeVisualSrc(src: string): boolean {
  return VISUAL_SRC_RE.test(src) && !src.includes("..") && !src.startsWith("/");
}

export function parseVisualBlock(code: string): VisualParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(code);
  } catch (e) {
    return { ok: false, error: `agentmentor-visual JSON parse failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "agentmentor-visual must be a JSON object" };
  }
  const r = raw as Record<string, unknown>;
  if (r.interactive !== undefined && typeof r.interactive !== "boolean") {
    return { ok: false, error: "agentmentor-visual interactive must be a boolean" };
  }
  if (r.caption !== undefined && typeof r.caption !== "string") {
    return { ok: false, error: "agentmentor-visual caption must be a string" };
  }
  return {
    ok: true,
    block: {
      id: s(r.id),
      src: s(r.src),
      title: s(r.title),
      caption: s(r.caption),
      interactive: r.interactive === true,
    },
  };
}

export function validateVisualBlock(b: VisualBlock, opts?: { html?: string }): string[] {
  const errors: string[] = [];
  if (!b.id.trim()) errors.push("agentmentor-visual missing id");
  if (!b.title.trim()) errors.push("agentmentor-visual missing title");
  if (!b.src.trim()) {
    errors.push("agentmentor-visual missing src");
  } else if (!isSafeVisualSrc(b.src)) {
    errors.push("agentmentor-visual src must be a visuals/*.html file (no .., no other folders)");
  }
  if (opts?.html === undefined) {
    errors.push(`agentmentor-visual missing file: ${b.src || "(empty src)"}`);
    return errors;
  }
  const html = opts.html;
  if (Buffer.byteLength(html, "utf8") > MAX_VISUAL_BYTES) {
    errors.push(`agentmentor-visual ${b.src} exceeds ${MAX_VISUAL_BYTES} bytes`);
  }
  if (EXTERNAL_URL.test(html)) {
    errors.push(`agentmentor-visual ${b.src} contains external URL (must be self-contained, no external links)`);
  }
  return errors;
}

export function visualHtmlFromFiles(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(files)) {
    if (isSafeVisualSrc(key) && typeof value === "string") out[key] = value;
  }
  return out;
}

function heightReporter(instanceId: string): string {
  return [
    "(function(){",
    `var ID=${JSON.stringify(instanceId)};`,
    "var send=function(p){p.__amLive=true;p.id=ID;try{parent.postMessage(p,'*')}catch(e){}};",
    "var lastH=0;var report=function(){var h=document.documentElement.scrollHeight;if(h&&h!==lastH){lastH=h;send({type:'height',h:h})}};",
    "if(window.ResizeObserver){new ResizeObserver(report).observe(document.documentElement)}",
    "window.addEventListener('load',report);",
    "report();",
    "})();",
  ].join("");
}

function wrapFragment(body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`;
}

export function buildVisualSrcdoc(
  html: string,
  opts?: { instanceId?: string; interactive?: boolean },
): string {
  const interactive = opts?.interactive === true;
  const instanceId = opts?.instanceId ?? "";
  const isFullDoc = /<html[\s>]/i.test(html);
  let doc = isFullDoc ? html : wrapFragment(html);
  if (!interactive) return doc;
  const script = `<script>${heightReporter(instanceId)}</scr` + "ipt>";
  if (/<\/body>/i.test(doc)) {
    return doc.replace(/<\/body>/i, `${script}</body>`);
  }
  return `${doc}${script}`;
}
