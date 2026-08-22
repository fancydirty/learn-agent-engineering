import type { MentorActionContext } from "./mentor-actions";
import type { Lang } from "./i18n";
import { bilingualLang, type BilingualLang } from "./locales";
import { promptScaffold, promptContextLines, field, readFilesLine } from "./prompt-copy";

export type CodeExerciseLanguage =
  | "css"
  | "javascript"
  | "typescript"
  | "jsx"
  | "tsx"
  | "html"
  | "python"
  | "text";

export type CodeExerciseCheckType = "includes" | "notIncludes" | "regex";
export type CodeExerciseKind = "code" | "fix";

export interface CodeExerciseCheck {
  id: string;
  type: CodeExerciseCheckType | "";
  value: string;
  pattern: string;
  message: string;
}

export interface CodeExerciseBlock {
  type: CodeExerciseKind;
  id: string;
  label: string;
  prompt: string;
  whyHere: string;
  bug: string;
  language: CodeExerciseLanguage | "";
  starter: string;
  checks: CodeExerciseCheck[];
  copyPurpose: string;
}

export interface CodeExerciseCheckResult {
  id: string;
  type: CodeExerciseCheckType | "";
  message: string;
  passed: boolean;
}

export type CodeExerciseSlotPart =
  | { type: "text"; text: string }
  | { type: "slot"; index: number; placeholder: string };

export type CodeExerciseParseResult =
  | { ok: true; block: CodeExerciseBlock }
  | { ok: false; error: string };

const LANGUAGES = new Set<CodeExerciseLanguage>([
  "css",
  "javascript",
  "typescript",
  "jsx",
  "tsx",
  "html",
  "python",
  "text",
]);

const CHECK_TYPES = new Set<CodeExerciseCheckType>(["includes", "notIncludes", "regex"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function trimmed(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function rawString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function parseLanguage(value: unknown): CodeExerciseLanguage | "" {
  const language = trimmed(value).toLowerCase();
  return LANGUAGES.has(language as CodeExerciseLanguage) ? language as CodeExerciseLanguage : "";
}

function parseCheckType(value: unknown): CodeExerciseCheckType | "" {
  const type = trimmed(value);
  return CHECK_TYPES.has(type as CodeExerciseCheckType) ? type as CodeExerciseCheckType : "";
}

function parseChecks(value: unknown): CodeExerciseCheck[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const item = isObject(raw) ? raw : {};
    return {
      id: trimmed(item.id),
      type: parseCheckType(item.type),
      value: rawString(item.value),
      pattern: rawString(item.pattern),
      message: trimmed(item.message),
    };
  });
}

export function splitCodeExerciseSlots(starter: string): CodeExerciseSlotPart[] {
  const parts: CodeExerciseSlotPart[] = [];
  let index = 0;
  let cursor = 0;
  for (const match of starter.matchAll(/_{3,}/g)) {
    const start = match.index ?? 0;
    const placeholder = match[0];
    if (start > cursor) parts.push({ type: "text", text: starter.slice(cursor, start) });
    parts.push({ type: "slot", index, placeholder });
    index += 1;
    cursor = start + placeholder.length;
  }
  if (cursor < starter.length) parts.push({ type: "text", text: starter.slice(cursor) });
  return parts.length ? parts : [{ type: "text", text: starter }];
}

export function buildCodeFromSlots(starter: string, values: string[]): string {
  return splitCodeExerciseSlots(starter).map((part) => {
    if (part.type === "text") return part.text;
    const value = values[part.index]?.trim();
    return value || part.placeholder;
  }).join("");
}

export function parseCodeExerciseBlock(
  code: string,
  kind: CodeExerciseKind = "code",
): CodeExerciseParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(code);
  } catch (error) {
    return { ok: false, error: `code exercise JSON parse failed: ${error instanceof Error ? error.message : String(error)}` };
  }

  if (!isObject(raw)) return { ok: false, error: "code exercise block must be a JSON object" };

  return {
    ok: true,
    block: {
      type: kind,
      id: trimmed(raw.id),
      label: trimmed(raw.label),
      prompt: trimmed(raw.prompt),
      whyHere: trimmed(raw.whyHere),
      bug: trimmed(raw.bug),
      language: parseLanguage(raw.language),
      starter: rawString(raw.starter),
      checks: parseChecks(raw.checks),
      copyPurpose: trimmed(raw.copyPurpose),
    },
  };
}

