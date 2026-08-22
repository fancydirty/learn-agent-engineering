import type { Lang } from "./i18n";
import { siteCopyFor } from "./locales";

// Lesson-page eyebrow: course title + lesson counter (index0 is 0-based, display is 1-based).
// Counter copy comes from the locale site deck; default zh preserves legacy callers/tests.
export function lessonKicker(courseTitle: string, index0: number, total: number, lang: Lang = "zh"): string {
  return `${courseTitle.trim()} · ${siteCopyFor(lang).reader.kicker(index0 + 1, total)}`;
}
