#!/usr/bin/env node
// Non-blocking interaction usage report: helps review whether a course uses
// local interactive blocks with restraint before promoting it as an example.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const DETERMINISTIC_LANGUAGES = [
  "agentmentor-check",
  "agentmentor-order",
  "agentmentor-predict",
  "agentmentor-trace",
  "agentmentor-code",
  "agentmentor-fix",
  "agentmentor-diff",
  "agentmentor-hotspot",
  "agentmentor-live",
];

const ALL_LANGUAGES = [...DETERMINISTIC_LANGUAGES, "agentmentor-action"];

const TYPE_ALIASES = {
  "agentmentor-check": ["agentmentor-check", "check", "判断", "选择", "辨认"],
  "agentmentor-order": ["agentmentor-order", "order", "排序", "顺序"],
  "agentmentor-predict": ["agentmentor-predict", "predict", "预测", "猜输出"],
  "agentmentor-trace": ["agentmentor-trace", "trace", "走读", "追踪", "变量表"],
  "agentmentor-code": ["agentmentor-code", "code", "代码", "补全"],
  "agentmentor-fix": ["agentmentor-fix", "fix", "修错", "修 bug", "修复"],
  "agentmentor-diff": ["agentmentor-diff", "diff", "patch", "补丁", "改动"],
  "agentmentor-hotspot": ["agentmentor-hotspot", "hotspot", "图", "节点", "热点", "点击图"],
};

const GENERIC_LABELS = new Set([
  "考考我",
  "考考你",
  "检验一下",
  "做个小测",
  "小测验",
  "小测",
  "练一下",
  "练一练",
  "测一测",
  "判断一下",
  "排一下",
  "猜输出",
  "走变量",
  "补代码",
  "修代码",
  "读改动",
  "点节点",
  "点一下",
  "复制给 agent",
  "帮我查漏洞",
  "进入实战模拟",
]);

