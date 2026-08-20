import type { Lang } from "./i18n";
import { promptScaffold, field } from "./prompt-copy";

export interface MentorActionContext {
  courseUrl: string;
  courseTitle: string;
  lessonFile: string;
  lessonTitle: string;
}

export interface MentorAction {
  mode: string;
  label: string;
  description: string;
  purpose: string;
  lesson: string;
  rules: string[];
  courseUrl: string;
  courseTitle: string;
  lessonTitle: string;
}

export interface ExerciseMentorActionInput extends MentorActionContext {
  exerciseIndex: number;
  level: string;
  prompt: string;
  checks: string[];
  lang: Lang;
}

export type MentorActionPart =
  | { type: "markdown"; markdown: string }
  | { type: "action"; action: MentorAction };

// Builder-specific copy, double-keyed like site-copy.ts. Shared field/mode scaffolding
// comes from prompt-copy.ts; the mentor-action-specific phrasing lives here.
const COPY: Record<Lang, {
  copyToAgent: string;
  defaultRules: string[];
  interactionRules: string;
  startTask: string;
  exerciseFallback: (n: number) => string;
  completionCriteria: string;
  exerciseLabel: (level: string) => string;
  exerciseDescription: string;
  exerciseWorkingOn: (level: string) => string;
  exerciseRules: string[];
}> = {
  zh: {
    copyToAgent: "复制给 agent",
    defaultRules: [
      "先读取课程目录和当前课节,再开始互动。",
      "一次只推进一个问题或一个任务。",
      "根据我的回答指出具体盲点,不要直接表演标准答案。",
    ],
    interactionRules: "互动规则:",
    startTask: "使用上面的公开课链接和题面上下文，直接开始互动。不要要求我重新解释课程背景。",
    exerciseFallback: (n) => `练习 ${n}`,
    completionCriteria: "完成标准:",
    exerciseLabel: (level) => `和 agent 做${level}`,
    exerciseDescription: "复制后 agent 会读取本课上下文,先让你作答,再按完成标准追问。",
    exerciseWorkingOn: (level) => `我正在做当前课节的${level}。`,
    exerciseRules: [
      "先读取课程目录和当前课节,再看这道练习。",
      "不要先给完整答案;先让我写出自己的解法或判断。",
      "如果我答得含糊,按完成标准逐项追问并指出具体盲点。",
    ],
  },
  en: {
    copyToAgent: "Copy to agent",
    defaultRules: [
      "Read the course directory and the current lesson before we start.",
      "Advance one question or one task at a time.",
      "Point out the specific blind spots in my answers; do not perform the model answer.",
    ],
    interactionRules: "Interaction rules:",
    startTask: "Use the public lesson URL and the exercise context above, then start directly. Do not ask me to restate the course background.",
    exerciseFallback: (n) => `Exercise ${n}`,
    completionCriteria: "Completion criteria:",
    exerciseLabel: (level) => `Work on ${level} with the agent`,
    exerciseDescription: "After copying, the agent reads this lesson's context, has you answer first, then probes against the completion criteria.",
    exerciseWorkingOn: (level) => `I am working on ${level} in the current lesson.`,
    exerciseRules: [
      "Read the course directory and the current lesson before looking at this exercise.",
      "Do not give the full answer first; make me write my own solution or judgment first.",
      "If my answer is vague, probe each completion criterion and point out the specific blind spots.",
    ],
  },
};

function compactLabel(s: string, fallback: string) {
  const text = s.replace(/\s+/g, " ").trim() || fallback;
  return text.length > 28 ? `${text.slice(0, 27)}...` : text;
}

function pushMarkdown(parts: MentorActionPart[], markdown: string) {
  if (markdown.trim()) parts.push({ type: "markdown", markdown });
}

export function parseMentorActionBlock(src: string, context: MentorActionContext, lang: Lang): MentorAction {
  const scalars = new Map<string, string>();
  const lists = new Map<string, string[]>();
  let currentList = "";

  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const listItem = line.match(/^\s*-\s+(.+)$/);
    if (listItem && currentList) {
      lists.set(currentList, [...(lists.get(currentList) || []), listItem[1].trim()]);
      continue;
    }

    const scalar = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!scalar) continue;
    const key = scalar[1];
    const value = scalar[2].trim();
    currentList = value ? "" : key;
    if (value) scalars.set(key, value);
    else if (!lists.has(key)) lists.set(key, []);
  }

  const lesson = scalars.get("lesson") || context.lessonFile;
  return {
    mode: scalars.get("mode") || "mentor_action",
    label: scalars.get("label") || COPY[lang].copyToAgent,
    description: scalars.get("description") || "",
    purpose: scalars.get("purpose") || "",
    lesson,
    rules: lists.get("rules")?.length ? lists.get("rules")! : COPY[lang].defaultRules,
    courseUrl: context.courseUrl,
    courseTitle: context.courseTitle,
    lessonTitle: context.lessonTitle,
  };
}

export function splitMentorActions(md: string, context: MentorActionContext, lang: Lang): MentorActionPart[] {
  const parts: MentorActionPart[] = [];
  const fenceRe = /```agentmentor-action[^\n]*\n([\s\S]*?)\n```/g;
  let last = 0;

  for (const match of md.matchAll(fenceRe)) {
    pushMarkdown(parts, md.slice(last, match.index));
    parts.push({ type: "action", action: parseMentorActionBlock(match[1], context, lang) });
    last = match.index + match[0].length;
  }

  pushMarkdown(parts, md.slice(last));
  return parts;
}

export function buildMentorActionPrompt(action: MentorAction, lang: Lang): string {
  const s = promptScaffold(lang);
  const t = COPY[lang];
  return [
    s.enterMode(action.mode),
    "",
    field(s.courseTitle, action.courseTitle),
    "",
    field(s.courseUrl, action.courseUrl),
    "",
    field(s.currentLesson, action.lesson),
    "",
    field(s.currentLessonTitle, action.lessonTitle),
    "",
    field(s.userGoal, action.purpose),
    "",
    t.interactionRules,
    ...action.rules.map((rule) => `- ${rule}`),
    "",
    t.startTask,
  ].join("\n");
}

export function buildExerciseMentorAction(input: ExerciseMentorActionInput): MentorAction {
  const t = COPY[input.lang];
  const level = input.level.trim() || t.exerciseFallback(input.exerciseIndex + 1);
  const checks = input.checks.length
    ? [t.completionCriteria, ...input.checks.map((check) => `- ${check}`)].join("\n")
    : "";
  return {
    mode: "exercise_coach",
    label: t.exerciseLabel(compactLabel(level, t.exerciseFallback(input.exerciseIndex + 1))),
    description: t.exerciseDescription,
    purpose: [
      t.exerciseWorkingOn(level),
      input.prompt.trim() ? field(promptScaffold(input.lang).exercisePrompt, input.prompt.trim()) : "",
      checks,
    ].filter(Boolean).join("\n\n"),
    lesson: input.lessonFile,
    rules: t.exerciseRules,
    courseUrl: input.courseUrl,
    courseTitle: input.courseTitle,
    lessonTitle: input.lessonTitle,
  };
}
