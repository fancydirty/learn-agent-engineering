// course-reader/lib/prompt-copy.ts
// Shared scaffolding for every "copy to agent" prompt, keyed by Locale like site-copy.ts.
// Every launch locale gets its own labels. Machine fields (mode names, ids, JSON keys,
// file names) stay English in every locale — the agent reads those verbatim.
import type { Lang } from "./i18n";
import type { Locale } from "./locales";
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
  ja: {
    enterMode: (mode: string) => `Agent Mentor の \`${mode}\` モードに入ってください。`,
    courseTitle: "コースタイトル",
    courseUrl: "公開レッスン URL",
    currentLesson: "現在のレッスン",
    currentLessonTitle: "現在のレッスンタイトル",
    contextFallback: {
      interactive: "コースの文脈:\n現在の Agent Mentor リーダーからこのインタラクティブ演習をコピーしました。",
      code: "コースの文脈:\n現在の Agent Mentor リーダーからこのコード演習をコピーしました。",
    },
    exerciseTitle: "演習タイトル",
    exercisePrompt: "演習の問題文",
    whyHere: "ここで練習する理由",
    userGoal: "私の目的",
    localResult: "ローカルチェック結果",
    pass: "合格",
    fail: "不合格",
  },
  ko: {
    enterMode: (mode: string) => `Agent Mentor의 \`${mode}\` 모드로 들어가 주세요.`,
    courseTitle: "코스 제목",
    courseUrl: "공개 레슨 URL",
    currentLesson: "현재 레슨",
    currentLessonTitle: "현재 레슨 제목",
    contextFallback: {
      interactive: "코스 맥락:\n현재 Agent Mentor 리더에서 이 인터랙티브 연습을 복사했습니다.",
      code: "코스 맥락:\n현재 Agent Mentor 리더에서 이 코드 연습을 복사했습니다.",
    },
    exerciseTitle: "연습 제목",
    exercisePrompt: "연습 문제",
    whyHere: "여기서 연습하는 이유",
    userGoal: "내 목적",
    localResult: "로컬 검사 결과",
    pass: "통과",
    fail: "미통과",
  },
  es: {
    enterMode: (mode: string) => `Entra en el modo \`${mode}\` de Agent Mentor.`,
    courseTitle: "Título del curso",
    courseUrl: "URL pública de la lección",
    currentLesson: "Lección actual",
    currentLessonTitle: "Título de la lección actual",
    contextFallback: {
      interactive: "Contexto del curso:\nHe copiado este ejercicio interactivo del lector de Agent Mentor.",
      code: "Contexto del curso:\nHe copiado este ejercicio de código del lector de Agent Mentor.",
    },
    exerciseTitle: "Título del ejercicio",
    exercisePrompt: "Enunciado del ejercicio",
    whyHere: "Por qué se practica aquí",
    userGoal: "Mi objetivo",
    localResult: "Resultado de la comprobación local",
    pass: "Superado",
    fail: "No superado",
  },
  "pt-BR": {
    enterMode: (mode: string) => `Entre no modo \`${mode}\` do Agent Mentor.`,
    courseTitle: "Título do curso",
    courseUrl: "URL pública da lição",
    currentLesson: "Lição atual",
    currentLessonTitle: "Título da lição atual",
    contextFallback: {
      interactive: "Contexto do curso:\nCopiei este exercício interativo do leitor do Agent Mentor.",
      code: "Contexto do curso:\nCopiei este exercício de código do leitor do Agent Mentor.",
    },
    exerciseTitle: "Título do exercício",
    exercisePrompt: "Enunciado do exercício",
    whyHere: "Por que praticar isto aqui",
    userGoal: "Meu objetivo",
    localResult: "Resultado da verificação local",
    pass: "Aprovado",
    fail: "Não aprovado",
  },
} as const satisfies Record<Locale, unknown>;

export function promptScaffold(lang: Lang) {
  return SCAFFOLD[lang];
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
  ja: {
    inCourse: (focus: string) =>
      `上の公開レッスン URL とインラインの問題文を参照してください。URL にアクセスできない場合は、コピーされた文脈だけを頼りに${focus}。`,
    standalone: (focus: string) => `問題文、私の解答、ローカルのフィードバックはすべて上にあります。そのまま${focus}。`,
  },
  ko: {
    inCourse: (focus: string) =>
      `위의 공개 레슨 URL과 인라인 문제를 참고하세요. URL에 접근할 수 없으면 복사된 맥락만으로 ${focus}.`,
    standalone: (focus: string) => `문제, 내 답변, 로컬 피드백이 모두 위에 있습니다. 바로 ${focus}.`,
  },
  es: {
    inCourse: (focus: string) =>
      `Usa la URL pública de la lección y el ejercicio de arriba; si la URL no está disponible, apóyate en el contexto copiado y ${focus}.`,
    standalone: (focus: string) => `El ejercicio, mi respuesta y los comentarios locales están arriba; ${focus}.`,
  },
  "pt-BR": {
    inCourse: (focus: string) =>
      `Use a URL pública da lição e o exercício acima; se a URL não estiver disponível, apoie-se no contexto copiado e ${focus}.`,
    standalone: (focus: string) => `O exercício, minha resposta e o feedback local estão todos acima; ${focus}.`,
  },
} as const satisfies Record<Locale, unknown>;

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
  return context?.courseUrl.trim() ? READ_FILES[lang].inCourse(focus) : READ_FILES[lang].standalone(focus);
}

/** The course-context header lines shared by all copy prompts (with "" gaps between fields). */
export function promptContextLines(
  context: MentorActionContext | undefined,
  lang: Lang,
  kind: PromptContextKind = "interactive",
): string[] {
  const s = SCAFFOLD[lang];
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
