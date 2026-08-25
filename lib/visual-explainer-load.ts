import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isSafeVisualSrc } from "./visual-explainer";

/** Scan courseDir/visuals/*.html. Keys match fence src, e.g. visuals/foo.html. */
export function loadVisualHtmlBySrc(courseDir: string): Record<string, string> {
  if (!courseDir) return {};
  const dir = join(courseDir, "visuals");
  if (!existsSync(dir)) return {};
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    const src = `visuals/${name}`;
    if (!isSafeVisualSrc(src)) continue;
    out[src] = readFileSync(join(dir, name), "utf8");
  }
  return out;
}
