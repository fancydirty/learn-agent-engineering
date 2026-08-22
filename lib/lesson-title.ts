// Strip numbered prefixes from lesson titles (pure logic; safe for client import).
// Sidebar TOC, posters, and breadcrumbs already show numbers — keeping them in the title
// yields double numbering like "1. 第 1 课：备菜".
// Covers the launch locales' counter conventions: zh 第N节/讲/章/课, en Lesson N,
// ja 第N回/レッスンN, ko 제N강, es Lección N, pt-BR Lição N.
const LESSON_NUMBER_PREFIX = /^(?:第\s*\d+\s*[节讲章课回]|レッスン\s*\d+|Lesson\s*\d+|Lección\s*\d+|Lição\s*\d+|제\s*\d+\s*강)\s*[：:]\s*/i;

export function stripLessonNumberPrefix(title: string): string {
  return title.replace(LESSON_NUMBER_PREFIX, "").trim();
}
