#!/usr/bin/env node
// Course mechanical red-line guard: deterministic checks without LLM → {ok, violations[]}.
// Usage: node scripts/course-guard.mjs <course-dir> [--max-lines N] [--skip-url-check] [--strict-url-check]
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Node resolves IPv6 first by default. On a host with no working IPv6 route every
// source URL on an IPv6-advertising domain then fails (or redirects to a
// region-block page), failing the guard on sources that are actually reachable.
// Preferring IPv4 is safe everywhere: dual-stack hosts still connect normally.
try {
  const dns = await import("node:dns");
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Older runtimes without the API keep Node's default ordering.
}

function lineCap(maxLines) {
  const n = Number(maxLines);
  return Number.isFinite(n) && n > 0 ? n : null;
}

if (process.argv.includes("--help")) {
  console.log("Usage: node scripts/course-guard.mjs <course-dir> [--max-lines N] [--skip-url-check] [--strict-url-check]");
  process.exit(0);
}

// .live.md is buyer BYOK sediment lesson appendix (spec 2026-07-19 §二 L2), not a core lesson:
// Without exclusion, 01-x.live.md is scanned as core lesson → template/README violations (same as lib/courses.ts lesson scan).
function lessonFiles(courseDir) {
  if (!existsSync(courseDir)) return [];
  return readdirSync(courseDir)
    .filter((f) => /^\d+-.*\.md$/.test(f) && !f.endsWith(".live.md"))
    .sort();
}

function sameSlugCourseHasContent(courseDir) {
  return existsSync(join(courseDir, "README.md")) ||
    existsSync(join(courseDir, "agentmentor.json")) ||
    lessonFiles(courseDir).length > 0;
}

function scanForSameCourseSlug(root, slug, targetDir, depthLeft, hits, seen) {
  const resolvedRoot = resolve(root);
  if (seen.has(resolvedRoot) || depthLeft < 0 || hits.length >= 3) return;
  seen.add(resolvedRoot);

  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if ([".git", "node_modules", ".next", "dist", "build", ".turbo"].includes(entry.name)) continue;

    const child = join(root, entry.name);
    const resolvedChild = resolve(child);
    if (entry.name === slug && resolvedChild !== targetDir && sameSlugCourseHasContent(child)) {
      hits.push(child);
      if (hits.length >= 3) return;
    }
    scanForSameCourseSlug(child, slug, targetDir, depthLeft - 1, hits, seen);
    if (hits.length >= 3) return;
  }
}

function likelyCourseSearchRoots(courseDir) {
  const roots = [ROOT, dirname(ROOT)];
  let cursor = resolve(courseDir);
  for (let i = 0; i < 6; i++) {
    cursor = dirname(cursor);
    roots.push(cursor);
  }
  return [...new Set(roots.map((root) => resolve(root)))];
}

export function checkCoursePathTarget(courseDir) {
  const slug = basename(courseDir);
  if (!slug) return [];

  const hasReadme = existsSync(join(courseDir, "README.md"));
  const lessons = lessonFiles(courseDir);
  if (hasReadme && lessons.length > 0) return [];

  const targetDir = resolve(courseDir);
  const hits = [];
  const seen = new Set();
  for (const root of likelyCourseSearchRoots(courseDir)) {
    scanForSameCourseSlug(root, slug, targetDir, 6, hits, seen);
    if (hits.length >= 3) break;
  }
  if (!hits.length) return [];

  return [
    `课目录可能写错位置: 目标目录缺核心交付物,但发现同名课程在 ${hits.join(" ; ")}。先确认当前仓库/绝对路径,再移动或重写到传给 guard 的目录。`,
  ];
}

// Only real footnote form [^Sn]/[^digits], excluding code fences/inline code —
// regex char classes (e.g. `[^aeiou]`, /[^S9]/ in code blocks) are not citations, not flagged dangling.
// CommonMark: a closing fence must use the same character, be at least as long,
// and cannot carry an info string. ```python therefore cannot close an unlabeled
// ``` fence; the inner closer closes the outer one, and leftover fences swallow
// the rest of the lesson — including footnote definitions appended by the reader.
const FENCE_LINE_RE = /^(\s*)(`{3,}|~{3,})(.*)$/;

export function findFenceProblems(text) {
  const unclosed = [];
  const nested = [];
  let open = null;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = FENCE_LINE_RE.exec(lines[i]);
    if (!m) continue;
    const ticks = m[2];
    const info = m[3].trim();
    const ch = ticks[0];
    const len = ticks.length;
    const line = i + 1;
    if (!open) {
      open = { line, ch, len, info };
      continue;
    }
    if (ch === open.ch && len >= open.len && info === "") {
      open = null;
      continue;
    }
    // Same character, long enough to close, but an info string forbids closing.
    // Authors treat this as a nested fence; CommonMark treats the next bare
    // closer as the outer closer and the leftover fence swallows the lesson.
    if (ch === open.ch && len >= open.len) {
      nested.push({ line, openLine: open.line, raw: lines[i].trim() });
    }
  }
  if (open) unclosed.push({ line: open.line, info: open.info });
  return { unclosed, nested };
}

function splitLessonRegions(md) {
  const openRe = /^<!--\s*exercises\s*-->\s*$/m;
  const closeRe = /^<!--\s*\/exercises\s*-->\s*$/gm;
  const open = openRe.exec(md);
  if (!open || open.index === undefined) return { before: md, exercisesMd: null };
  const bodyStart = open.index + open[0].length;
  const rest = md.slice(bodyStart);
  let last = null;
  for (const match of rest.matchAll(closeRe)) last = match;
  if (!last || last.index === undefined) {
    return { before: md.slice(0, open.index), exercisesMd: rest };
  }
  const exercisesMd = rest.slice(0, last.index);
  const afterEnd = bodyStart + last.index + last[0].length;
  return { before: md.slice(0, open.index) + md.slice(afterEnd), exercisesMd };
}

export function checkCodeFenceBalance(courseDir) {
  const violations = [];
  const hint = "围栏里再写 ``` 时，外层请用 4 个反引号或 ~~~";
  for (const f of lessonFiles(courseDir)) {
    const text = readFileSync(join(courseDir, f), "utf8");
    const { before, exercisesMd } = splitLessonRegions(text);
    for (const [label, part] of [["正文", before], ["练习区", exercisesMd]]) {
      if (!part) continue;
      const { unclosed, nested } = findFenceProblems(part);
      for (const item of unclosed) {
        violations.push(`${f}: ${label}第 ${item.line} 行代码围栏未闭合。${hint}`);
      }
      for (const item of nested) {
        violations.push(`${f}: ${label}第 ${item.line} 行是未闭合围栏内的内层围栏（外层始于第 ${item.openLine} 行）。${hint}`);
      }
    }
  }
  return violations;
}

export function checkCitations(courseDir) {
  const violations = [];
  const sourcesPath = join(courseDir, "sources.md");
  const sources = existsSync(sourcesPath) ? readFileSync(sourcesPath, "utf8") : "";
  for (const f of lessonFiles(courseDir)) {
    const text = readFileSync(join(courseDir, f), "utf8");
    const prose = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "");
    const used = new Set([...prose.matchAll(/\[\^(S\d+|\d+)\]/g)].map((m) => m[1]));
    for (const id of used) {
      const inSources = new RegExp(`(^|\\s|#)${id}\\b`).test(sources);
      const inlineDef = new RegExp(`^\\[\\^${id}\\]:`, "m").test(text);
      if (!inSources && !inlineDef) violations.push(`${f}: 悬空引用 [^${id}] — sources.md 里没有 ## ${id} 块。每条源写成 \`## Sn — 标题\` 块(见 templates/sources-template.md),不要用 \`[^Sn]:\` 脚注定义`);
    }
  }
  return violations;
}

export function checkPrevNext(courseDir) {
  const violations = [];
  for (const f of lessonFiles(courseDir)) {
    const text = readFileSync(join(courseDir, f), "utf8");
    for (const m of text.matchAll(/\]\(\.\/([^)]+\.md)\)/g)) {
      if (!existsSync(join(courseDir, m[1]))) violations.push(`${f}: 死链 ./${m[1]}`);
    }
  }
  return violations;
}

// Markdown links broken by fullwidth close paren: [text](url） where ) became ）, link won't render.
// Common zh punctuation fullwidth mistake (2026-07 two showcase READMEs hit); guard blocks recurrence.
// Only matches "link opens with ](, closes with fullwidth ）"; normal zh parens in prose (e.g. 计数器（counter）) do not trigger.
export function checkMarkdownLinks(courseDir) {
  const violations = [];
  const files = ["README.md", ...lessonFiles(courseDir)];
  for (const f of files) {
    const p = join(courseDir, f);
    if (!existsSync(p)) continue;
    readFileSync(p, "utf8").split("\n").forEach((line, i) => {
      if (/\]\([^)\n]*）/.test(line)) violations.push(`${f}:${i + 1}: markdown 链接被全角闭括号破坏 ](...）,应改半角 )`);
    });
  }
  return violations;
}

// Forbid inline footnote def lines [^Sn]: in lessons (reader auto-generates from sources.md; manual defs conflict).
// Body citations [^Sn] (not followed by colon) are OK. Scan lessonFiles line by line.
export function checkInlineFootnoteDef(courseDir) {
  const violations = [];
  for (const f of lessonFiles(courseDir)) {
    const text = readFileSync(join(courseDir, f), "utf8");
    text.split("\n").forEach((line, i) => {
      if (/^\s*\[\^[^\]]+\]:/.test(line)) {
        violations.push(`${f}:${i + 1}: 手写脚注定义 [^Sn]:(reader 从 sources.md 自动生成,勿手写)`);
      }
    });
  }
  return violations;
}