export function validateCodeExerciseBlock(block: CodeExerciseBlock): string[] {
  const errors: string[] = [];
  const label = block.type === "fix" ? "agentmentor-fix" : "agentmentor-code";

  for (const key of ["id", "label", "prompt", "whyHere", "copyPurpose"] as const) {
    if (!block[key]) errors.push(`${label} missing/empty ${key}`);
  }

  if (block.type === "fix" && !block.bug) errors.push(`${label} missing/empty bug`);

  if (!block.language) errors.push(`${label} language unsupported or empty`);
  if (!block.starter.trim()) errors.push(`${label} missing/empty starter`);
  if (block.checks.length < 1 || block.checks.length > 6) errors.push(`${label} checks must be 1-6 items`);

  const ids = new Set<string>();
  for (const [index, check] of block.checks.entries()) {
    if (!check.id) errors.push(`${label} checks[${index}] missing/empty id`);
    else if (ids.has(check.id)) errors.push(`${label} duplicate check id: ${check.id}`);
    else ids.add(check.id);

    if (!check.type) errors.push(`${label} checks[${index}] type must be includes/notIncludes/regex`);
    if (!check.message) errors.push(`${label} checks[${index}] missing/empty message`);

    if ((check.type === "includes" || check.type === "notIncludes") && !check.value.trim()) {
      errors.push(`${label} checks[${index}] ${check.type} missing/empty value`);
    }

    if (check.type === "regex") {
      if (!check.pattern.trim()) {
        errors.push(`${label} checks[${index}] regex missing/empty pattern`);
      } else {
        try {
          new RegExp(check.pattern);
        } catch (error) {
          errors.push(`${label} checks[${index}] regex pattern not compilable: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }

  return errors;
}

export function runCodeExerciseChecks(block: CodeExerciseBlock, code: string): CodeExerciseCheckResult[] {
  return block.checks.map((check) => {
    let passed = false;
    if (check.type === "includes") {
      passed = code.includes(check.value);
    } else if (check.type === "notIncludes") {
      passed = !code.includes(check.value);
    } else if (check.type === "regex") {
      try {
        passed = new RegExp(check.pattern).test(code);
      } catch {
        passed = false;
      }
    }
    return { id: check.id, type: check.type, message: check.message, passed };
  });
}

// Builder-specific copy. Shared scaffolding lives in prompt-copy.ts; only the phrasing
// unique to code/fix exercises lives here, double-keyed like site-copy.ts.
const COPY: Record<BilingualLang, {
  brokenBehavior: string;
  language: string;
  myCurrentCode: string;
  noLocalCheck: string;
  // `codeFocus` feeds the context-gated readFilesLine; `codePedagogy` is appended verbatim.
  codeFocus: string;
  codePedagogy: string;
}> = {
  zh: {
    brokenBehavior: "坏掉的现象",
    language: "语言",
    myCurrentCode: "我的当前代码:",
    noLocalCheck: "- 我还没有运行本地检查。",
    codeFocus: "围绕我的当前代码追问",
    codePedagogy: "不要直接贴完整标准答案;先指出最小可验证的下一步。如果我的思路只是碰巧过了检查,请追问我为什么这样写。",
  },
  en: {
    brokenBehavior: "Broken behavior",
    language: "Language",
    myCurrentCode: "My current code:",
    noLocalCheck: "- I haven't run the local check yet.",
    codeFocus: "probe my current code",
    codePedagogy: "Do not paste the full model answer outright; first point out the smallest verifiable next step. If my approach only passed the check by luck, ask why I wrote it this way.",
  },
};

export function buildCodeExercisePrompt(
  block: CodeExerciseBlock,
  code: string,
  results: CodeExerciseCheckResult[],
  lang: Lang,
  context?: MentorActionContext,
) {
  const s = promptScaffold(lang);
  const t = COPY[bilingualLang(lang)];
  const status = results.length
    ? results.map((result) => `- ${result.passed ? s.pass : s.fail}: ${result.message}`).join("\n")
    : t.noLocalCheck;

  const mode = block.type === "fix" ? "fix_the_bug_coach" : "code_exercise_coach";
  const bugLines = block.type === "fix"
    ? [
      field(t.brokenBehavior, block.bug),
      "",
    ]
    : [];

  return [
    s.enterMode(mode),
    "",
    ...promptContextLines(context, lang, "code"),
    "",
    field(s.exerciseTitle, block.label),
    "",
    field(s.exercisePrompt, block.prompt),
    "",
    field(s.whyHere, block.whyHere),
    "",
    ...bugLines,
    field(s.userGoal, block.copyPurpose),
    "",
    field(t.language, block.language || "text"),
    "",
    t.myCurrentCode,
    `\`\`\`${block.language || "text"}`,
    code,
    "```",
    "",
    `${s.localResult}:`,
    status,
    "",
    readFilesLine(context, lang, t.codeFocus),
    t.codePedagogy,
  ].join("\n");
}
