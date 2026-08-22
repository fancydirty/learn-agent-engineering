import type { Lang } from "./i18n";
import type { Locale } from "./locales";
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

// Builder-specific copy, keyed by locale like site-copy.ts. Shared field/mode scaffolding
// comes from prompt-copy.ts; the mentor-action-specific phrasing lives here.
const COPY: Record<Locale, {
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
  ja: {
    copyToAgent: "agent にコピー",
    defaultRules: [
      "やり取りを始める前に、コースのディレクトリと現在のレッスンを読んでください。",
      "一度に 1 つの問い、または 1 つのタスクだけを進めてください。",
      "私の回答から具体的な盲点を指摘してください。模範解答を演じないでください。",
    ],
    interactionRules: "やり取りのルール:",
    startTask: "上の公開レッスン URL と問題文の文脈を使って、そのまま始めてください。コースの背景を私に説明し直させないでください。",
    exerciseFallback: (n) => `演習 ${n}`,
    completionCriteria: "完了基準:",
    exerciseLabel: (level) => `agent と${level}に取り組む`,
    exerciseDescription: "コピーすると、agent がこのレッスンの文脈を読み、まずあなたに答えさせてから、完了基準に沿って掘り下げて質問します。",
    exerciseWorkingOn: (level) => `私は現在のレッスンの${level}に取り組んでいます。`,
    exerciseRules: [
      "この演習を見る前に、コースのディレクトリと現在のレッスンを読んでください。",
      "先に完全な答えを与えないでください。まず私自身の解法や判断を書かせてください。",
      "私の回答が曖昧なら、完了基準を 1 項目ずつ確認し、具体的な盲点を指摘してください。",
    ],
  },
  ko: {
    copyToAgent: "agent에 복사",
    defaultRules: [
      "대화를 시작하기 전에 코스 디렉터리와 현재 레슨을 읽어 주세요.",
      "한 번에 하나의 질문 또는 하나의 작업만 진행해 주세요.",
      "내 답변에서 구체적인 맹점을 짚어 주세요. 모범 답안을 연기하지 마세요.",
    ],
    interactionRules: "상호작용 규칙:",
    startTask: "위의 공개 레슨 URL과 문제 맥락을 사용해 바로 시작해 주세요. 코스 배경을 다시 설명하라고 요구하지 마세요.",
    exerciseFallback: (n) => `연습 ${n}`,
    completionCriteria: "완료 기준:",
    exerciseLabel: (level) => `agent와 ${level} 진행하기`,
    exerciseDescription: "복사하면 agent가 이 레슨의 맥락을 읽고, 먼저 답하게 한 뒤 완료 기준에 따라 파고들어 질문합니다.",
    exerciseWorkingOn: (level) => `저는 현재 레슨의 ${level}을(를) 하고 있습니다.`,
    exerciseRules: [
      "이 연습을 보기 전에 코스 디렉터리와 현재 레슨을 읽어 주세요.",
      "완전한 답을 먼저 주지 마세요. 먼저 제가 직접 해법이나 판단을 쓰게 해 주세요.",
      "제 답이 모호하면 완료 기준을 항목별로 짚어 물으며 구체적인 맹점을 지적해 주세요.",
    ],
  },
  es: {
    copyToAgent: "Copiar al agent",
    defaultRules: [
      "Lee el directorio del curso y la lección actual antes de empezar.",
      "Avanza una pregunta o una tarea a la vez.",
      "Señala los puntos ciegos concretos de mis respuestas; no representes la respuesta modelo.",
    ],
    interactionRules: "Reglas de interacción:",
    startTask: "Usa la URL pública de la lección y el contexto del ejercicio de arriba, y empieza directamente. No me pidas que vuelva a explicar el contexto del curso.",
    exerciseFallback: (n) => `Ejercicio ${n}`,
    completionCriteria: "Criterios de finalización:",
    exerciseLabel: (level) => `Trabajar ${level} con el agent`,
    exerciseDescription: "Al copiar, el agent lee el contexto de esta lección, te hace responder primero y luego pregunta según los criterios de finalización.",
    exerciseWorkingOn: (level) => `Estoy trabajando en ${level} de la lección actual.`,
    exerciseRules: [
      "Lee el directorio del curso y la lección actual antes de mirar este ejercicio.",
      "No des la respuesta completa primero; hazme escribir mi propia solución o juicio antes.",
      "Si mi respuesta es vaga, pregunta por cada criterio de finalización y señala los puntos ciegos concretos.",
    ],
  },
  "pt-BR": {
    copyToAgent: "Copiar para o agent",
    defaultRules: [
      "Leia o diretório do curso e a lição atual antes de começarmos.",
      "Avance uma pergunta ou uma tarefa por vez.",
      "Aponte os pontos cegos concretos das minhas respostas; não encene a resposta modelo.",
    ],
    interactionRules: "Regras de interação:",
    startTask: "Use a URL pública da lição e o contexto do exercício acima e comece direto. Não me peça para reexplicar o contexto do curso.",
    exerciseFallback: (n) => `Exercício ${n}`,
    completionCriteria: "Critérios de conclusão:",
    exerciseLabel: (level) => `Trabalhar ${level} com o agent`,
    exerciseDescription: "Ao copiar, o agent lê o contexto desta lição, faz você responder primeiro e depois questiona segundo os critérios de conclusão.",
    exerciseWorkingOn: (level) => `Estou trabalhando em ${level} da lição atual.`,
    exerciseRules: [
      "Leia o diretório do curso e a lição atual antes de olhar este exercício.",
      "Não dê a resposta completa primeiro; faça-me escrever minha própria solução ou julgamento antes.",
      "Se minha resposta for vaga, questione cada critério de conclusão e aponte os pontos cegos concretos.",
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
