export interface Exercise { level: string; prompt: string; hints: string[]; answer: string | null; checks: string[]; }

const EX_OPEN = /^<!--\s*exercises\s*-->\s*$/m;
const EX_CLOSE = /^<!--\s*\/exercises\s*-->\s*$/gm;

function lastLineMatch(re: RegExp, text: string): RegExpMatchArray | null {
  let last: RegExpMatchArray | null = null;
  for (const m of text.matchAll(re)) last = m;
  return last;
}

export function splitLesson(md: string): { before: string; exercisesMd: string | null } {
  const open = md.match(EX_OPEN);
  if (!open || open.index === undefined) return { before: md, exercisesMd: null };
  const bodyStart = open.index + open[0].length;
  const rest = md.slice(bodyStart);
  const close = lastLineMatch(EX_CLOSE, rest);
  let exercisesMd: string;
  let afterEnd: number; // absolute offset after exercise region in md (exclusive), for stitching before tail
  if (close && close.index !== undefined) {
    exercisesMd = rest.slice(0, close.index);
    afterEnd = bodyStart + close.index + close[0].length;
  } else {
    // Contract: first `## ` after open anchor is the exercise region's own heading; fallback must search after it,
    // not use that heading as boundary (otherwise the exercise region becomes empty).
    const ownHeading = rest.match(/^## .*$/m);
    const searchFrom = ownHeading && ownHeading.index !== undefined ? ownHeading.index + ownHeading[0].length : 0;
    const nextOffset = rest.slice(searchFrom).search(/^## /m);
    if (nextOffset === -1) { exercisesMd = rest; afterEnd = md.length; }
    else { const nextH2 = searchFrom + nextOffset; exercisesMd = rest.slice(0, nextH2); afterEnd = bodyStart + nextH2; }
  }
  const before = md.slice(0, open.index) + md.slice(afterEnd);
  return { before, exercisesMd };
}

type Role = "rubric" | "answer" | "hint" | null;
interface ExerciseChunk { level: string; lines: string[]; }

const REGION_FENCE = /^<!--\s*\/?exercises\s*-->\s*$/;

function isRegionFence(line: string): boolean {
  return REGION_FENCE.test(line);
}

// Whether a line is an in-exercise anchor row. Language-agnostic: HTML comment anchors only.
function lineRole(line: string): Role {
  const m = line.match(/^<!--\s*(rubric|hint|answer)\s*-->\s*$/);
  return m ? (m[1] as Role) : null;
}

function afterColon(line: string): string {
  const parts = line.split(/[:：]/);
  return parts.length > 1 ? parts.slice(1).join("：").trim() : "";
}

function splitItems(body: string): string[] {
  return body
    .split("\n")
    .flatMap((l) => l.split(/[;；]/))
    .map((s) => s.replace(/^[\s\-*•]+/, "").replace(/^\[[ xX]\]\s*/, "").replace(/[✅✓☑]/g, "").trim())
    .filter((s) => s.length > 1);
}

function splitHintParts(body: string): string[] {
  const parts = body
    .split(/[①②③④⑤⑥]|(?:^|\s)[1-5][.)、]\s/)
    .map((s) => s.replace(/^[>\s\-*]+/, "").replace(/\*+/g, "").trim())
    .filter((s) => s.length > 1);
  return parts.length ? parts : (body.trim() ? [body.replace(/^[>\s\-*]+/, "").trim()] : []);
}

function parseInlineLevelHeading(line: string): { level: string; promptLead: string } | null {
  const m = line.match(/^\s*\*\*\s*(Level\s+\d+[^*]*?)\s*\*\*\s*$/i);
  if (m) return { level: m[1].trim(), promptLead: "" };

  const plain = line.match(/^\s*(Level\s+\d+)\s*[:：]\s*(.+?)\s*$/i);
  if (plain) return { level: plain[1].trim(), promptLead: plain[2].trim() };

  const standalone = line.match(/^\s*(Level\s+\d+[^:：]*)\s*$/i);
  return standalone ? { level: standalone[1].trim(), promptLead: "" } : null;
}

function splitExerciseChunks(exercisesMd: string): ExerciseChunk[] {
  // Track code fence state to avoid splitting on ### inside code blocks
  const lines = exercisesMd.split("\n");
  const chunks: ExerciseChunk[] = [];
  let currentChunk: ExerciseChunk | null = null;
  let inCodeBlock = false;

  for (const line of lines) {
    // Toggle code block state
    if (/^```/.test(line)) {
      inCodeBlock = !inCodeBlock;
    }

    // Only treat ### as a Level heading if we're NOT in a code block
    if (!inCodeBlock && /^###\s+/.test(line)) {
      if (currentChunk) chunks.push(currentChunk);
      const level = line.replace(/^###\s+/, "").trim();
      currentChunk = { level, lines: [] };
      continue;
    }

    if (currentChunk) {
      currentChunk.lines.push(line);
    }
  }

  if (currentChunk) chunks.push(currentChunk);

  // Fallback: if no ### headings found, try inline Level patterns
  if (chunks.length === 0) {
    const fallbackLines = exercisesMd.replace(/^##\s+.*$/m, "").split("\n");
    let current: ExerciseChunk | null = null;

    for (const line of fallbackLines) {
      const heading = parseInlineLevelHeading(line);
      if (heading) {
        if (current) chunks.push(current);
        current = { level: heading.level, lines: heading.promptLead ? [heading.promptLead] : [] };
        continue;
      }
      if (current) {
        if (!isRegionFence(line)) current.lines.push(line);
      }
    }
    if (current) chunks.push(current);

    if (chunks.length === 0) {
      return [{ level: "", lines: fallbackLines }];
    }
  }

  return chunks;
}

export function parseExercises(exercisesMd: string): Exercise[] {
  const chunks = splitExerciseChunks(exercisesMd);
  const out: Exercise[] = [];
  for (const chunk of chunks) {
    const { level, lines } = chunk;
    let i = 0;

    const promptLines: string[] = [];
    while (i < lines.length && !lineRole(lines[i])) {
      if (!isRegionFence(lines[i])) promptLines.push(lines[i]);
      i++;
    }

    let answer: string | null = null;
    const checks: string[] = [];
    const hints: string[] = [];
    while (i < lines.length) {
      const r = lineRole(lines[i]);
      if (!r) { i++; continue; }
      const sec = [lines[i]];
      let j = i + 1;
      while (j < lines.length && !lineRole(lines[j])) {
        if (!isRegionFence(lines[j])) sec.push(lines[j]);
        j++;
      }
      const body = [afterColon(sec[0]), ...sec.slice(1)].filter(Boolean).join("\n").trim();
      if (r === "rubric") checks.push(...splitItems(body));
      else if (r === "answer") { if (body) answer = body.replace(/^[\s\-*]+/, "").trim(); }
      else hints.push(...splitHintParts(body));
      i = j;
    }

    const prompt = promptLines.join("\n").replace(/^\s+|\s+$/g, "");
    // Count as an exercise when it has interactive parts (hints/answer/rubric) or is a `### Level` section;
    // unstructured prose alone (no level, no interactive parts) does not count → caller downgrades to normal render.
    if (hints.length || answer || checks.length || (level && prompt)) {
      out.push({ level, prompt, hints, answer, checks });
    }
  }
  return out;
}
