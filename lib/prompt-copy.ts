// course-reader/lib/prompt-copy.ts
// Shared scaffolding for every "copy to agent" prompt, double-keyed by Lang like
// site-copy.ts. en users get English, zh stays byte-for-byte unchanged. Machine
// fields (mode names, ids, JSON keys, file names) stay English on both sides.
import type { Lang } from "./i18n";
import { bilingualLang, type BilingualLang } from "./locales";
import type { MentorActionContext } from "./mentor-actions";

export type PromptContextKind = "interactive" | "code";

const SCAFFOLD = {
  zh: {
    enterMode: (mode: string) => `请进入 Agent Mentor 的 \`${mode}\` 模式。`,
    courseTitle: "课程标题",
    courseUrl: "公开课链接",
    currentLesson: "当前课节",
    currentLessonTitle: "当前课节标题",
    contextFallback: {
      interactive: "课程上下文:\n我从当前 Agent Mentor 阅读站复制了这道互动练习。",
      code: "课程上下文:\n我从当前 Agent Mentor 阅读站复制了这道代码练习。",
    },
    exerciseTitle: "练习标题",
    exercisePrompt: "练习题目",
    whyHere: "为什么这里要练",
    userGoal: "用户目的",
    localResult: "本地检查结果",
    pass: "通过",
    fail: "未通过",
  },
  en: {
    enterMode: (mode: string) => `Enter Agent Mentor's \`${mode}\` mode.`,
    courseTitle: "Course title",
    courseUrl: "Public lesson URL",
    currentLesson: "Current lesson",
    currentLessonTitle: "Current lesson title",
    contextFallback: {
      interactive: "Course context:\nI copied this interactive exercise from the current Agent Mentor reader.",
      code: "Course context:\nI copied this code exercise from the current Agent Mentor reader.",
    },
    exerciseTitle: "Exercise title",
    exercisePrompt: "Exercise prompt",
    whyHere: "Why practice this here",
    userGoal: "My goal",
    localResult: "Local check result",
    pass: "Passed",
    fail: "Not passed",
  },
} as const satisfies Record<BilingualLang, unknown>;

export function promptScaffold(lang: Lang) {
  return SCAFFOLD[bilingualLang(lang)];
}

/** `${label}:\n${value}` — the one field shape every prompt block reuses. */
export function field(label: string, value: string): string {
  return `${label}:\n${value}`;
}

const READ_FILES = {
  zh: {
    inCourse: (focus: string) =>
      `先参考上面的公开课链接和内联题面；如果无法访问链接，就只依据已复制的上下文${focus}。`,
    standalone: (focus: string) => `题面、我的作答和本地反馈都在上面,直接${focus}。`,
  },
  en: {
    inCourse: (focus: string) =>
      `Use the public lesson URL and inline exercise above; if the URL is unavailable, rely on the copied context and ${focus}.`,
    standalone: (focus: string) => `The exercise, my answer, and the local feedback are all above; ${focus}.`,
  },
} as const satisfies Record<BilingualLang, unknown>;

/**
 * `focus` is the tail clause (e.g. "probe my selection" / "围绕我的选择追问").
 * With a context it becomes the in-course "read these files, then ${focus}" line;
 * without one it becomes a self-contained "everything is above; ${focus}" line.
 */
export function readFilesLine(
  context: MentorActionContext | undefined,
  lang: Lang,
  focus: string,
): string {
  return context?.courseUrl.trim() ? READ_FILES[bilingualLang(lang)].inCourse(focus) : READ_FILES[bilingualLang(lang)].standalone(focus);
}

/** The course-context header lines shared by all copy prompts (with "" gaps between fields). */
export function promptContextLines(
  context: MentorActionContext | undefined,
  lang: Lang,
  kind: PromptContextKind = "interactive",
): string[] {
  const s = SCAFFOLD[bilingualLang(lang)];
  if (!context) return [s.contextFallback[kind]];
  const fields: [string, string][] = [
    [s.courseTitle, context.courseTitle],
    [s.courseUrl, context.courseUrl],
    [s.currentLesson, context.lessonFile],
    [s.currentLessonTitle, context.lessonTitle],
  ];
  return fields
    .filter(([, value]) => value.trim().length > 0)
    .flatMap(([label, value], i) => (i === 0 ? [field(label, value)] : ["", field(label, value)]));
}