function lessonFiles(courseDir) {
  if (!existsSync(courseDir)) return [];
  return readdirSync(courseDir)
    .filter((file) => /^\d+-.*\.md$/.test(file))
    .sort();
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function compactText(value) {
  return String(value || "")
    .replace(/[`"'“”‘’]/g, "")
    .replace(/[。.!！?？,，;；:：、\s]/g, "")
    .trim();
}

function isGenericLabel(value) {
  const raw = String(value || "").trim();
  const compact = compactText(raw);
  if (!compact) return false;
  return GENERIC_LABELS.has(raw) ||
    GENERIC_LABELS.has(compact) ||
    (compact.length <= 8 && /^(?:请)?(?:考考|检验|小测|练习?|判断|排一下|猜一下|填一下|看懂|复制)/.test(compact));
}

function parseJsonBlock(source) {
  try {
    const data = JSON.parse(source);
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return data;
  } catch {
    return {};
  }
}

function parseActionFields(source) {
  const fields = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (match) fields[match[1]] = match[2].trim();
  }
  return fields;
}

function extractBlocks(text) {
  const languages = ALL_LANGUAGES.join("|");
  const fenceRe = new RegExp("```(" + languages + ")[^\\n]*\\n([\\s\\S]*?)\\n```", "g");
  const blocks = [];
  for (const match of text.matchAll(fenceRe)) {
    const language = match[1];
    const source = match[2].trim();
    const data = language === "agentmentor-action" ? parseActionFields(source) : parseJsonBlock(source);
    blocks.push({
      language,
      line: lineNumberAt(text, match.index),
      source,
      id: typeof data.id === "string" ? data.id.trim() : "",
      label: typeof data.label === "string" ? data.label.trim() : "",
      copyPurpose: typeof data.copyPurpose === "string" ? data.copyPurpose.trim() : "",
    });
  }
  return blocks;
}

function readManifest(courseDir) {
  const manifestPath = join(courseDir, "agentmentor.json");
  if (!existsSync(manifestPath)) return {};
  try {
    const data = JSON.parse(readFileSync(manifestPath, "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function typeMentioned(type, text) {
  const lower = String(text || "").toLowerCase();
  return (TYPE_ALIASES[type] || [type]).some((alias) => lower.includes(alias.toLowerCase()));
}

function pushByType(byType, language) {
  byType[language] = (byType[language] || 0) + 1;
}

export function collectCourseInteractionReport(courseDir) {
  const manifest = readManifest(courseDir);
  const interactionCheck = manifest?.acceptanceReview?.interactionCheck || "";
  const lessons = [];
  const byType = {};
  const warnings = [];
  const labels = new Map();

  for (const file of lessonFiles(courseDir)) {
    const text = readFileSync(join(courseDir, file), "utf8");
    const blocks = extractBlocks(text).map((block) => ({ ...block, file }));
    const deterministic = blocks.filter((block) => DETERMINISTIC_LANGUAGES.includes(block.language));
    const actions = blocks.filter((block) => block.language === "agentmentor-action");

    if (deterministic.length > 2) {
      warnings.push(`${file}: deterministic 互动块过多(${deterministic.length}>2),请确认不是用控件替代讲解/练习。`);
    }

    for (const block of blocks) {
      pushByType(byType, block.language);
      if (block.label) {
        const key = compactText(block.label);
        if (!labels.has(key)) labels.set(key, []);
        labels.get(key).push(`${file}:${block.line} ${block.language}`);
      }
      if (block.label && isGenericLabel(block.label)) {
        warnings.push(`${file}:${block.line}: ${block.language} label 像固定模板("${block.label}"),请改成本节专属学习动作。`);
      }
    }

    lessons.push({
      file,
      blocks,
      deterministicBlocks: deterministic.length,
      actionBlocks: actions.length,
    });
  }

  const actionLessons = lessons.filter((lesson) => lesson.actionBlocks > 0).length;
  if (actionLessons >= 2 && actionLessons > lessons.length / 2) {
    warnings.push(`agentmentor-action 使用较密(${actionLessons}/${lessons.length} 节),请确认这些是课后活导师入口,不是按钮墙。`);
  }

  for (const [label, locations] of labels.entries()) {
    if (label && locations.length > 1) {
      warnings.push(`互动 label 重复 "${label}": ${locations.join(" ; ")}。不同课节应写成具体情境,避免模板感。`);
    }
  }

  const deterministicTypes = Object.keys(byType).filter((type) => DETERMINISTIC_LANGUAGES.includes(type));
  if (deterministicTypes.length && !String(interactionCheck).trim()) {
    warnings.push("agentmentor.json acceptanceReview.interactionCheck 为空,但课程使用了本地互动块。");
  }
  for (const type of deterministicTypes) {
    if (String(interactionCheck).trim() && !typeMentioned(type, interactionCheck)) {
      warnings.push(`agentmentor.json acceptanceReview.interactionCheck 没有提到 ${type},请解释它服务哪个具体误区。`);
    }
  }

  const totalBlocks = Object.values(byType).reduce((sum, count) => sum + count, 0);
  return {
    courseDir,
    lessons,
    totals: {
      lessons: lessons.length,
      blocks: totalBlocks,
      byType,
    },
    warnings,
  };
}

export function formatInteractionReport(report) {
  const lines = [
    `Interaction report: ${report.courseDir}`,
    `lessons: ${report.totals.lessons}`,
    `total blocks: ${report.totals.blocks}`,
  ];

  const types = Object.keys(report.totals.byType).sort();
  if (types.length) {
    lines.push("by type:");
    for (const type of types) lines.push(`  - ${type}: ${report.totals.byType[type]}`);
  } else {
    lines.push("by type: none");
  }

  lines.push("by lesson:");
  for (const lesson of report.lessons) {
    const summary = lesson.blocks.length
      ? lesson.blocks.map((block) => `${block.language}@${block.line}`).join(", ")
      : "none";
    lines.push(`  - ${lesson.file}: ${summary}`);
  }

  lines.push("warnings:");
  if (report.warnings.length) {
    for (const warning of report.warnings) lines.push(`  - ${warning}`);
  } else {
    lines.push("  - none");
  }
  return lines.join("\n");
}

// --json hardening (2026-07-19 audit P3-3): report embeds lesson text (blocks[].source), may contain
// control chars. JSON.stringify escapes C0 but DEL/C1 and U+2028/U+2029 (JS line separators)
// pass through raw — breaks strict parsers / JS embed. Pin to \uXXXX here,
// self-check via JSON.parse: valid JSON or fail here, no downstream mines.
export function toJsonOutput(report) {
  const out = JSON.stringify(report, null, 2)
    .replace(/[\u007f-\u009f\u2028\u2029]/g, (ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"));
  JSON.parse(out);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  if (!arg || arg === "--help") {
    console.error("用法: node scripts/course-interaction-report.mjs <课目录> [--json]");
    process.exit(arg === "--help" ? 0 : 2);
  }
  const dir = isAbsolute(arg) ? arg : join(ROOT, arg);
  const report = collectCourseInteractionReport(dir);
  if (process.argv.includes("--json")) {
    console.log(toJsonOutput(report));
  } else {
    console.log(formatInteractionReport(report));
  }
}