// Conservative check: halfwidth `,;!?` between two CJK han (skip halfwidth . — decimals/URLs/code).
// Exclude code fences and inline code. Returns warning strings (non-blocking, not guardCourse hard fail).
export function checkCjkPunctuation(courseDir) {
  const warnings = [];
  const files = ["README.md", ...lessonFiles(courseDir)];
  for (const f of files) {
    const p = join(courseDir, f);
    if (!existsSync(p)) continue;
    let text = readFileSync(p, "utf8");

    // Strip code fences ``` ... ``` first
    text = text.replace(/```[\s\S]*?```/g, "");

    // Then strip inline code `...`
    text = text.replace(/`[^`]+`/g, "");

    // Detect CJK han + halfwidth ,;!? + CJK han
    text.split("\n").forEach((line, i) => {
      const matches = line.matchAll(/([一-鿿])([,;!?])([一-鿿])/g);
      for (const m of matches) {
        warnings.push(`${f}:${i + 1}: 中文句子疑似混用半角标点 '${m[2]}',reader 排版基线是全角`);
      }
    });
  }
  return warnings;
}

// Term key match candidates: full key, outside-paren part, inside-paren parts (both bracket styles, punctuation kept, drop candidates <2 chars).
// course-reader/lib/glossary.ts termCandidates is TS twin of this (reader matcher wraps body with same candidate set);
// keep both in sync when changing either.
const TERM_PAREN_RE = /（[^（）]*）|\([^()]*\)/g;
export function termMatchCandidates(term) {
  const insides = [...term.matchAll(TERM_PAREN_RE)].map((m) => m[0].slice(1, -1).trim());
  const outside = term.replace(TERM_PAREN_RE, " ").replace(/\s+/g, " ").trim();
  const out = [];
  for (const c of [term, outside, ...insides]) {
    if (c.length >= 2 && !out.includes(c)) out.push(c);
  }
  return out;
}

// Glossary-body seam (2026-07-19 pedagogy audit P1-1): each glossary.json key needs ≥1 match candidate
// appearing verbatim in course body (lessons + extensions, excluding .live.md buyer sediment), else hover card never attaches,
// knowledge tree click degrades to navigation, review quizzes untaught terms. Legacy library widespread — warn first, not block;
// returns warning strings (CLI ⚠ section, not guardCourse hard fail).
export function checkGlossaryBodyPresence(courseDir) {
  const p = join(courseDir, "glossary.json");
  if (!existsSync(p)) return [];
  let arr;
  try { arr = JSON.parse(readFileSync(p, "utf8")); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const bodyFiles = readdirSync(courseDir).filter(
    (f) => (/^\d+-.*\.md$/.test(f) || /^ext-.*\.md$/.test(f)) && !f.endsWith(".live.md"),
  );
  const body = bodyFiles.map((f) => readFileSync(join(courseDir, f), "utf8")).join("\n");
  const warnings = [];
  for (const e of arr) {
    const term = e && typeof e.term === "string" ? e.term.trim() : "";
    if (!term) continue;
    const cands = termMatchCandidates(term);
    if (!cands.some((c) => body.includes(c))) {
      warnings.push(`glossary "${term}": 全键/括号外/括号内任一候选都没在正文出现,悬浮卡挂不上(改键或在正文写到它)`);
    }
  }
  return warnings;
}

// Bare `$` in lesson prose trap (2026-07-19 pipeline dogfood §六-1): reader markdown runs remark-math +
// rehype-katex; unescaped paired `$` in lesson body renders as inline math — "costs $5 and $10" becomes
// italic math streak, `$` vanishes, may overflow. Guard doesn't render; only renderer catches it — dogfood top defect.
// Heuristic warning here (non-blocking, legacy courses warn first):
//   Exclude — ``` fences (fenced code / agentmentor-* JSON), inline code, $$…$$ explicit math.
//   Trigger — after exclusions, ≥2 unescaped `$` on one line (remark-math pairs them as inline math).
// Lone `$` without pair is not math, not reported (noise reduction). See course-authoring-guide.md "escape prose $".
// Note: glossary def/deeper use textContent (raw `$` safe), interaction JSON `$` also raw —
// only lesson prose hits remark-math; this check scans lessonFiles prose lines only.
export function checkProseDollarMath(courseDir) {
  const warnings = [];
  for (const f of lessonFiles(courseDir)) {
    const raw = readFileSync(join(courseDir, f), "utf8");
    let inFence = false;
    raw.split("\n").forEach((line, i) => {
      if (/^\s*```/.test(line)) { inFence = !inFence; return; }  // fence toggle (incl. agentmentor-* blocks) — skip whole segment
      if (inFence) return;
      // Strip per line: inline code `...`, explicit $$…$$ inline math (intentional formulas not flagged)
      const prose = line.replace(/`[^`]+`/g, "").replace(/\$\$[^$]*\$\$/g, "");
      // Count unescaped `$`: only when previous char is not backslash (\$ is correct, not counted)
      let bare = 0;
      for (let k = 0; k < prose.length; k++) {
        if (prose[k] === "$" && prose[k - 1] !== "\\") bare++;
      }
      if (bare >= 2) {
        warnings.push(`${f}:${i + 1}: 一行 ${bare} 个未转义 $,会被 remark-math 配成行内公式糊字(prose 里的 $ 写成 \\$;fenced/行内代码与交互块 JSON 内 raw)`);
      }
    });
  }
  return warnings;
}

// Lesson term density (2026-07-26 live-review spec §5.1): guard target 10–14 terms/lesson
// (competitor ~12.5/chapter, 13/16 library 10.0–13.5, cross-domain stable). Below 10 → thin quiz pool,
// same topic repeated, review feels like "same card third time".
// Not conflicting with "≤7 new concepts/lesson": that caps H2 cognitive load; glossary can be subtypes.
// Warn first, not block (spec §5.15: evaluate fail after new-course samples stable); returns warning strings.
// Denominator = core lessons only (no ext-*/.live.md); missing/bad glossary or no lessons → silent [].
const GLOSSARY_DENSITY_MIN = 10;
const GLOSSARY_DENSITY_MAX = 14;
export function checkGlossaryDensity(courseDir) {
  const p = join(courseDir, "glossary.json");
  if (!existsSync(p)) return [];
  let arr;
  try { arr = JSON.parse(readFileSync(p, "utf8")); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const lessons = lessonFiles(courseDir).length;
  if (lessons === 0) return [];  // no lessons: divide-by-zero meaningless; missing lessons reported elsewhere
  const terms = arr.filter((e) => e && typeof e.term === "string" && e.term.trim()).length;
  const density = terms / lessons;
  if (density >= GLOSSARY_DENSITY_MIN) return [];
  return [
    `glossary 词条密度偏低: ${terms} 词 / ${lessons} 课节 = ${density.toFixed(1)} 词每课节,` +
    `目标区间 ${GLOSSARY_DENSITY_MIN}–${GLOSSARY_DENSITY_MAX} 词/课节。` +
    `词条密度低 → 出题池薄 → 同一件事被反复考,复习退化成同一张卡重复出现。` +
    `补考点(概念的细分/子情形也算,但每条须在正文逐字出现)`,
  ];
}

export function checkTemplateSections(courseDir, minSections = 5) {
  const violations = [];
  for (const f of lessonFiles(courseDir)) {
    const text = readFileSync(join(courseDir, f), "utf8");
    const n = (text.match(/^## /gm) || []).length;
    if (n < minSections) violations.push(`${f}: 模板段不足(${n}<${minSections})`);
  }
  return violations;
}

export function checkReadmeCoverage(courseDir) {
  const violations = [];
  const readmePath = join(courseDir, "README.md");
  if (!existsSync(readmePath)) return ["README.md 缺失"];
  const readme = readFileSync(readmePath, "utf8");
  for (const f of lessonFiles(courseDir)) {
    if (!readme.includes(f)) violations.push(`README 漏链 ${f}`);
  }
  return violations;
}

// Count non-code lines only: load dimension is "concept overload"; code blocks are examples not new concepts,
// must not false-trigger code-heavy software lessons. Lines inside fences excluded.
function nonCodeLineCount(text) {
  let inFence = false;
  let n = 0;
  for (const line of text.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) n++;
  }
  return n;
}

export function checkLessonBounds(courseDir, maxLines) {
  const cap = lineCap(maxLines);
  if (cap == null) return [];
  const violations = [];
  for (const f of lessonFiles(courseDir)) {
    const n = nonCodeLineCount(readFileSync(join(courseDir, f), "utf8"));
    if (n > cap) violations.push(`${f}: 正文超过 --max-lines(${n}>${cap}非代码行)`);
  }
  return violations;
}

// Minimal frontmatter parse (aligned with reader lib/frontmatter.ts): leading --- only, until closing ---,
// domain scalar, tags inline [a,b] or block - a, strip quotes. Guard is standalone .mjs, no TS import — built-in copy.
function parseReadmeFrontmatter(md) {
  const lines = md.split(/\r?\n/);
  if (lines[0] !== "---") return null;
  let i = 1;
  const fm = [];
  while (i < lines.length && lines[i] !== "---") { fm.push(lines[i]); i++; }
  if (i >= lines.length) return null; // no closing ---
  const clean = (s) => s.trim().replace(/^["']|["']$/g, "").trim();
  const data = { domain: "", tags: [] };
  for (let k = 0; k < fm.length; k++) {
    const m = fm[k].match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!m) continue;
    if (m[1] === "domain") data.domain = clean(m[2]);
    else if (m[1] === "tags") {
      const val = m[2].trim();
      if (val.startsWith("[")) {
        data.tags = val.replace(/^\[|\]$/g, "").split(",").map(clean).filter(Boolean);
      } else {
        const arr = [];
        let j = k + 1;
        while (j < fm.length && /^\s*-\s+/.test(fm[j])) { arr.push(clean(fm[j].replace(/^\s*-\s+/, ""))); j++; }
        data.tags = arr.filter(Boolean);
        k = j - 1;
      }
    }
  }
  return data;
}

export function checkFrontmatter(courseDir) {
  const readmePath = join(courseDir, "README.md");
  if (!existsSync(readmePath)) return ["README 缺 frontmatter(README.md 不存在)"];
  const fm = parseReadmeFrontmatter(readFileSync(readmePath, "utf8"));
  if (!fm) return ["README 缺 frontmatter(需以 --- 开头且有闭合 ---)"];
  const violations = [];
  if (!fm.domain) violations.push("frontmatter 缺 domain(单值大主题,复用优先)");
  if (!fm.tags.length) violations.push("frontmatter 缺 tags(至少 1 个真实特点标签)");
  return violations;
}

// glossary.json required and traceable: each {term,def,source}; source is http(s) URL or [^Sn] matching sources.md.
// Quiz-required fields (2026-07-26 live-review spec §5.1/§5.15): pitfall (common mistake at this checkpoint,
// sole distractor source) and distractor_rationale (who would pick this misconception and why) —
// missing either forces improvised distractors → giveaway questions. Hard fail channel.
// Optional depth (2026-07-19 spec §二 L1): deeper (advanced layer, non-empty must cite URL or [^Sn] in sources.md),
// related (anchors must hit existing glossary terms, dead anchor = fail). See course-authoring-guide.md "Glossary depth layer".
export function checkGlossary(courseDir) {
  const p = join(courseDir, "glossary.json");
  if (!existsSync(p)) return ["glossary.json 缺失(必出交付物)"];
  let arr;
  try {
    arr = JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return ["glossary.json 解析失败(非合法 JSON)"];
  }
  if (!Array.isArray(arr) || arr.length === 0) return ["glossary.json 须为非空数组"];
  const sourcesPath = join(courseDir, "sources.md");
  const sources = existsSync(sourcesPath) ? readFileSync(sourcesPath, "utf8") : "";
  const violations = [];
  const termSet = new Set(
    arr.filter((e) => e && typeof e.term === "string").map((e) => e.term.trim()).filter(Boolean),
  );
  const courseLabel = basename(courseDir) || "课程";
  arr.forEach((e, i) => {
    if (!e || typeof e !== "object") { violations.push(`glossary[${i}]: 非对象`); return; }
    for (const k of ["term", "def", "source"]) {
      if (typeof e[k] !== "string" || !e[k].trim()) violations.push(`glossary[${i}]: 缺/空 ${k}`);
    }
    // pitfall / distractor_rationale: quiz-required. Errors name course/index/term/field for direct fix location.
    const termLabel = typeof e.term === "string" && e.term.trim() ? e.term.trim() : "(无 term)";
    for (const [k, why] of [
      ["pitfall", "学习者在这个考点最常犯的错误/迷思;它是出题干扰项的唯一来源,缺了只能让模型即兴编干扰项"],
      ["distractor_rationale", "什么样的人会因为什么思路错选这个迷思;写不出合理 rationale 的干扰项就是凑数项"],
    ]) {
      if (typeof e[k] !== "string" || !e[k].trim()) {
        violations.push(`${courseLabel} glossary[${i}] "${termLabel}": 缺/空 ${k}(${why})`);
      }
    }
    const src = typeof e.source === "string" ? e.source.trim() : "";
    if (src) {
      const isUrl = /^https?:\/\//.test(src);
      const fn = src.match(/^\[\^([A-Za-z0-9]+)\]$/);
      if (!isUrl && !fn) {
        violations.push(`glossary[${i}]: source 既非 URL 也非 [^Sn](${src})`);
      } else if (fn) {
        const id = fn[1];
        if (!new RegExp(`(^|\\s|#)${id}\\b`).test(sources)) {
          violations.push(`glossary[${i}]: source [^${id}] 在 sources.md 找不到`);
        }
      }
    }
    // deeper: optional; non-empty must cite (URL or [^Sn] in sources.md). Empty string = absent.
    if (e.deeper !== undefined) {
      if (typeof e.deeper !== "string") {
        violations.push(`glossary[${i}]: deeper 须为字符串`);
      } else if (e.deeper.trim()) {
        const hasUrl = /https?:\/\//.test(e.deeper);
        // Strip inline code before citation scan — regex char classes (e.g. `[^123]`) mistaken for footnotes (same as checkCitations)
        const prose = e.deeper.replace(/`[^`]+`/g, "");
        const cited = [...prose.matchAll(/\[\^(S\d+|\d+)\]/g)].map((m) => m[1]);
        for (const id of new Set(cited)) {
          if (!new RegExp(`(^|\\s|#)${id}\\b`).test(sources)) {
            violations.push(`glossary[${i}]: deeper 引用 [^${id}] 在 sources.md 找不到`);
          }
        }
        if (!hasUrl && cited.length === 0) {
          violations.push(`glossary[${i}]: deeper 非空必挂源(URL 或 [^Sn] 对上 sources.md)`);
        }
      }
    }
    // related: optional; each item must hit existing glossary term (dead anchor = fail).
    if (e.related !== undefined) {
      if (!Array.isArray(e.related)) {
        violations.push(`glossary[${i}]: related 须为字符串数组`);
      } else {
        e.related.forEach((r, j) => {
          if (typeof r !== "string" || !r.trim()) {
            violations.push(`glossary[${i}]: related[${j}] 缺/空`);
          } else if (!termSet.has(r.trim())) {
            violations.push(`glossary[${i}]: related "${r}" 不在本课 glossary(死锚)`);
          }
        });
      }
    }
  });
  return violations;
}

// glossary.live.json: buyer BYOK live-layer sediment (spec 2026-07-19 §二 L2), separate from core glossary.json; core never written by live.
// Shape [{term, def, deeper?, origin:"live", savedAt, model}]. origin:"live" exempts source (reader always marks "unreviewed"),
// but def required; guard checks format only. Missing file = normal (buyer not sedimented). maintain-course never touches .live.*.
export function checkGlossaryLive(courseDir) {
  const p = join(courseDir, "glossary.live.json");
  if (!existsSync(p)) return [];
  let arr;
  try {
    arr = JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return ["glossary.live.json 解析失败(非合法 JSON)"];
  }
  if (!Array.isArray(arr)) return ["glossary.live.json 须为数组"];
  const violations = [];
  arr.forEach((e, i) => {
    if (!e || typeof e !== "object") { violations.push(`glossary.live[${i}]: 非对象`); return; }
    if (typeof e.term !== "string" || !e.term.trim()) violations.push(`glossary.live[${i}]: 缺/空 term`);
    if (typeof e.def !== "string" || !e.def.trim()) violations.push(`glossary.live[${i}]: 缺/空 def(live 条目豁免挂源,但 def 必非空)`);
    if (e.origin !== "live") violations.push(`glossary.live[${i}]: origin 必须为 "live"`);
    for (const k of ["savedAt", "model"]) {
      if (typeof e[k] !== "string" || !e[k].trim()) violations.push(`glossary.live[${i}]: 缺/空 ${k}`);
    }
    if (e.deeper !== undefined && typeof e.deeper !== "string") {
      violations.push(`glossary.live[${i}]: deeper 须为字符串`);
    }
  });
  return violations;
}

// ASCII markers need word boundaries: substring matching flagged Romance-language prose
// ("todos", "toda", "metodologia" contain "todo") as unfilled placeholders. CJK markers keep
// substring semantics — CJK writes without word breaks, so \b never fires between characters.
// Placeholder markers. The ASCII markers are matched case-SENSITIVELY and in
// upper case only: lowercase "todo" is an ordinary Spanish/Portuguese word ("all"),
// and \b sits inside accented words like "método" because é is not an ASCII word
// character, so a case-insensitive \bTODO\b flagged real Romance prose as unfilled.
// A genuine placeholder is written TODO/TBD/XXX in caps; the CJK markers keep
// substring semantics because CJK has no word boundaries.
const PLACEHOLDER_RE = /<[^>]+>|\bTODO\b|\bTBD\b|\bXXX\b|待补|待定/;

export function hasPlaceholderText(s) {
  return PLACEHOLDER_RE.test(s);
}

function hasPlaceholder(s) {
  return hasPlaceholderText(s);
}

function checkNonEmptyString(value, path, violations) {
  if (typeof value !== "string" || !value.trim()) {
    violations.push(`agentmentor.json: ${path} 缺/空`);
  } else if (hasPlaceholder(value)) {
    violations.push(`agentmentor.json: ${path} 仍含占位符`);
  }
}

function checkStringArray(value, path, violations, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    violations.push(`agentmentor.json: ${path} 须为${allowEmpty ? "数组" : "非空数组"}`);
    return;
  }
  value.forEach((item, i) => checkNonEmptyString(item, `${path}[${i}]`, violations));
}

function compactBriefText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function isLikelyTopicOnlyRequest(value) {
  const text = compactBriefText(value);
  if (!text) return false;
  const startsLikeCourseAsk = /^(我想学|想学|我要学|teach me\b|learn\b|给我做.*课|生成.*课|产.*课|做.*课)/i.test(text);
  if (!startsLikeCourseAsk) return false;
  const hasSpecificLearnerSignal = /(不懂|不会|会一点|只知道|只想|完全不|完全没|想学到|目标|期限|项目|为了|已经|已有|面向|受众|约束|基础.*不懂|对.+不了解)/i.test(text);
  if (hasSpecificLearnerSignal) return false;
  return Array.from(text).length <= 36;
}

function checkBriefCompleteness(value, originalRequest, violations) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    violations.push("agentmentor.json: schemaVersion 2 需包含 briefCompleteness 对象");
    return;
  }

  const allowed = new Set(["user-provided", "clarified", "insufficient"]);
  const status = typeof value.status === "string" ? value.status.trim() : "";
  if (!allowed.has(status)) {
    violations.push("agentmentor.json: briefCompleteness.status 必须是 user-provided/clarified/insufficient");
  } else if (status === "insufficient") {
    violations.push("agentmentor.json: briefCompleteness.status=insufficient 不可交付;信息不足时应先问询并停止");
  }

  checkNonEmptyString(value.evidence, "briefCompleteness.evidence", violations);
  if (isLikelyTopicOnlyRequest(originalRequest) && status === "user-provided") {
    violations.push("agentmentor.json: briefCompleteness.status 不能把疑似仅主题名的请求标为 user-provided;需先问询并标 clarified");
  }
}

function checkLearnerModel(model, violations) {
  if (!model || typeof model !== "object" || Array.isArray(model)) {
    violations.push("agentmentor.json: schemaVersion 2 需包含 learnerModel 对象");
    return;
  }

  checkNonEmptyString(model.targetReader, "learnerModel.targetReader", violations);
  checkStringArray(model.knownConcepts, "learnerModel.knownConcepts", violations);
  checkStringArray(model.unknownConcepts, "learnerModel.unknownConcepts", violations);
  checkNonEmptyString(model.assumedEnvironment, "learnerModel.assumedEnvironment", violations);
  checkNonEmptyString(model.firstIndependentAction, "learnerModel.firstIndependentAction", violations);
  checkStringArray(model.noviceRamp, "learnerModel.noviceRamp", violations);
}

function checkAcceptanceReview(review, violations) {
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    violations.push("agentmentor.json: schemaVersion 2 需包含 acceptanceReview 对象");
    return;
  }

  const scores = review.rubricScores;
  const scoreKeys = ["structure", "grounded", "pedagogy", "exercises", "load", "readable"];
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) {
    violations.push("agentmentor.json: acceptanceReview.rubricScores 缺对象");
  } else {
    scoreKeys.forEach((key) => {
      const score = scores[key];
      if (!Number.isInteger(score) || score < 4 || score > 5) {
        violations.push(`agentmentor.json: acceptanceReview.rubricScores.${key} 必须是 4-5 的整数`);
      }
    });
  }

  checkNonEmptyString(review.terminalTask, "acceptanceReview.terminalTask", violations);
  checkNonEmptyString(review.interactionCheck, "acceptanceReview.interactionCheck", violations);
  checkNonEmptyString(review.learnerFitCheck, "acceptanceReview.learnerFitCheck", violations);

  const allowedDecisions = new Set(["ship", "revise-before-example", "archive"]);
  if (typeof review.decision !== "string" || !allowedDecisions.has(review.decision)) {
    violations.push("agentmentor.json: acceptanceReview.decision 必须是 ship/revise-before-example/archive");
  }

  checkStringArray(review.blockers, "acceptanceReview.blockers", violations, { allowEmpty: review.decision === "ship" });
  if (review.decision && review.decision !== "ship" && Array.isArray(review.blockers) && review.blockers.length === 0) {
    violations.push("agentmentor.json: acceptanceReview.blockers 在非 ship 决策下必须写明阻断点");
  }
  checkStringArray(review.promotionNotes, "acceptanceReview.promotionNotes", violations);
}

