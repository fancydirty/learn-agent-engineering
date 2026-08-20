import type { Lang } from "./i18n";

// Lesson-page eyebrow: course title + lesson counter (index0 is 0-based, display is 1-based).
// Counter follows UI lang: zh "第 N / M 节", en "Lesson N of M"; default zh preserves legacy callers/tests.
export function lessonKicker(courseTitle: string, index0: number, total: number, lang: Lang = "zh"): string {
  const counter = lang === "en" ? `Lesson ${index0 + 1} of ${total}` : `第 ${index0 + 1} / ${total} 节`;
  return `${courseTitle.trim()} · ${counter}`;
}
