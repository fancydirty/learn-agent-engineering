import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mergeGlossary, type Term } from "./glossary";

function readJsonArray(p: string): unknown {
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return [];
  }
}

export function loadGlossaryTerms(courseDir: string): Term[] {
  return mergeGlossary(readJsonArray(join(courseDir, "glossary.json")), []);
}