export function checkCourseManifest(courseDir) {
  const p = join(courseDir, "agentmentor.json");
  if (!existsSync(p)) return ["agentmentor.json 缺失(课程本地状态清单,不是宿主长期记忆写回)"];
  let data;
  try {
    data = JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return ["agentmentor.json 解析失败(非合法 JSON)"];
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return ["agentmentor.json 须为对象"];

  const violations = [];
  if (![1, 2].includes(data.schemaVersion)) violations.push("agentmentor.json: schemaVersion 必须为 1 或 2");
  for (const key of ["originalRequest", "learnerBrief", "scope", "memoryBoundary"]) {
    const val = data[key];
    if (typeof val !== "string" || !val.trim()) {
      violations.push(`agentmentor.json: 缺/空 ${key}`);
    } else if (hasPlaceholder(val)) {
      violations.push(`agentmentor.json: ${key} 仍含占位符`);
    }
  }

  const status = data.status;
  if (!status || typeof status !== "object" || Array.isArray(status)) {
    violations.push("agentmentor.json: 缺 status 对象");
  } else {
    if (typeof status.stage !== "string" || !status.stage.trim() || /draft|todo|unknown|待补|待定/i.test(status.stage)) {
      violations.push("agentmentor.json: status.stage 需是可交付状态");
    }
    if (typeof status.guardCommand !== "string" || !/course-guard\.mjs/.test(status.guardCommand)) {
      violations.push("agentmentor.json: status.guardCommand 需包含 course-guard.mjs");
    } else if (hasPlaceholder(status.guardCommand)) {
      violations.push("agentmentor.json: status.guardCommand 仍含占位符");
    }
    if (typeof status.guardStatus !== "string" || !/^(pass|passed|ok|通过)$/i.test(status.guardStatus.trim())) {
      violations.push("agentmentor.json: status.guardStatus 必须是 pass/ok/通过");
    }
  }

  if (!Array.isArray(data.nextSteps) || data.nextSteps.length === 0) {
    violations.push("agentmentor.json: nextSteps 须为非空数组");
  } else {
    data.nextSteps.forEach((step, i) => {
      if (typeof step !== "string" || !step.trim()) violations.push(`agentmentor.json: nextSteps[${i}] 缺/空`);
      else if (hasPlaceholder(step)) violations.push(`agentmentor.json: nextSteps[${i}] 仍含占位符`);
    });
  }

  if (data.schemaVersion === 2) {
    checkBriefCompleteness(data.briefCompleteness, data.originalRequest, violations);
    checkLearnerModel(data.learnerModel, violations);

    const review = data.qualitySelfReview;
    if (!review || typeof review !== "object" || Array.isArray(review)) {
      violations.push("agentmentor.json: schemaVersion 2 需包含 qualitySelfReview 对象");
    } else {
      const diagramUse = review.diagramUse;
      if (typeof diagramUse !== "string" || !diagramUse.trim()) {
        violations.push("agentmentor.json: qualitySelfReview.diagramUse 缺/空");
      } else {
        if (hasPlaceholder(diagramUse)) violations.push("agentmentor.json: qualitySelfReview.diagramUse 仍含占位符");
        if (!/(mermaid|diagram|图|可视|图示)/i.test(diagramUse)) {
          violations.push("agentmentor.json: qualitySelfReview.diagramUse 需说明 mermaid/图示使用判断");
        }
      }

      if (!Array.isArray(review.weakestPoints) || review.weakestPoints.length < 3) {
        violations.push("agentmentor.json: qualitySelfReview.weakestPoints 至少列 3 条");
      } else {
        review.weakestPoints.forEach((point, i) => {
          if (typeof point !== "string" || !point.trim()) {
            violations.push(`agentmentor.json: qualitySelfReview.weakestPoints[${i}] 缺/空`);
          } else if (hasPlaceholder(point)) {
            violations.push(`agentmentor.json: qualitySelfReview.weakestPoints[${i}] 仍含占位符`);
          }
        });
      }

      if (!Array.isArray(review.followUpChecks) || review.followUpChecks.length === 0) {
        violations.push("agentmentor.json: qualitySelfReview.followUpChecks 须为非空数组");
      } else {
        review.followUpChecks.forEach((check, i) => {
          if (typeof check !== "string" || !check.trim()) {
            violations.push(`agentmentor.json: qualitySelfReview.followUpChecks[${i}] 缺/空`);
          } else if (hasPlaceholder(check)) {
            violations.push(`agentmentor.json: qualitySelfReview.followUpChecks[${i}] 仍含占位符`);
          }
        });
      }
    }

    checkAcceptanceReview(data.acceptanceReview, violations);
  }

  const boundary = typeof data.memoryBoundary === "string" ? data.memoryBoundary : "";
  const saysLocalOnly = /course-local|课程本地|课程目录/i.test(boundary);
  const promisesHostWriteback = /write\s+to\s+(codex|host).{0,20}memory|写入.{0,8}(长期记忆|宿主记忆)|写回.{0,8}(长期记忆|宿主记忆)/i.test(boundary);
  if (boundary && (!saysLocalOnly || promisesHostWriteback)) {
    violations.push("agentmentor.json: memoryBoundary 必须声明只做课程本地状态,不写回宿主长期记忆");
  }

  return violations;
}

const EXTENSION_TYPES = ["bridge", "deepdive", "example"];
const MAX_EXTENSIONS_PER_PARENT = 3;

export function checkExtensions(courseDir) {
  const violations = [];
  const manifestPath = join(courseDir, "agentmentor.json");
  if (!existsSync(manifestPath)) return violations; // manifest 缺失由 checkCourseManifest 报
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); } catch { return violations; }
  const list = manifest?.extensions;
  if (list === undefined) return violations; // 字段可选
  if (!Array.isArray(list)) return ["agentmentor.json extensions 必须是数组"];
  // .live.md is not a core lesson — cannot be extension parent
  const lessonFileSet = new Set(readdirSync(courseDir).filter((f) => /^\d+-.*\.md$/.test(f) && !f.endsWith(".live.md")));
  const perParent = new Map();
  for (const [i, e] of list.entries()) {
    const at = `extensions[${i}]`;
    if (!e || typeof e !== "object") { violations.push(`${at} 必须是对象`); continue; }
    if (typeof e.file !== "string" || !/^ext-.+\.md$/.test(e.file)) violations.push(`${at}.file 必须是 ext-*.md 文件名`);
    else if (!existsSync(join(courseDir, e.file))) violations.push(`${at}.file 指向的文件不存在:${e.file}`);
    if (typeof e.parent !== "string" || !lessonFileSet.has(e.parent)) violations.push(`${at}.parent 必须指向真实主线课节文件`);
    if (!EXTENSION_TYPES.includes(e.type)) violations.push(`${at}.type 必须是 ${EXTENSION_TYPES.join("/")}`);
    if (typeof e.title !== "string" || !e.title.trim()) violations.push(`${at}.title 不能为空`);
    if (typeof e.parent === "string" && /^ext-/.test(e.parent)) violations.push(`${at}.parent 不得是扩展节(深度上限 1 层)`);
    if (typeof e.parent === "string") perParent.set(e.parent, (perParent.get(e.parent) || 0) + 1);
  }
  for (const [parent, n] of perParent) {
    if (n > MAX_EXTENSIONS_PER_PARENT) violations.push(`课节 ${parent} 挂了 ${n} 个扩展(上限 ${MAX_EXTENSIONS_PER_PARENT});一节补 ${n} 次课说明主课该改了,走改主课流程`);
  }
  return violations;
}

