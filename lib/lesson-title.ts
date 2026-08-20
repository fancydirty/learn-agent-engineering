// Strip numbered prefixes from lesson titles (pure logic; safe for client import).
// Sidebar TOC, posters, and breadcrumbs already show numbers — keeping them in the title
// yields double numbering like "1. 第 1 课：备菜".
// Strip the whole counter family: shipped courses use 课/节/讲/章 (legacy "第 02 节：", new "第 1 课：").
// An older regex that only matched 节/讲/章 missed 课, so every zh course double-numbered. Same for "Lesson 01:" on en courses.
const LESSON_NUMBER_PREFIX = /^(?:第\s*\d+\s*[节讲章课]|Lesson\s*\d+)\s*[：:]\s*/i;

export function stripLessonNumberPrefix(title: string): string {
  return title.replace(LESSON_NUMBER_PREFIX, "").trim();
}
