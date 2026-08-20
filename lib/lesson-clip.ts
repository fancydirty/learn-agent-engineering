// Pure logic: build "attribution comment + raw lesson md" for the copy button.
export function lessonClipboardText(courseTitle: string, lessonTitle: string, lessonUrl: string, raw: string): string {
  return `我正在学习《${courseTitle}》的「${lessonTitle}」。\n课程链接：${lessonUrl}\n\n请先阅读下面的课程原文，再根据我接下来的要求协助我。不要跳过文中的限制条件、来源标记和练习要求。\n\n---\n\n${raw}`;
}