// Source authority QA: parse authority field per ## Sn block in sources.md.
// Dual-read new English machine tag authority: (incl. ai-generated) and legacy zh 权威: (incl. AI生成/营销) —
// new courses write English tags; legacy showcase still zh tags — content migration separate; both accepted here.
// No authority field → silent skip (legacy/unmarked); all flag values → FAIL (no authoritative source);
// partial flags → ok (rubric self-check for groundedness).
export function checkSourcesAuthority(courseDir) {
  const sourcesPath = join(courseDir, "sources.md");
  if (!existsSync(sourcesPath)) return [];
  const text = readFileSync(sourcesPath, "utf8");
  // Split into ## Sn blocks
  const blocks = text.split(/^## /m).slice(1);
  if (blocks.length === 0) return [];
  // Extract authority:/权威: per block (if present)
  const auths = blocks
    .map((b) => {
      const m = b.match(/^\s*-?\s*(?:authority|权威)[:：]\s*(.+)$/m);
      return m ? m[1].trim() : null;
    })
    .filter((a) => a !== null);
  // No authority fields → silent skip (legacy)
  if (auths.length === 0) return [];
  const isFlag = (a) => a.includes("AI生成/营销") || /\bai-generated\b/i.test(a);
  const allFlag = auths.length > 0 && auths.every(isFlag);
  if (allFlag) return ["sources.md 全部源标 ai-generated / AI生成/营销(无权威源,不可能接地)"];
  return [];
}

function readCourseMarkdownFiles(courseDir) {
  const files = ["README.md", ...lessonFiles(courseDir), "sources.md"];
  return files
    .filter((f) => existsSync(join(courseDir, f)))
    .map((f) => ({ file: f, text: readFileSync(join(courseDir, f), "utf8") }));
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function extractMermaidBlocks(text) {
  const blocks = [];
  const fenceRe = /```([^\n]*)\n([\s\S]*?)\n```/g;
  for (const m of text.matchAll(fenceRe)) {
    const info = (m[1] || "").trim().split(/\s+/)[0].toLowerCase();
    if (info !== "mermaid") continue;
    blocks.push({
      source: m[2].trim(),
      start: m.index,
      end: m.index + m[0].length,
      line: lineNumberAt(text, m.index),
    });
  }
  return blocks;
}

function firstMeaningfulMermaidLine(source) {
  return source.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("%%")) || "";
}

const MERMAID_START_RE = /^(?:(?:graph|flowchart)\s+(?:TB|TD|BT|RL|LR)\b|sequenceDiagram\b|stateDiagram(?:-v2)?\b|classDiagram\b|erDiagram\b|journey\b|gantt\b|pie\b|mindmap\b|timeline\b|quadrantChart\b|xychart-beta\b)/i;

function isProseLine(line) {
  const s = line.trim();
  if (!s) return false;
  if (/^(?:```|#{1,6}\s|[-*+]\s|\d+\.\s|>|!\[|\[|<\/?|---|\|)/.test(s)) return false;
  if (/^[\s:|.\-_=]+$/.test(s)) return false;
  const cleaned = s.replace(/[`*_#[\]()>-]/g, "").trim();
  return cleaned.length >= 10 && /[\p{Script=Han}A-Za-z0-9]/u.test(cleaned);
}

function hasNearbyProse(text, start, end) {
  const before = [];
  for (const line of text.slice(0, start).split(/\r?\n/).reverse()) {
    if (/^\s*(?:#{1,6}\s|```)/.test(line)) break;
    before.push(line);
  }
  const after = [];
  for (const line of text.slice(end).split(/\r?\n/)) {
    if (/^\s*(?:#{1,6}\s|```)/.test(line)) break;
    after.push(line);
  }
  return before.some(isProseLine) || after.some(isProseLine);
}

export function checkMermaidDiagrams(courseDir) {
  const violations = [];
  for (const f of lessonFiles(courseDir)) {
    const text = readFileSync(join(courseDir, f), "utf8");
    const blocks = extractMermaidBlocks(text);
    if (blocks.length > 2) violations.push(`${f}: mermaid 图过多(${blocks.length}>2,可能超载或装饰化)`);
    for (const block of blocks) {
      const first = firstMeaningfulMermaidLine(block.source);
      if (!first || !MERMAID_START_RE.test(first)) {
        violations.push(`${f}:${block.line}: mermaid 起始语法不可识别(${first || "空图"})`);
      }
      if (!hasNearbyProse(text, block.start, block.end)) {
        violations.push(`${f}:${block.line}: mermaid 缺少正文解释/上下文(不要孤立装饰图)`);
      }
    }
  }
  return violations;
}

function extractMentorActionBlocks(text) {
  const blocks = [];
  const fenceRe = /```agentmentor-action[^\n]*\n([\s\S]*?)\n```/g;
  for (const m of text.matchAll(fenceRe)) {
    blocks.push({
      source: m[1].trim(),
      start: m.index,
      end: m.index + m[0].length,
      line: lineNumberAt(text, m.index),
    });
  }
  return blocks;
}

function lastExerciseClose(rest) {
  let last = null;
  for (const m of rest.matchAll(/^<!--\s*\/exercises\s*-->\s*$/gm)) last = m;
  return last;
}

function isInsideExerciseRegion(text, index) {
  const open = /^<!--\s*exercises\s*-->\s*$/m.exec(text);
  if (!open || open.index === undefined) return false;
  const bodyStart = open.index + open[0].length;
  const rest = text.slice(bodyStart);
  const close = lastExerciseClose(rest);
  let end;
  if (close && close.index !== undefined) {
    end = bodyStart + close.index;
  } else {
    // Same contract as course-reader/lib/exercises.ts splitLesson: skip exercise zone's own ## heading,
    // then find next ## as zone end — else zone slices empty. Both impls must stay aligned.
    const ownHeading = rest.match(/^## .*$/m);
    const searchFrom = ownHeading && ownHeading.index !== undefined ? ownHeading.index + ownHeading[0].length : 0;
    const nextOffset = rest.slice(searchFrom).search(/^## /m);
    end = nextOffset === -1 ? text.length : bodyStart + searchFrom + nextOffset;
  }
  return index >= open.index && index < end;
}

function parseSimpleActionFields(src) {
  const fields = new Map();
  const lists = new Map();
  let currentList = "";
  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const item = line.match(/^\s*-\s+(.+)$/);
    if (item && currentList) {
      lists.set(currentList, [...(lists.get(currentList) || []), item[1].trim()]);
      continue;
    }
    const scalar = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!scalar) continue;
    const key = scalar[1];
    const value = scalar[2].trim();
    currentList = value ? "" : key;
    if (value) fields.set(key, value);
    else if (!lists.has(key)) lists.set(key, []);
  }
  return { fields, lists };
}

const GENERIC_MENTOR_ACTION_LABELS = new Set([
  "考考我是不是真懂了",
  "帮我查漏洞",
  "进入实战模拟",
  "复制给 agent",
  "隐藏漏洞检测器",
  "困惑破解者",
  "真实错误模拟器",
  "最坏情景教练",
  "思维捷径检查员",
  "反向教学模拟器",
]);

export function checkMentorActions(courseDir) {
  const violations = [];
  for (const f of lessonFiles(courseDir)) {
    const text = readFileSync(join(courseDir, f), "utf8");
    for (const block of extractMentorActionBlocks(text)) {
      if (isInsideExerciseRegion(text, block.start)) {
        violations.push(`${f}:${block.line}: agentmentor-action 位于 ## 练习 区内(第 ${block.line} 行);合法位置:## 练习 标题之前,或 ## 小结 区结束之后`);
      }
      const { fields, lists } = parseSimpleActionFields(block.source);
      for (const key of ["mode", "label", "description", "purpose"]) {
        const value = fields.get(key);
        if (!value) {
          violations.push(`${f}:${block.line}: agentmentor-action 缺/空 ${key}`);
        } else if (hasPlaceholder(value)) {
          violations.push(`${f}:${block.line}: agentmentor-action ${key} 仍含占位符`);
        }
      }
      const label = fields.get("label") || "";
      if (GENERIC_MENTOR_ACTION_LABELS.has(label.trim())) {
        violations.push(`${f}:${block.line}: agentmentor-action label 是固定模板感文案,需按本节具体问题改写`);
      }
      if (label && label.trim().length < 8) {
        violations.push(`${f}:${block.line}: agentmentor-action label 太短,需写成具体学习动作`);
      }
      for (const key of ["files", "rules"]) {
        const values = lists.get(key);
        if (values && values.some((v) => !v || hasPlaceholder(v))) {
          violations.push(`${f}:${block.line}: agentmentor-action ${key} 含空项或占位符`);
        }
      }
    }
  }
  return violations;
}

function extractInteractiveBlocks(text) {
  const blocks = [];
  const fenceRe = /```(agentmentor-check|agentmentor-order|agentmentor-code|agentmentor-fix|agentmentor-predict|agentmentor-trace|agentmentor-diff|agentmentor-hotspot|agentmentor-live)[^\n]*\n([\s\S]*?)\n```/g;
  for (const m of text.matchAll(fenceRe)) {
    blocks.push({
      language: m[1],
      source: m[2].trim(),
      start: m.index,
      line: lineNumberAt(text, m.index),
    });
  }
  return blocks;
}

const GENERIC_INTERACTIVE_PROMPTS = new Set([
  "考考你",
  "考考我",
  "检验一下",
  "做个小测",
  "小测验",
  "小测",
  "练一下",
  "练一练",
  "测一测",
  "判断一下",
  "排一下",
  "排顺序",
  "猜输出",
  "走变量",
  "补代码",
  "补样式",
  "修代码",
  "读改动",
  "看懂了吗",
]);

function nonEmptyString(value) {
  return typeof value === "string" && value.trim();
}

// Code fields (snippet/starter/diff) with literal \n are double-escaped: JSON wrote \\n,
// renderer shows \n as text. Authors should use real newlines (single \n in JSON).
function checkLiteralEscapedNewline(value, file, line, label, key, violations) {
  if (typeof value === "string" && value.includes("\\n")) {
    violations.push(`${file}:${line}: ${label} ${key} 含字面 \\n(疑似双转义换行,JSON 里应写单个 \\n 产生真实换行)`);
  }
}

function compactText(value) {
  return String(value || "")
    .replace(/[`"'“”‘’]/g, "")
    .replace(/[。.!！?？,，;；:：、\s]/g, "")
    .trim();
}

function genericInteractiveReason(value) {
  const compact = compactText(value);
  if (!compact) return "";
  if (GENERIC_INTERACTIVE_PROMPTS.has(String(value).trim()) || GENERIC_INTERACTIVE_PROMPTS.has(compact)) {
    return "固定模板文案";
  }
  if (compact.length <= 8 && /^(?:请)?(?:考考(?:我|你)?|检验|小测|练习?|判断|排一下|猜一下|填一下|看懂)/.test(compact)) {
    return "过短泛互动文案";
  }
  return "";
}

function validateSpecificInteractiveText(value, file, line, language, field, violations) {
  const reason = genericInteractiveReason(value);
  if (reason) {
    violations.push(`${file}:${line}: ${language} ${field} 是${reason},需贴本节具体误区或动作`);
  }
}

const GENERIC_FEEDBACK_TEXTS = new Set([
  "对",
  "对了",
  "正确",
  "很好",
  "答对了",
  "错",
  "错了",
  "不对",
  "错误",
  "答错了",
  "再试试",
  "再看",
  "重来",
  "也是对",
]);

const ANSWER_LEAK_RE = /(?:答案|正确选项|正确答案|选项)\s*(?:是|为|:|：)?\s*[A-Ea-e]\b|选\s*[A-Ea-e]\b|answer\s+is\s+[A-Ea-e]\b/i;

function validateMechanismFeedback(value, file, line, label, field, violations) {
  if (!nonEmptyString(value)) return;
  const compact = compactText(value);
  if (GENERIC_FEEDBACK_TEXTS.has(compact) || compact.length < 6) {
    violations.push(`${file}:${line}: ${label} ${field} 只给对错或过短,需解释机制`);
  }
  if (ANSWER_LEAK_RE.test(value)) {
    violations.push(`${file}:${line}: ${label} ${field} 泄露答案位置,不要写“答案是 B”`);
  }
}

function validateCheckBlock(data, file, line, violations) {
  const mode = data.mode === "multi" ? "multi" : data.mode === "single" ? "single" : "";
  if (!mode) violations.push(`${file}:${line}: agentmentor-check mode 必须是 single 或 multi`);
  if (Object.prototype.hasOwnProperty.call(data, "copyPurpose")) {
    if (!nonEmptyString(data.copyPurpose)) {
      violations.push(`${file}:${line}: agentmentor-check copyPurpose 已提供但为空`);
    } else if (hasPlaceholder(data.copyPurpose)) {
      violations.push(`${file}:${line}: agentmentor-check copyPurpose 仍含占位符`);
    } else {
      validateSpecificInteractiveText(data.copyPurpose, file, line, "agentmentor-check", "copyPurpose", violations);
    }
  }
  if (!Array.isArray(data.choices) || data.choices.length < 2 || data.choices.length > 5) {
    violations.push(`${file}:${line}: agentmentor-check choices 必须是 2-5 个`);
    return;
  }
  const choiceIds = new Set();
  let correct = 0;
  for (const [i, choice] of data.choices.entries()) {
    if (!choice || typeof choice !== "object" || Array.isArray(choice)) {
      violations.push(`${file}:${line}: agentmentor-check choices[${i}] 必须是对象`);
      continue;
    }
    for (const key of ["id", "text", "feedback"]) {
      if (!nonEmptyString(choice[key])) violations.push(`${file}:${line}: agentmentor-check choices[${i}] 缺/空 ${key}`);
      else if (hasPlaceholder(choice[key])) violations.push(`${file}:${line}: agentmentor-check choices[${i}].${key} 仍含占位符`);
    }
    validateMechanismFeedback(choice.feedback, file, line, "agentmentor-check", `choices[${i}].feedback`, violations);
    if (nonEmptyString(choice.id)) {
      if (choiceIds.has(choice.id)) violations.push(`${file}:${line}: agentmentor-check choice id 重复: ${choice.id}`);
      else choiceIds.add(choice.id);
    }
    if (choice.correct === true) correct++;
  }
  if (correct === 0) violations.push(`${file}:${line}: agentmentor-check 至少需要一个正确选项`);
  if (mode === "single" && correct !== 1) violations.push(`${file}:${line}: agentmentor-check single 模式必须且只能有一个正确选项`);
}

function validateOrderBlock(data, file, line, violations) {
  if (!Array.isArray(data.items) || data.items.length < 3 || data.items.length > 7) {
    violations.push(`${file}:${line}: agentmentor-order items 必须是 3-7 个`);
    return;
  }
  if (!Array.isArray(data.correctOrder)) {
    violations.push(`${file}:${line}: agentmentor-order correctOrder 必须是数组`);
    return;
  }
  for (const key of ["feedback", "feedbackWrong"]) {
    if (!nonEmptyString(data[key])) violations.push(`${file}:${line}: agentmentor-order 缺/空 ${key}`);
    else if (hasPlaceholder(data[key])) violations.push(`${file}:${line}: agentmentor-order ${key} 仍含占位符`);
    else validateMechanismFeedback(data[key], file, line, "agentmentor-order", key, violations);
  }
  if (Object.prototype.hasOwnProperty.call(data, "copyPurpose")) {
    if (!nonEmptyString(data.copyPurpose)) {
      violations.push(`${file}:${line}: agentmentor-order copyPurpose 已提供但为空`);
    } else if (hasPlaceholder(data.copyPurpose)) {
      violations.push(`${file}:${line}: agentmentor-order copyPurpose 仍含占位符`);
    } else {
      validateSpecificInteractiveText(data.copyPurpose, file, line, "agentmentor-order", "copyPurpose", violations);
    }
  }

  const ids = new Set();
  for (const [i, item] of data.items.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      violations.push(`${file}:${line}: agentmentor-order items[${i}] 必须是对象`);
      continue;
    }
    for (const key of ["id", "text"]) {
      if (!nonEmptyString(item[key])) violations.push(`${file}:${line}: agentmentor-order items[${i}] 缺/空 ${key}`);
      else if (hasPlaceholder(item[key])) violations.push(`${file}:${line}: agentmentor-order items[${i}].${key} 仍含占位符`);
    }
    if (nonEmptyString(item.id)) {
      if (ids.has(item.id)) violations.push(`${file}:${line}: agentmentor-order item id 重复: ${item.id}`);
      else ids.add(item.id);
    }
  }
  if (data.correctOrder.length !== data.items.length) {
    violations.push(`${file}:${line}: agentmentor-order correctOrder 必须覆盖所有 items`);
  }
  for (const id of data.correctOrder) {
    if (typeof id !== "string" || !id.trim()) {
      violations.push(`${file}:${line}: agentmentor-order correctOrder 含空 id`);
    } else if (!ids.has(id)) {
      violations.push(`${file}:${line}: agentmentor-order correctOrder 含未知 id: ${id}`);
    }
  }
}

const CODE_LANGUAGES = new Set(["css", "javascript", "typescript", "jsx", "tsx", "html", "python", "text"]);
const CODE_CHECK_TYPES = new Set(["includes", "notIncludes", "regex"]);
const PREDICT_MATCH_MODES = new Set(["exact", "normalized", "contains", "regex"]);
const HOTSPOT_LAYOUTS = new Set(["flow", "stack", "map"]);

function hasTrueAddedAndRemovedLines(diff) {
  return {
    added: /^\+(?!\+\+)/m.test(diff),
    removed: /^-(?!--)/m.test(diff),
  };
}

function validateCodeBlock(data, file, line, violations, label = "agentmentor-code") {
  const language = nonEmptyString(data.language) ? data.language.trim().toLowerCase() : "";
  if (!CODE_LANGUAGES.has(language)) {
    violations.push(`${file}:${line}: ${label} language 必须是 css/javascript/typescript/jsx/tsx/html/python/text`);
  }
  if (label === "agentmentor-fix") {
    if (!nonEmptyString(data.bug)) {
      violations.push(`${file}:${line}: ${label} 缺/空 bug`);
    } else if (hasPlaceholder(data.bug)) {
      violations.push(`${file}:${line}: ${label} bug 仍含占位符`);
    }
  }
  if (!nonEmptyString(data.starter)) violations.push(`${file}:${line}: ${label} 缺/空 starter`);
  checkLiteralEscapedNewline(data.starter, file, line, label, "starter", violations);
  if (!nonEmptyString(data.copyPurpose)) {
    violations.push(`${file}:${line}: ${label} 缺/空 copyPurpose`);
  } else if (hasPlaceholder(data.copyPurpose)) {
    violations.push(`${file}:${line}: ${label} copyPurpose 仍含占位符`);
  } else {
    validateSpecificInteractiveText(data.copyPurpose, file, line, label, "copyPurpose", violations);
  }

  if (!Array.isArray(data.checks) || data.checks.length < 1 || data.checks.length > 6) {
    violations.push(`${file}:${line}: ${label} checks 必须是 1-6 条`);
    return;
  }

  const ids = new Set();
  for (const [i, check] of data.checks.entries()) {
    if (!check || typeof check !== "object" || Array.isArray(check)) {
      violations.push(`${file}:${line}: ${label} checks[${i}] 必须是对象`);
      continue;
    }

    if (!nonEmptyString(check.id)) {
      violations.push(`${file}:${line}: ${label} checks[${i}] 缺/空 id`);
    } else if (hasPlaceholder(check.id)) {
      violations.push(`${file}:${line}: ${label} checks[${i}].id 仍含占位符`);
    } else if (ids.has(check.id)) {
      violations.push(`${file}:${line}: ${label} check id 重复: ${check.id}`);
    } else {
      ids.add(check.id);
    }

    const checkType = nonEmptyString(check.type) ? check.type.trim() : "";
    if (!CODE_CHECK_TYPES.has(checkType)) {
      violations.push(`${file}:${line}: ${label} checks[${i}].type 必须是 includes/notIncludes/regex`);
    }

    if (!nonEmptyString(check.message)) {
      violations.push(`${file}:${line}: ${label} checks[${i}] 缺/空 message`);
    } else if (hasPlaceholder(check.message)) {
      violations.push(`${file}:${line}: ${label} checks[${i}].message 仍含占位符`);
    } else {
      validateMechanismFeedback(check.message, file, line, label, `checks[${i}].message`, violations);
    }

    if ((checkType === "includes" || checkType === "notIncludes")) {
      if (!nonEmptyString(check.value)) {
        violations.push(`${file}:${line}: ${label} checks[${i}] ${checkType} 缺/空 value`);
      } else if (hasPlaceholder(check.value)) {
        violations.push(`${file}:${line}: ${label} checks[${i}].value 仍含占位符`);
      }
    }

    if (checkType === "regex") {
      if (!nonEmptyString(check.pattern)) {
        violations.push(`${file}:${line}: ${label} checks[${i}] regex 缺/空 pattern`);
      } else {
        try {
          new RegExp(check.pattern);
        } catch (error) {
          violations.push(`${file}:${line}: ${label} checks[${i}] regex pattern 不可编译: ${error.message}`);
        }
      }
    }
  }
}

function validatePredictBlock(data, file, line, violations) {
  const language = nonEmptyString(data.language) ? data.language.trim().toLowerCase() : "";
  if (language && !CODE_LANGUAGES.has(language)) {
    violations.push(`${file}:${line}: agentmentor-predict language 必须是 css/javascript/typescript/jsx/tsx/html/python/text`);
  }
  checkLiteralEscapedNewline(data.snippet, file, line, "agentmentor-predict", "snippet", violations);
  for (const key of ["snippet", "feedbackCorrect", "feedbackWrong", "copyPurpose"]) {
    if (!nonEmptyString(data[key])) {
      violations.push(`${file}:${line}: agentmentor-predict 缺/空 ${key}`);
    } else if (key !== "snippet" && hasPlaceholder(data[key])) {
      violations.push(`${file}:${line}: agentmentor-predict ${key} 仍含占位符`);
    } else if (key === "feedbackCorrect" || key === "feedbackWrong") {
      validateMechanismFeedback(data[key], file, line, "agentmentor-predict", key, violations);
    } else if (key === "copyPurpose") {
      validateSpecificInteractiveText(data[key], file, line, "agentmentor-predict", key, violations);
    }
  }

  const match = nonEmptyString(data.match) ? data.match.trim() : "";
  if (!PREDICT_MATCH_MODES.has(match)) {
    violations.push(`${file}:${line}: agentmentor-predict match 必须是 exact/normalized/contains/regex`);
    return;
  }
  if (match === "regex") {
    if (!nonEmptyString(data.pattern)) {
      violations.push(`${file}:${line}: agentmentor-predict regex 缺/空 pattern`);
    } else {
      try {
        new RegExp(data.pattern);
      } catch (error) {
        violations.push(`${file}:${line}: agentmentor-predict regex pattern 不可编译: ${error.message}`);
      }
    }
  } else if (!nonEmptyString(data.expected)) {
    violations.push(`${file}:${line}: agentmentor-predict 缺/空 expected`);
  }
}

function traceCellAnswer(cell) {
  if (typeof cell === "string") return cell;
  if (cell && typeof cell === "object" && !Array.isArray(cell)) {
    if (typeof cell.answer === "string") return cell.answer;
    if (typeof cell.value === "string") return cell.value;
  }
  return "";
}

function traceCellGiven(cell) {
  return Boolean(cell && typeof cell === "object" && !Array.isArray(cell) && cell.given === true);
}

function validateTraceBlock(data, file, line, violations) {
  const language = nonEmptyString(data.language) ? data.language.trim().toLowerCase() : "";
  if (language && !CODE_LANGUAGES.has(language)) {
    violations.push(`${file}:${line}: agentmentor-trace language 必须是 css/javascript/typescript/jsx/tsx/html/python/text`);
  }
  checkLiteralEscapedNewline(data.snippet, file, line, "agentmentor-trace", "snippet", violations);
  for (const key of ["snippet", "feedbackCorrect", "feedbackWrong", "copyPurpose"]) {
    if (!nonEmptyString(data[key])) {
      violations.push(`${file}:${line}: agentmentor-trace 缺/空 ${key}`);
    } else if (key !== "snippet" && hasPlaceholder(data[key])) {
      violations.push(`${file}:${line}: agentmentor-trace ${key} 仍含占位符`);
    } else if (key === "feedbackCorrect" || key === "feedbackWrong") {
      validateMechanismFeedback(data[key], file, line, "agentmentor-trace", key, violations);
    } else if (key === "copyPurpose") {
      validateSpecificInteractiveText(data[key], file, line, "agentmentor-trace", key, violations);
    }
  }

  if (!Array.isArray(data.columns) || data.columns.length < 2 || data.columns.length > 6) {
    violations.push(`${file}:${line}: agentmentor-trace columns 必须是 2-6 个`);
    return;
  }
  if (!Array.isArray(data.rows) || data.rows.length < 2 || data.rows.length > 8) {
    violations.push(`${file}:${line}: agentmentor-trace rows 必须是 2-8 行`);
    return;
  }

  const columnIds = new Set();
  for (const [i, column] of data.columns.entries()) {
    if (!column || typeof column !== "object" || Array.isArray(column)) {
      violations.push(`${file}:${line}: agentmentor-trace columns[${i}] 必须是对象`);
      continue;
    }
    for (const key of ["id", "label"]) {
      if (!nonEmptyString(column[key])) violations.push(`${file}:${line}: agentmentor-trace columns[${i}] 缺/空 ${key}`);
      else if (hasPlaceholder(column[key])) violations.push(`${file}:${line}: agentmentor-trace columns[${i}].${key} 仍含占位符`);
    }
    if (nonEmptyString(column.id)) {
      if (columnIds.has(column.id)) violations.push(`${file}:${line}: agentmentor-trace column id 重复: ${column.id}`);
      else columnIds.add(column.id);
    }
  }

  const rowIds = new Set();
  let editableCells = 0;
  for (const [i, row] of data.rows.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      violations.push(`${file}:${line}: agentmentor-trace rows[${i}] 必须是对象`);
      continue;
    }
    for (const key of ["id", "label"]) {
      if (!nonEmptyString(row[key])) violations.push(`${file}:${line}: agentmentor-trace rows[${i}] 缺/空 ${key}`);
      else if (hasPlaceholder(row[key])) violations.push(`${file}:${line}: agentmentor-trace rows[${i}].${key} 仍含占位符`);
    }
    if (nonEmptyString(row.id)) {
      if (rowIds.has(row.id)) violations.push(`${file}:${line}: agentmentor-trace row id 重复: ${row.id}`);
      else rowIds.add(row.id);
    }
    if (!row.cells || typeof row.cells !== "object" || Array.isArray(row.cells)) {
      violations.push(`${file}:${line}: agentmentor-trace rows[${i}].cells 必须是对象`);
      continue;
    }
    for (const column of data.columns) {
      if (!column || typeof column !== "object" || !nonEmptyString(column.id)) continue;
      if (!Object.prototype.hasOwnProperty.call(row.cells, column.id)) {
        violations.push(`${file}:${line}: agentmentor-trace rows[${i}].cells 缺 column ${column.id}`);
        continue;
      }
      const cell = row.cells[column.id];
      const answer = traceCellAnswer(cell);
      if (!nonEmptyString(answer)) {
        violations.push(`${file}:${line}: agentmentor-trace ${row.id || `rows[${i}]`}.${column.id} 缺/空答案`);
      }
      if (!traceCellGiven(cell)) editableCells++;
    }
  }
  if (editableCells === 0) violations.push(`${file}:${line}: agentmentor-trace 至少需要一个可填写单元格`);
}

function validateDiffBlock(data, file, line, violations) {
  const language = nonEmptyString(data.language) ? data.language.trim().toLowerCase() : "";
  if (!CODE_LANGUAGES.has(language)) {
    violations.push(`${file}:${line}: agentmentor-diff language 必须是 css/javascript/typescript/jsx/tsx/html/python/text`);
  }
  checkLiteralEscapedNewline(data.diff, file, line, "agentmentor-diff", "diff", violations);
  for (const key of ["focus", "diff", "copyPurpose"]) {
    if (!nonEmptyString(data[key])) {
      violations.push(`${file}:${line}: agentmentor-diff 缺/空 ${key}`);
    } else if (key !== "diff" && hasPlaceholder(data[key])) {
      violations.push(`${file}:${line}: agentmentor-diff ${key} 仍含占位符`);
    } else if (key === "focus" && ANSWER_LEAK_RE.test(data[key])) {
      violations.push(`${file}:${line}: agentmentor-diff focus 泄露答案位置,不要写“答案是 B”`);
    } else if (key === "copyPurpose") {
      validateSpecificInteractiveText(data[key], file, line, "agentmentor-diff", key, violations);
    }
  }

  if (nonEmptyString(data.diff)) {
    const lines = hasTrueAddedAndRemovedLines(data.diff);
    if (!lines.added) violations.push(`${file}:${line}: agentmentor-diff diff 至少需要一条真实新增行`);
    if (!lines.removed) violations.push(`${file}:${line}: agentmentor-diff diff 至少需要一条真实删除行`);
    const lineCount = data.diff.split(/\r?\n/).filter((diffLine) => diffLine.trim()).length;
    if (lineCount > 45) violations.push(`${file}:${line}: agentmentor-diff diff 过长(${lineCount}>45 行),请拆小或放到练习/agent 回路`);
  }

  if (!Array.isArray(data.choices) || data.choices.length < 2 || data.choices.length > 5) {
    violations.push(`${file}:${line}: agentmentor-diff choices 必须是 2-5 个`);
    return;
  }

  const choiceIds = new Set();
  let correct = 0;
  for (const [i, choice] of data.choices.entries()) {
    if (!choice || typeof choice !== "object" || Array.isArray(choice)) {
      violations.push(`${file}:${line}: agentmentor-diff choices[${i}] 必须是对象`);
      continue;
    }
    for (const key of ["id", "text", "feedback"]) {
      if (!nonEmptyString(choice[key])) violations.push(`${file}:${line}: agentmentor-diff choices[${i}] 缺/空 ${key}`);
      else if (hasPlaceholder(choice[key])) violations.push(`${file}:${line}: agentmentor-diff choices[${i}].${key} 仍含占位符`);
    }
    validateMechanismFeedback(choice.feedback, file, line, "agentmentor-diff", `choices[${i}].feedback`, violations);
    if (nonEmptyString(choice.id)) {
      if (choiceIds.has(choice.id)) violations.push(`${file}:${line}: agentmentor-diff choice id 重复: ${choice.id}`);
      else choiceIds.add(choice.id);
    }
    if (choice.correct === true) correct++;
  }
  if (correct !== 1) violations.push(`${file}:${line}: agentmentor-diff 必须且只能有一个正确选项`);
}

function validPercent(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

export function validateLiveBlock(data, file, line, violations) {
  const MAX_FILE_BYTES = 4096;
  const EXTERNAL_URL = /https?:\/\//i;
  const KEYS = ["html", "css", "js"];

  // Keep in sync with course-reader/lib/live-sandbox.ts SUPPORTED_LIVE_VERSIONS (dual impl, cross-ref there)
  const SUPPORTED_LIVE_VERSIONS = [1];
  if (data.v !== undefined) {
    if (!Number.isInteger(data.v) || data.v < 1) {
      violations.push(`${file}:${line}: agentmentor-live v 必须是正整数`);
    } else if (!SUPPORTED_LIVE_VERSIONS.includes(data.v)) {
      violations.push(`${file}:${line}: agentmentor-live v=${data.v} 不被当前工具链支持`);
    }
  }

  for (const key of ["id", "label", "goal", "copyPurpose"]) {
    if (!nonEmptyString(data[key])) {
      violations.push(`${file}:${line}: agentmentor-live 缺/空 ${key}`);
    } else if (hasPlaceholder(data[key])) {
      violations.push(`${file}:${line}: agentmentor-live ${key} 仍含占位符`);
    }
  }

  const files = data.files && typeof data.files === "object" && !Array.isArray(data.files) ? data.files : {};
  const present = KEYS.filter((k) => {
    const val = files[k];
    return typeof val === "string" && val.trim().length > 0;
  });

  if (present.length === 0) {
    violations.push(`${file}:${line}: agentmentor-live files 至少要有一段(html/css/js)非空`);
  }

  for (const k of KEYS) {
    const val = typeof files[k] === "string" ? files[k] : "";
    if (Buffer.byteLength(val, "utf8") > MAX_FILE_BYTES) {
      violations.push(`${file}:${line}: agentmentor-live files.${k} 超过 ${MAX_FILE_BYTES} 字节`);
    }
    if (val && EXTERNAL_URL.test(val)) {
      violations.push(`${file}:${line}: agentmentor-live files.${k} 含外部 URL(必须自包含,不许外链)`);
    }
  }

  const solution = data.solution && typeof data.solution === "object" && !Array.isArray(data.solution) ? data.solution : {};
  for (const k of Object.keys(solution)) {
    if (!KEYS.includes(k)) continue;
    const fileVal = typeof files[k] === "string" ? files[k] : "";
    if (!fileVal || !fileVal.trim()) {
      violations.push(`${file}:${line}: agentmentor-live solution.${k} 对应的 files.${k} 不存在或为空`);
    }
    const solVal = typeof solution[k] === "string" ? solution[k] : "";
    if (Buffer.byteLength(solVal, "utf8") > MAX_FILE_BYTES) {
      violations.push(`${file}:${line}: agentmentor-live solution.${k} 超过 ${MAX_FILE_BYTES} 字节`);
    }
    if (EXTERNAL_URL.test(solVal)) {
      violations.push(`${file}:${line}: agentmentor-live solution.${k} 含外部 URL`);
    }
  }

  if (data.choices !== undefined) {
    const c = data.choices;
    if (typeof c !== "object" || c === null || Array.isArray(c)) {
      violations.push(`${file}:${line}: agentmentor-live choices 必须是 object`);
    } else {
      if (!KEYS.includes(c.target)) {
        violations.push(`${file}:${line}: agentmentor-live choices.target 必须是 html/css/js`);
      } else if (typeof files[c.target] !== "string" || !files[c.target].trim()) {
        violations.push(`${file}:${line}: agentmentor-live choices.target 指向的 files.${c.target} 不存在或为空`);
      }
      const items = Array.isArray(c.items) ? c.items : [];
      if (!Array.isArray(c.items) || items.length < 2 || items.length > 6) {
        violations.push(`${file}:${line}: agentmentor-live choices.items 必须 2-6 个`);
      }
      const seen = new Set();
      for (const it of items) {
        const label = typeof it?.label === "string" ? it.label : "";
        const code = typeof it?.code === "string" ? it.code : "";
        if (!label.trim() || label.length > 24) violations.push(`${file}:${line}: agentmentor-live choices label 必须非空且 ≤24 字符`);
        if (seen.has(label)) violations.push(`${file}:${line}: agentmentor-live choices label "${label}" 必须唯一`);
        seen.add(label);
        if (Buffer.byteLength(code, "utf8") > 1024) violations.push(`${file}:${line}: agentmentor-live choices code 超过 1024 字节`);
        if (EXTERNAL_URL.test(code)) violations.push(`${file}:${line}: agentmentor-live choices code 含外部 URL`);
      }
      if (typeof c.intro === "string" && c.intro.length > 120) violations.push(`${file}:${line}: agentmentor-live choices intro 超过 120 字符`);
    }
  }

  if (data.checks !== undefined) {
    // Keep in sync with course-reader/lib/live-sandbox.ts checks validation (dual impl cross-ref)
    const checks = Array.isArray(data.checks) ? data.checks : null;
    if (!checks) {
      violations.push(`${file}:${line}: agentmentor-live checks 必须是数组`);
    } else {
      if (checks.length < 1 || checks.length > 8) violations.push(`${file}:${line}: agentmentor-live checks 必须 1-8 个`);
      for (const c of checks) {
        const selector = typeof c?.selector === "string" ? c.selector : "";
        if (!selector.trim() || selector.length > 200) violations.push(`${file}:${line}: agentmentor-live checks selector 必须非空且 ≤200 字符`);
        if (c?.css === undefined && c?.text === undefined && c?.count === undefined) {
          violations.push(`${file}:${line}: agentmentor-live checks 每项至少给 css/text/count 一种断言`);
        }
        if (c?.css && typeof c.css === "object" && !Array.isArray(c.css)) {
          for (const [k, v] of Object.entries(c.css)) {
            if (!String(k).trim() || typeof v !== "string" || !v.trim()) violations.push(`${file}:${line}: agentmentor-live checks css 键值必须非空字符串`);
          }
        }
        if (c?.count !== undefined && (!Number.isInteger(c.count) || c.count < 1)) {
          violations.push(`${file}:${line}: agentmentor-live checks count 必须是正整数`);
        }
        if (typeof c?.text === "string" && hasPlaceholder(c.text)) {
          violations.push(`${file}:${line}: agentmentor-live checks text 仍含占位符`);
        }
      }
    }
  }
}

function validateHotspotBlock(data, file, line, violations) {
  const layout = nonEmptyString(data.layout) ? data.layout.trim() : "";
  if (!HOTSPOT_LAYOUTS.has(layout)) {
    violations.push(`${file}:${line}: agentmentor-hotspot layout 必须是 flow/stack/map`);
  }
  if (!nonEmptyString(data.copyPurpose)) {
    violations.push(`${file}:${line}: agentmentor-hotspot 缺/空 copyPurpose`);
  } else if (hasPlaceholder(data.copyPurpose)) {
    violations.push(`${file}:${line}: agentmentor-hotspot copyPurpose 仍含占位符`);
  } else {
    validateSpecificInteractiveText(data.copyPurpose, file, line, "agentmentor-hotspot", "copyPurpose", violations);
  }

  if (!Array.isArray(data.nodes) || data.nodes.length < 3 || data.nodes.length > 8) {
    violations.push(`${file}:${line}: agentmentor-hotspot nodes 必须是 3-8 个`);
    return;
  }
  if (Array.isArray(data.edges) && data.edges.length > 10) {
    violations.push(`${file}:${line}: agentmentor-hotspot edges 最多 10 条`);
  }
  if (!Array.isArray(data.hotspots) || data.hotspots.length < 2 || data.hotspots.length > 6) {
    violations.push(`${file}:${line}: agentmentor-hotspot hotspots 必须是 2-6 个`);
    return;
  }

  const nodeIds = new Set();
  for (const [i, node] of data.nodes.entries()) {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      violations.push(`${file}:${line}: agentmentor-hotspot nodes[${i}] 必须是对象`);
      continue;
    }
    for (const key of ["id", "label"]) {
      if (!nonEmptyString(node[key])) violations.push(`${file}:${line}: agentmentor-hotspot nodes[${i}] 缺/空 ${key}`);
      else if (hasPlaceholder(node[key])) violations.push(`${file}:${line}: agentmentor-hotspot nodes[${i}].${key} 仍含占位符`);
    }
    if (nonEmptyString(node.id)) {
      if (nodeIds.has(node.id)) violations.push(`${file}:${line}: agentmentor-hotspot node id 重复: ${node.id}`);
      else nodeIds.add(node.id);
    }
    if (!validPercent(node.x) || !validPercent(node.y)) {
      violations.push(`${file}:${line}: agentmentor-hotspot nodes[${i}] 坐标必须是 0-100 数字`);
    }
  }

  const edges = Array.isArray(data.edges) ? data.edges : [];
  for (const [i, edge] of edges.entries()) {
    if (!edge || typeof edge !== "object" || Array.isArray(edge)) {
      violations.push(`${file}:${line}: agentmentor-hotspot edges[${i}] 必须是对象`);
      continue;
    }
    for (const key of ["from", "to"]) {
      if (!nonEmptyString(edge[key])) {
        violations.push(`${file}:${line}: agentmentor-hotspot edges[${i}] 缺/空 ${key}`);
      } else if (!nodeIds.has(edge[key])) {
        violations.push(`${file}:${line}: agentmentor-hotspot edges[${i}].${key} 引用未知节点: ${edge[key]}`);
      }
    }
    if (Object.prototype.hasOwnProperty.call(edge, "label")) {
      if (typeof edge.label !== "string") violations.push(`${file}:${line}: agentmentor-hotspot edges[${i}].label 必须是字符串`);
      else if (hasPlaceholder(edge.label)) violations.push(`${file}:${line}: agentmentor-hotspot edges[${i}].label 仍含占位符`);
    }
  }

  const hotspotNodeIds = new Set();
  let correct = 0;
  for (const [i, hotspot] of data.hotspots.entries()) {
    if (!hotspot || typeof hotspot !== "object" || Array.isArray(hotspot)) {
      violations.push(`${file}:${line}: agentmentor-hotspot hotspots[${i}] 必须是对象`);
      continue;
    }
    if (!nonEmptyString(hotspot.nodeId)) {
      violations.push(`${file}:${line}: agentmentor-hotspot hotspots[${i}] 缺/空 nodeId`);
    } else if (!nodeIds.has(hotspot.nodeId)) {
      violations.push(`${file}:${line}: agentmentor-hotspot hotspots[${i}].nodeId 引用未知节点: ${hotspot.nodeId}`);
    } else if (hotspotNodeIds.has(hotspot.nodeId)) {
      violations.push(`${file}:${line}: agentmentor-hotspot hotspot nodeId 重复: ${hotspot.nodeId}`);
    } else {
      hotspotNodeIds.add(hotspot.nodeId);
    }
    if (!nonEmptyString(hotspot.feedback)) {
      violations.push(`${file}:${line}: agentmentor-hotspot hotspots[${i}] 缺/空 feedback`);
    } else if (hasPlaceholder(hotspot.feedback)) {
      violations.push(`${file}:${line}: agentmentor-hotspot hotspots[${i}].feedback 仍含占位符`);
    } else {
      validateMechanismFeedback(hotspot.feedback, file, line, "agentmentor-hotspot", `hotspots[${i}].feedback`, violations);
    }
    if (hotspot.correct === true) correct++;
  }
  if (correct !== 1) violations.push(`${file}:${line}: agentmentor-hotspot 必须且只能有一个正确热点`);
}

export function checkInteractiveBlocks(courseDir) {
  const violations = [];
  const ids = new Set();
  for (const f of lessonFiles(courseDir)) {
    const text = readFileSync(join(courseDir, f), "utf8");
    const blocks = extractInteractiveBlocks(text);
    if (blocks.length > 2) violations.push(`${f}: 互动块过多(${blocks.length}>2),可能喧宾夺主`);
    let liveBlockCount = 0;
    for (const block of blocks) {
      if (block.language === "agentmentor-live") {
        liveBlockCount++;
      }
      if (isInsideExerciseRegion(text, block.start)) {
        violations.push(`${f}:${block.line}: ${block.language} 位于 ## 练习 区内,请移到正文讲解区`);
      }
      let data;
      try {
        data = JSON.parse(block.source);
      } catch (error) {
        violations.push(`${f}:${block.line}: ${block.language} JSON 解析失败: ${error.message}`);
        continue;
      }
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        violations.push(`${f}:${block.line}: ${block.language} 必须是 JSON object`);
        continue;
      }
      if (block.language === "agentmentor-live") {
        validateLiveBlock(data, f, block.line, violations);
        continue;
      }
      for (const key of ["id", "label", "prompt", "whyHere"]) {
        const value = data[key];
        if (!nonEmptyString(value)) {
          violations.push(`${f}:${block.line}: ${block.language} 缺/空 ${key}`);
        } else if (hasPlaceholder(value)) {
          violations.push(`${f}:${block.line}: ${block.language} ${key} 仍含占位符`);
        }
      }
      const id = nonEmptyString(data.id) ? data.id.trim() : "";
      if (id) {
        if (ids.has(id)) violations.push(`${f}:${block.line}: 互动块 id 重复: ${id}`);
        else ids.add(id);
      }
      const prompt = nonEmptyString(data.prompt) ? data.prompt.trim() : "";
      validateSpecificInteractiveText(prompt, f, block.line, block.language, "prompt", violations);
      const label = nonEmptyString(data.label) ? data.label.trim() : "";
      validateSpecificInteractiveText(label, f, block.line, block.language, "label", violations);
      if (block.language === "agentmentor-check") validateCheckBlock(data, f, block.line, violations);
      if (block.language === "agentmentor-order") validateOrderBlock(data, f, block.line, violations);
      if (block.language === "agentmentor-code") validateCodeBlock(data, f, block.line, violations);
      if (block.language === "agentmentor-fix") validateCodeBlock(data, f, block.line, violations, "agentmentor-fix");
      if (block.language === "agentmentor-predict") validatePredictBlock(data, f, block.line, violations);
      if (block.language === "agentmentor-trace") validateTraceBlock(data, f, block.line, violations);
      if (block.language === "agentmentor-diff") validateDiffBlock(data, f, block.line, violations);
      if (block.language === "agentmentor-hotspot") validateHotspotBlock(data, f, block.line, violations);
    }
    if (liveBlockCount > 1) {
      violations.push(`${f}: agentmentor-live 块超过 1 个(${liveBlockCount}>1),它重,每节最多 1 个`);
    }
  }
  return violations;
}

export function checkCourseLogo(courseDir) {
  const p = join(courseDir, "logo.svg");
  if (!existsSync(p)) return [];
  const v = [];
  const svg = readFileSync(p, "utf8");
  if (Buffer.byteLength(svg, "utf8") > 2000) v.push("logo.svg: over 2000 bytes (line art, 2-3 strokes)");
  if (!/viewBox="0 0 48 48"/.test(svg)) v.push('logo.svg: viewBox must be "0 0 48 48"');
  if (!/stroke="currentColor"/.test(svg)) v.push('logo.svg: stroke must be currentColor (reader tints it)');
  if (/<script\b|\son[a-z]+\s*=|<image\b|href\s*=|url\(|<foreignObject\b/i.test(svg)) v.push("logo.svg: scripts/handlers/external refs banned");
  if (/<text\b|<tspan\b/i.test(svg)) v.push("logo.svg: letterforms/text banned");
  const shapes = (svg.match(/<(path|line|circle|rect|polyline|ellipse)\b/g) || []).length;
  if (shapes < 1 || shapes > 3) v.push(`logo.svg: 1-3 shape elements required, found ${shapes}`);
  return v;
}

const RISKY_CLAIM_PATTERNS = [
  {
    re: /\bNext\.js\s+\d+(?:\.(?:\d+|x)){1,3}\b/i,
    label: "硬编码 Next.js 版本号,容易过时",
  },
  {
    re: /\btailwind\.config\.(?:js|ts|mjs|cjs)\b/i,
    label: "把 tailwind.config.* 当成默认项目结构,可能过时",
  },
  {
    re: /Next\.js\s*默认(?:集成|包含|自带).{0,30}Tailwind/i,
    label: "Next.js 默认集成 Tailwind 的绝对化说法",
  },
  {
    re: /(?:个人项目|个人使用|项目).{0,12}(?:完全免费|永久免费)/,
    label: "价格/免费额度绝对化说法",
  },
  {
    re: /搜索引擎.{0,20}(?:空壳|一堆空壳)/,
    label: "SEO 空壳的绝对化说法",
  },
  {
    re: /官方肯定用自己的框架/,
    label: "把推测当证据",
  },
  {
    re: /(?:默认情况下[，,]?\s*)?React\s*组件.{0,12}(?:服务器端渲染|服务端渲染|服务器上渲染)/i,
    label: "把 Next App Router 的默认 Server Component 行为泛化成 React 默认行为",
  },
];

export function checkRiskyClaims(courseDir) {
  const violations = [];
  for (const { file, text } of readCourseMarkdownFiles(courseDir)) {
    for (const { re, label } of RISKY_CLAIM_PATTERNS) {
      if (re.test(text)) violations.push(`${file}: 危险话术/过时痕迹: ${label}`);
    }
  }
  return violations;
}

export function checkBeginnerBridge(courseDir) {
  const readmePath = join(courseDir, "README.md");
  if (!existsSync(readmePath)) return [];
  const readme = readFileSync(readmePath, "utf8");
  const isNextCourse = /Next\.js/i.test(readme);
  const weakReactJs =
    /(?:不懂|不会|零基础|没有.{0,6}基础).{0,20}(?:React|JavaScript|JS)/i.test(readme) ||
    /(?:React|JavaScript|JS).{0,20}(?:不懂|不会|不太了解|不熟|零基础|基础薄弱)/i.test(readme);
  if (!isNextCourse || !weakReactJs) return [];

  const early = lessonFiles(courseDir)
    .slice(0, 3)
    .map((f) => readFileSync(join(courseDir, f), "utf8"))
    .join("\n");
  const hasReactBridge = /JSX|组件|component|props|属性/.test(early);
  const hasJsBridge = /JavaScript|\bJS\b|函数|变量|数组|\bmap\b|对象|事件|useState/i.test(early);
  if (hasReactBridge && hasJsBridge) return [];
  return ["Next.js 课程声明学员不懂 React/JS,但前三节缺少最小 React/JS 桥接(JSX/组件/props + JavaScript 基础)"];
}

function extractSourceUrls(sourcesMd) {
  const urls = [];
  const re = /^\s*-?\s*(?:\*\*)?URL(?:\*\*)?\s*:\s*<?([^>\s]+)>?\s*$/gim;
  for (const m of sourcesMd.matchAll(re)) {
    const raw = m[1].trim().replace(/[.,;]+$/g, "");
    if (/^https?:\/\//i.test(raw)) urls.push(raw);
  }
  return [...new Set(urls)];
}

function comparableUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    if (/^www\.speedcube\.(?:us|com\.au)$/i.test(u.hostname)) {
      u.hostname = "www.speedcube.storefront";
    }
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    for (const key of [...u.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(fbclid|gclid|dclid|mc_cid|mc_eid|igshid|shpxid|hl)$/i.test(key)) {
        u.searchParams.delete(key);
      }
    }
    u.searchParams.sort();
    return u.toString();
  } catch {
    return url.replace(/\/+$/, "");
  }
}

// Each attempt gets its OWN abort signal. Sharing one across HEAD and the GET
// fallback meant that once the HEAD exhausted the timeout the signal was already
// aborted, so the fallback died instantly and a reachable URL was reported dead.
function freshSignal(timeoutMs) {
  return typeof AbortSignal !== "undefined" && AbortSignal.timeout
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
}

async function requestUrl(url, fetchImpl, timeoutMs) {
  let res;
  try {
    res = await fetchImpl(url, { method: "HEAD", redirect: "follow", signal: freshSignal(timeoutMs) });
  } catch {
    res = await fetchImpl(url, { method: "GET", redirect: "follow", signal: freshSignal(timeoutMs) });
  }
  if ([400, 403, 404, 405].includes(res.status)) {
    try {
      res = await fetchImpl(url, { method: "GET", redirect: "follow", signal: freshSignal(timeoutMs) });
    } catch {
      // Keep HEAD result as diagnosable failure.
    }
  }
  return res;
}

const SOFT_ACCESS_STATUSES = new Set([401, 402, 403, 429]);

function isTimeoutError(err) {
  return err?.name === "AbortError" ||
    err?.name === "TimeoutError" ||
    /timeout|aborted/i.test(err?.message || "");
}

export async function checkSourceUrls(courseDir, options = {}) {
  const sourcesPath = join(courseDir, "sources.md");
  if (!existsSync(sourcesPath)) return [];
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") return ["sources.md URL 检查需要 fetch,当前 Node 运行时不支持"];
  const timeoutMs = options.timeoutMs || 8000;
  const strictAccessErrors = options.strictAccessErrors === true;
  const violations = [];
  for (const url of extractSourceUrls(readFileSync(sourcesPath, "utf8"))) {
    try {
      const res = await requestUrl(url, fetchImpl, timeoutMs);
      if (!res.ok) {
        if (!strictAccessErrors && SOFT_ACCESS_STATUSES.has(res.status)) continue;
        violations.push(`sources.md: URL ${res.status || "非 2xx"} ${url}`);
        continue;
      }
      const finalUrl = typeof res.url === "string" && res.url ? res.url : url;
      if (comparableUrl(finalUrl) !== comparableUrl(url)) {
        violations.push(`sources.md: URL 重定向 ${url} -> ${finalUrl}(请更新 sources.md 为最终地址)`);
      }
    } catch (err) {
      if (!strictAccessErrors && isTimeoutError(err)) continue;
      violations.push(`sources.md: URL 请求失败 ${url}(${err?.message || "unknown error"})`);
    }
  }
  return violations;
}

export function guardCourse(courseDir, maxLines) {
  const violations = [
    ...checkCoursePathTarget(courseDir),
    ...checkCodeFenceBalance(courseDir),
    ...checkCitations(courseDir),
    ...checkPrevNext(courseDir),
    ...checkMarkdownLinks(courseDir),
    ...checkInlineFootnoteDef(courseDir),
    ...checkTemplateSections(courseDir),
    ...checkReadmeCoverage(courseDir),
    ...checkLessonBounds(courseDir, maxLines),
    ...checkFrontmatter(courseDir),
    ...checkGlossary(courseDir),
    ...checkGlossaryLive(courseDir),
    ...checkCourseManifest(courseDir),
    ...checkSourcesAuthority(courseDir),
    ...checkMermaidDiagrams(courseDir),
    ...checkMentorActions(courseDir),
    ...checkInteractiveBlocks(courseDir),
    ...checkRiskyClaims(courseDir),
    ...checkBeginnerBridge(courseDir),
    ...checkExtensions(courseDir),
    ...checkCourseLogo(courseDir),
  ];
  return { ok: violations.length === 0, violations };
}

export async function guardCourseAsync(courseDir, options = {}) {
  const maxLines = lineCap(options.maxLines);
  const base = guardCourse(courseDir, maxLines);
  const urlViolations = options.checkUrls === false ? [] : await checkSourceUrls(courseDir, options);
  const violations = [...base.violations, ...urlViolations];
  return { ok: violations.length === 0, violations };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  if (!arg) { console.error("Missing course directory. --help"); process.exit(2); }
  const dir = isAbsolute(arg) ? arg : join(ROOT, arg);
  const mi = process.argv.indexOf("--max-lines");
  const maxLines = mi > -1 ? parseInt(process.argv[mi + 1], 10) : undefined;
  const v = await guardCourseAsync(dir, {
    maxLines,
    checkUrls: !process.argv.includes("--skip-url-check"),
    strictAccessErrors: process.argv.includes("--strict-url-check"),
  });

  const warnings = [
    ...checkCjkPunctuation(dir),
    ...checkProseDollarMath(dir),
    ...checkGlossaryBodyPresence(dir),
    ...checkGlossaryDensity(dir),
  ];
  const familyLogo = basename(dirname(dir)).startsWith("learn-") && existsSync(join(dirname(dir), "logo.svg"));
  if (!existsSync(join(dir, "logo.svg")) && !familyLogo) {
    warnings.push("logo.svg missing — courses minted after 2026-07 should carry an emblem (authoring guide Stage 7)");
  }

  if (v.ok) {
    console.log("GUARD ok ✓");
    if (warnings.length > 0) {
      console.log("\n⚠ warnings (non-blocking):\n" + warnings.map((x) => "  - " + x).join("\n"));
    }
    process.exit(0);
  }
  console.log("GUARD FAIL ✗\n" + v.violations.map((x) => "  - " + x).join("\n"));

  // Non-blocking warnings (don't affect pass/exit) — after FAIL so they don't bury critical errors
  if (warnings.length > 0) {
    console.log("\n⚠ warnings (non-blocking):\n" + warnings.map((x) => "  - " + x).join("\n"));
  }

  process.exit(1);
}
