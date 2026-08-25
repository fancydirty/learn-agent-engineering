#!/usr/bin/env node
// Course family consistency guard (2026-08-21 localization design): checks the
// invariants that hold ACROSS locale variants of one course family. Single-variant
// quality stays with course-guard.mjs; this guard never re-runs those checks.
//
//   node scripts/course-family-guard.mjs <family-dir>
//
// Family layout: learn-<slug>/{logo.svg, <locale>/{README.md, NN-*.md,
// glossary.json, sources.md, agentmentor.json}}.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, isAbsolute, join } from "node:path";
import { checkCourseLogo } from "./course-guard.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Keep in sync with lib/locales.ts LOCALES (this script stays dependency-free .mjs).
const LAUNCH_LOCALES = ["en", "zh", "ja", "ko", "es", "pt-BR"];

function lessonFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d+-.*\.md$/.test(f) && !f.endsWith(".live.md"))
    .sort();
}

// Minimal frontmatter scan: leading --- block, `lang:` scalar (quotes stripped).
function readmeLang(readmePath) {
  if (!existsSync(readmePath)) return null;
  const lines = readFileSync(readmePath, "utf8").split(/\r?\n/);
  if (lines[0] !== "---") return null;
  for (let i = 1; i < lines.length && lines[i] !== "---"; i++) {
    const m = lines[i].match(/^lang:\s*(.*)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "").trim();
  }
  return null;
}

function fenceBlocks(text) {
  const blocks = [];
  const re = /```([^\n]*)\n([\s\S]*?)\n```/g;
  for (const m of text.matchAll(re)) {
    blocks.push({ info: (m[1] || "").trim().split(/\s+/)[0], source: m[2] });
  }
  return blocks;
}

// A fenced block is a Skill artifact when it carries the SKILL.md frontmatter
// pattern (name: + description: lines). Those blocks are the real deliverable —
// they stay English and byte-identical in every locale; teaching comments in
// other code blocks may differ.
function isSkillArtifactBlock(source) {
  return /^name:\s*\S/m.test(source) && /^description:\s*\S/m.test(source);
}

function interactionBlockIds(text) {
  return fenceBlocks(text)
    .filter((b) => /^agentmentor-(check|order|code|fix|predict|trace|diff|hotspot|live|visual)$/.test(b.info))
    .map((b) => {
      try {
        const data = JSON.parse(b.source);
        return typeof data.id === "string" ? data.id : "(missing id)";
      } catch {
        return "(unparseable)";
      }
    });
}

// Script profile per locale. A parallel-translation run once shipped a Spanish
// glossary whose first 18 entries carried Korean prose: term keys were Spanish,
// every field was non-empty, and course-guard passed clean, because no gate ever
// checked what LANGUAGE the text was in. Cheap structural test: Latin-script
// locales must contain no CJK at all, and a CJK locale must not carry another
// CJK locale's script (kana in zh, Hangul in ja, ...).
const SCRIPT_RE = { han: /[\u4e00-\u9fff]/, kana: /[\u3040-\u30ff]/, hangul: /[\uac00-\ud7af]/ };
const ALLOWED_SCRIPTS = {
  en: [], es: [], "pt-BR": [],
  zh: ["han"], ja: ["han", "kana"], ko: ["hangul", "han"],
};

function glossaryScriptViolations(dir, locale) {
  const p = join(dir, "glossary.json");
  if (!existsSync(p)) return [];
  let entries;
  try { entries = JSON.parse(readFileSync(p, "utf8")); } catch { return []; }
  if (!Array.isArray(entries)) return [];
  const allowed = ALLOWED_SCRIPTS[locale] ?? [];
  const seen = new Set();
  for (const [i, e] of entries.entries()) {
    for (const field of ["term", "def", "pitfall", "distractor_rationale", "deeper"]) {
      const raw = e?.[field];
      const text = Array.isArray(raw) ? raw.join(" ") : (typeof raw === "string" ? raw : "");
      if (!text) continue;
      for (const [name, re] of Object.entries(SCRIPT_RE)) {
        if (!allowed.includes(name) && re.test(text)) seen.add(`glossary[${i}].${field}: ${name}`);
      }
    }
  }
  return [...seen].slice(0, 5).map((hit) => `${locale}: 词表混入非本语言文字 — ${hit}(翻译串档，guard 只查非空查不出语言)`);
}

