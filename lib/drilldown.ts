import type { Lang } from "./i18n";

export interface DrillContext {
  courseUrl: string;
  courseTitle: string;
  lessonFile: string;
  lessonTitle: string;
}

export function buildSelectionAgentPrompt(selection: string, ctx: DrillContext, lang: Lang): string {
  return lang === "zh"
    ? [
        `我正在读《${ctx.courseTitle}》的「${ctx.lessonTitle}」。`,
        `公开课链接：${ctx.courseUrl}`,
        "",
        "我选中了这段内容：",
        `「${selection}」`,
        "",
        "请结合这门课与当前课节解释它。先用一句话说清核心，再给一个具体例子；如果我的理解里可能有坑，直接指出。",
      ].join("\n")
    : [
        `I am reading “${ctx.lessonTitle}” in “${ctx.courseTitle}”.`,
        `Public lesson: ${ctx.courseUrl}`,
        "",
        "Selected passage:",
        `“${selection}”`,
        "",
        "Explain it in the context of this lesson. Start with the core idea in one sentence, give one concrete example, and point out likely misunderstandings.",
      ].join("\n");
}

export function buildGlossaryDrillPrompt(term: string, def: string, ctx: DrillContext, lang: Lang): string {
  return lang === "zh"
    ? `我正在读《${ctx.courseTitle}》的「${ctx.lessonTitle}」（${ctx.courseUrl}）。术语「${term}」的课程释义是：${def}\n\n请结合当前课节换一种方式解释，并给一个能直接验证理解的小例子。`
    : `I am reading “${ctx.lessonTitle}” in “${ctx.courseTitle}” (${ctx.courseUrl}). The course defines “${term}” as: ${def}\n\nExplain it another way in this lesson's context and give one small example that tests understanding.`;
}
