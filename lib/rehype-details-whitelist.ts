import type { Root } from "hast";

// remark-rehype(allowDangerousHtml) leaves raw HTML in lesson bodies as `raw` nodes.
// Streamdown's default pipeline would rehype-raw→sanitize them into controlled elements, but this repo passes
// custom rehypePlugins (katex/slug/rewrite/footnote) to Streamdown, replacing the default
// raw/sanitize/harden stack — so raw nodes go un parsed and legitimate <details>/<summary>
// fold blocks render as literal text (novice acceptance P1: "think first, then expand" teaching breaks).
//
// This plugin is a minimal allowlist, used with rehype-raw after it:
//   - raw nodes containing only details/summary tags → stay raw for rehype-raw to become real elements;
//   - any other raw HTML (<script>/<div>/<img>/comments etc.) → downgrade to text nodes,
//     still rendered as escaped literal text (same as today's behavior, no expanded XSS surface).
// So only details/summary "activate"; other raw HTML stays inert text — fixes fold blocks
// without opening full raw HTML injection. Footnotes/math/mermaid/interactive blocks are not raw nodes; zero impact.
const ALLOWED_TAGS = new Set(["details", "summary"]);
const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g;

function isWhitelistedRaw(value: string): boolean {
  // Do not allow comments <!-- --> / doctype <!...> (structure can hide in comments)
  if (/<!--|<!\w/.test(value)) return false;
  let sawTag = false;
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(value)) !== null) {
    sawTag = true;
    if (!ALLOWED_TAGS.has(m[1].toLowerCase())) return false;
  }
  // Allow only when tags exist and all are whitelisted; plain-text raw (no tags) needs no raw parse → downgrade to text.
  return sawTag;
}

interface Rawish {
  type: string;
  value?: string;
  children?: Rawish[];
}

function walk(node: Rawish): void {
  if (node.type === "raw") {
    if (!isWhitelistedRaw(node.value ?? "")) {
      node.type = "text";
    }
    return;
  }
  if (node.children) {
    for (const child of node.children) walk(child);
  }
}

export function rehypeDetailsWhitelist() {
  return (tree: Root): void => {
    walk(tree as unknown as Rawish);
  };
}