export function guardCourseFamily(familyDir) {
  const violations = [];
  const warnings = [];
  const slug = basename(familyDir);

  if (!slug.startsWith("learn-")) {
    violations.push(`family 目录名 ${slug} 须以 learn- 开头(公开 slug 由目录名去掉前缀得到)`);
  }

  const localeDirs = readdirSync(familyDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (localeDirs.length === 0) {
    violations.push("family 下没有任何 locale 变体目录");
    return { ok: false, violations, warnings };
  }

  for (const dir of localeDirs) {
    if (!LAUNCH_LOCALES.includes(dir)) {
      violations.push(`未知 locale 目录 ${dir}/(不在 lib/locales.ts 注册表;新增语言须先注册)`);
    }
  }

  const missingLaunch = LAUNCH_LOCALES.filter((locale) => !localeDirs.includes(locale));
  if (missingLaunch.length > 0) {
    warnings.push(`首发六语尚缺: ${missingLaunch.join(", ")}(全部完成才作为六语课程发布)`);
  }

  const locales = localeDirs.filter((dir) => LAUNCH_LOCALES.includes(dir));

  // Per-variant required deliverables + README lang matching its directory.
  const REQUIRED_FILES = ["README.md", "glossary.json", "sources.md", "agentmentor.json"];
  for (const locale of locales) {
    const dir = join(familyDir, locale);
    for (const file of REQUIRED_FILES) {
      if (!existsSync(join(dir, file))) violations.push(`${locale}: 缺 ${file}(每个 locale 变体都须是完整课程)`);
    }
    if (lessonFiles(dir).length === 0) violations.push(`${locale}: 没有任何课节文件(NN-*.md)`);
    violations.push(...glossaryScriptViolations(dir, locale));
    const lang = readmeLang(join(dir, "README.md"));
    if (lang !== locale) {
      violations.push(`${locale}: README frontmatter lang=${lang ?? "缺失"} 与目录 locale 不一致`);
    }
  }

  // Identical lesson file sets across variants (same slugs → same-page links work).
  const lessonSets = new Map();
  for (const locale of locales) {
    lessonSets.set(locale, lessonFiles(join(familyDir, locale)).join("\n"));
  }
  const [referenceLocale, referenceSet] = [...lessonSets.entries()][0] ?? [];
  for (const [locale, set] of lessonSets) {
    if (set !== referenceSet) {
      violations.push(`${locale}: 课节文件集合与 ${referenceLocale} 不一致(同 family 各语言课节 slug 必须相同)`);
    }
  }

  // Per-lesson cross-locale invariants.
  const referenceLessons = referenceLocale ? lessonFiles(join(familyDir, referenceLocale)) : [];
  for (const file of referenceLessons) {
    const perLocale = new Map();
    for (const locale of locales) {
      const path = join(familyDir, locale, file);
      if (existsSync(path)) perLocale.set(locale, readFileSync(path, "utf8"));
    }

    // Interaction block ids: same blocks, same order, ids never translated.
    const idLists = new Map([...perLocale].map(([locale, text]) => [locale, interactionBlockIds(text)]));
    const referenceIds = idLists.get(referenceLocale) ?? [];
    for (const [locale, ids] of idLists) {
      if (ids.join("\n") !== referenceIds.join("\n")) {
        violations.push(`${locale}/${file}: 互动块 id 序列与 ${referenceLocale} 不一致(id 跨语言保持不变)`);
      }
    }

    // Skill artifact fences: byte-identical across variants (never translated).
    const artifactPerLocale = new Map(
      [...perLocale].map(([locale, text]) => [
        locale,
        fenceBlocks(text).filter((b) => isSkillArtifactBlock(b.source)).map((b) => b.source),
      ]),
    );
    const referenceArtifacts = artifactPerLocale.get(referenceLocale) ?? [];
    for (const [locale, artifacts] of artifactPerLocale) {
      if (artifacts.length !== referenceArtifacts.length) {
        violations.push(`${locale}/${file}: Skill 实物块数量 ${artifacts.length} 与 ${referenceLocale} 的 ${referenceArtifacts.length} 不一致`);
        continue;
      }
      for (let i = 0; i < referenceArtifacts.length; i++) {
        if (artifacts[i] !== referenceArtifacts[i]) {
          violations.push(`${locale}/${file}: 第 ${i + 1} 个 Skill 实物块(name:/description: frontmatter)与 ${referenceLocale} 不一致(Skill 实物保持英文,不得翻译)`);
        }
      }
    }

    // Cross-locale markdown links are always wrong; same-variant ./NN-*.md
    // resolution is covered per variant by course-guard checkPrevNext.
    for (const [locale, text] of perLocale) {
      const cross = text.match(/\]\(\.\.\/(en|zh|ja|ko|es|pt-BR)\//) || text.match(/\]\(\/(en|zh|ja|ko|es|pt-BR)\//);
      if (cross) violations.push(`${locale}/${file}: 含跨 locale 链接 ${cross[0].slice(0, 40)}…(课内链接只指向本变体文件)`);
    }
  }

  // The shared emblem lives at the family root.
  if (!existsSync(join(familyDir, "logo.svg"))) {
    warnings.push("logo.svg missing — family root should carry the shared emblem");
  } else {
    violations.push(...checkCourseLogo(familyDir));
  }

  return { ok: violations.length === 0, violations, warnings };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  if (!arg) { console.error("Usage: node scripts/course-family-guard.mjs <family-dir>"); process.exit(2); }
  const dir = isAbsolute(arg) ? arg : join(ROOT, arg);
  const { ok, violations, warnings } = guardCourseFamily(dir);
  if (ok) {
    console.log("FAMILY GUARD ok ✓");
    if (warnings.length > 0) console.log("\n⚠ warnings (non-blocking):\n" + warnings.map((x) => "  - " + x).join("\n"));
    process.exit(0);
  }
  console.log("FAMILY GUARD FAIL ✗\n" + violations.map((x) => "  - " + x).join("\n"));
  if (warnings.length > 0) console.log("\n⚠ warnings (non-blocking):\n" + warnings.map((x) => "  - " + x).join("\n"));
  process.exit(1);
}
