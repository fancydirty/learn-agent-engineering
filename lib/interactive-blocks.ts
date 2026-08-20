import type { MentorActionContext } from "./mentor-actions";
import type { Lang } from "./i18n";
import { promptScaffold, promptContextLines, field, readFilesLine } from "./prompt-copy";

export type InteractiveLanguage = "agentmentor-check" | "agentmentor-order";

export interface Choice {
  id: string;
  text: string;
  correct: boolean;
  feedback: string;
}

export interface CheckBlock {
  type: "check";
  id: string;
  label: string;
  prompt: string;
  whyHere: string;
  mode: "single" | "multi" | "";
  choices: Choice[];
  copyPurpose: string;
}

export interface OrderItem {
  id: string;
  text: string;
}

export interface OrderBlock {
  type: "order";
  id: string;
  label: string;
  prompt: string;
  whyHere: string;
  items: OrderItem[];
  correctOrder: string[];
  feedback: string;
  feedbackWrong: string;
  copyPurpose: string;
}

export type InteractiveBlock = CheckBlock | OrderBlock;

export interface CheckResult {
  passed: boolean;
  selectedIds: string[];
  selectedChoices: Choice[];
  feedbackLines: string[];
}

export interface OrderResult {
  passed: boolean;
  orderedIds: string[];
  orderedItems: OrderItem[];
  message: string;
}

export type ParseResult =
  | { ok: true; block: InteractiveBlock }
  | { ok: false; error: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseChoices(value: unknown): Choice[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const item = isObject(raw) ? raw : {};
    return {
      id: str(item.id),
      text: str(item.text),
      correct: item.correct === true,
      feedback: str(item.feedback),
    };
  });
}

function parseItems(value: unknown): OrderItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const item = isObject(raw) ? raw : {};
    return { id: str(item.id), text: str(item.text) };
  });
}

export function parseInteractiveBlock(language: string, code: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(code);
  } catch (error) {
    return { ok: false, error: `interactive block JSON parse failed: ${error instanceof Error ? error.message : String(error)}` };
  }

  if (!isObject(raw)) return { ok: false, error: "interactive block must be a JSON object" };

  if (language === "agentmentor-check") {
    return {
      ok: true,
      block: {
        type: "check",
        id: str(raw.id),
        label: str(raw.label),
        prompt: str(raw.prompt),
        whyHere: str(raw.whyHere),
        mode: raw.mode === "multi" || raw.mode === "single" ? raw.mode : "",
        choices: parseChoices(raw.choices),
        copyPurpose: str(raw.copyPurpose),
      },
    };
  }

  if (language === "agentmentor-order") {
    return {
      ok: true,
      block: {
        type: "order",
        id: str(raw.id),
        label: str(raw.label),
        prompt: str(raw.prompt),
        whyHere: str(raw.whyHere),
        items: parseItems(raw.items),
        correctOrder: Array.isArray(raw.correctOrder) ? raw.correctOrder.map(str).filter(Boolean) : [],
        feedback: str(raw.feedback),
        feedbackWrong: str(raw.feedbackWrong),
        copyPurpose: str(raw.copyPurpose),
      },
    };
  }

  return { ok: false, error: `unknown interactive block language: ${language}` };
}

export function validateInteractiveBlock(block: InteractiveBlock): string[] {
  const errors: string[] = [];
  const label = block.type === "check" ? "agentmentor-check" : "agentmentor-order";

  for (const key of ["id", "label", "prompt", "whyHere"] as const) {
    if (!block[key]) errors.push(`${label} missing/empty ${key}`);
  }

  if (block.type === "check") {
    if (!["single", "multi"].includes(block.mode)) errors.push("agentmentor-check mode must be single or multi");
    if (block.choices.length < 2 || block.choices.length > 5) errors.push("agentmentor-check choices must be 2-5 items");
    if (!block.choices.some((choice) => choice.correct)) errors.push("agentmentor-check needs at least one correct choice");
    for (const choice of block.choices) {
      if (!choice.id || !choice.text || !choice.feedback) errors.push("agentmentor-check choice missing id/text/feedback");
    }
    if (block.mode === "single" && block.choices.filter((choice) => choice.correct).length !== 1) {
      errors.push("agentmentor-check single mode must have exactly one correct choice");
    }
  } else {
    if (block.items.length < 3 || block.items.length > 7) errors.push("agentmentor-order items must be 3-7");
    if (block.correctOrder.length !== block.items.length) errors.push("agentmentor-order correctOrder must cover all items");
    if (!block.feedback) errors.push("agentmentor-order missing/empty feedback");
    if (!block.feedbackWrong) errors.push("agentmentor-order missing/empty feedbackWrong");
    const ids = new Set(block.items.map((item) => item.id).filter(Boolean));
    if (ids.size !== block.items.length) errors.push("agentmentor-order item id must be non-empty and unique");
    for (const id of block.correctOrder) {
      if (!ids.has(id)) errors.push(`agentmentor-order correctOrder contains unknown id: ${id}`);
    }
  }

  return errors;
}

export function runCheckBlock(block: CheckBlock, selected: Iterable<string>): CheckResult {
  const selectedIds = [...new Set([...selected].filter(Boolean))];
  const selectedSet = new Set(selectedIds);
  const selectedChoices = block.choices.filter((choice) => selectedSet.has(choice.id));
  const passed = block.choices.every((choice) => selectedSet.has(choice.id) === choice.correct);
  const feedbackLines = selectedChoices.map((choice) => `${choice.correct ? "通过" : "未通过"}: ${choice.feedback}`);
  return { passed, selectedIds, selectedChoices, feedbackLines };
}

export function runOrderBlock(block: OrderBlock, orderedItems: OrderItem[]): OrderResult {
  const orderedIds = orderedItems.map((item) => item.id);
  const passed = orderedIds.join("|") === block.correctOrder.join("|");
  return {
    passed,
    orderedIds,
    orderedItems,
    message: passed ? block.feedback : block.feedbackWrong,
  };
}

// Builder-specific copy. Shared context/field/mode scaffolding lives in prompt-copy.ts;
// only the phrasing unique to check/order lives here, double-keyed like site-copy.ts.
const COPY: Record<Lang, {
  mySelection: string;
  noSelection: string;
  localFeedback: string;
  noFeedback: string;
  myOrder: string;
  checkPurpose: (multi: boolean) => string;
  orderPurpose: string;
  // `*Focus` = tail clause fed to readFilesLine (context-gated); `*Pedagogy` = the
  // "don't hand me the answer" rule, appended verbatim in both contexts.
  checkFocus: string;
  checkPedagogy: string;
  orderFocus: string;
  orderPedagogy: string;
}> = {
  zh: {
    mySelection: "我的选择:",
    noSelection: "- (我还没有选择)",
    localFeedback: "本地反馈:",
    noFeedback: "- 我还没有查看任何本地反馈。",
    myOrder: "我的当前排序:",
    checkPurpose: (multi) => `围绕这道${multi ? "多选" : "单选"}题检查我是否真的理解: `,
    orderPurpose: "围绕这道排序题检查我是否真的理解流程依赖: ",
    checkFocus: "围绕我的选择追问",
    checkPedagogy: "不要直接告诉我标准选项;先让我解释每个选择背后的机制判断。如果我的答案只是碰巧选对,请追问为什么。",
    orderFocus: "围绕我的排序追问",
    orderPedagogy: "不要直接给完整正确顺序;先让我说明第一处顺序关系为什么应该那样排。",
  },
  en: {
    mySelection: "My selection:",
    noSelection: "- (I haven't selected anything yet)",
    localFeedback: "Local feedback:",
    noFeedback: "- I haven't reviewed any local feedback yet.",
    myOrder: "My current order:",
    checkPurpose: (multi) => `Check whether I truly understand this ${multi ? "multi-select" : "single-select"} question: `,
    orderPurpose: "Check whether I truly understand the sequence dependencies in this ordering exercise: ",
    checkFocus: "probe my selection",
    checkPedagogy: "Do not tell me the correct options outright; first make me explain the mechanism behind each choice. If I only guessed right, ask why.",
    orderFocus: "probe my ordering",
    orderPedagogy: "Do not give the full correct order outright; first make me explain why the first ordering relation must be arranged that way.",
  },
};

function defaultCheckPurpose(block: CheckBlock, lang: Lang) {
  return `${COPY[lang].checkPurpose(block.mode === "multi")}${block.prompt}`;
}

function defaultOrderPurpose(block: OrderBlock, lang: Lang) {
  return `${COPY[lang].orderPurpose}${block.prompt}`;
}

export function buildCheckPrompt(
  block: CheckBlock,
  result: CheckResult,
  lang: Lang,
  context?: MentorActionContext,
) {
  const s = promptScaffold(lang);
  const t = COPY[lang];
  const choices = result.selectedChoices.length
    ? result.selectedChoices.map((choice) => `- ${choice.text} (id=${choice.id})`).join("\n")
    : t.noSelection;
  const feedback = result.selectedChoices.length
    ? result.selectedChoices.map((choice) => `- ${choice.correct ? s.pass : s.fail}: ${choice.feedback}`).join("\n")
    : t.noFeedback;

  return [
    s.enterMode("choice_check_coach"),
    "",
    ...promptContextLines(context, lang),
    "",
    field(s.exerciseTitle, block.label),
    "",
    field(s.exercisePrompt, block.prompt),
    "",
    field(s.whyHere, block.whyHere),
    "",
    t.mySelection,
    choices,
    "",
    `${s.localResult}:\n- ${result.passed ? s.pass : s.fail}`,
    "",
    t.localFeedback,
    feedback,
    "",
    field(s.userGoal, block.copyPurpose || defaultCheckPurpose(block, lang)),
    "",
    readFilesLine(context, lang, t.checkFocus),
    t.checkPedagogy,
  ].join("\n");
}

export function buildOrderPrompt(
  block: OrderBlock,
  result: OrderResult,
  lang: Lang,
  context?: MentorActionContext,
) {
  const s = promptScaffold(lang);
  const t = COPY[lang];
  const order = result.orderedItems.map((item, index) => `${index + 1}. ${item.text} (id=${item.id})`).join("\n");

  return [
    s.enterMode("order_sequence_coach"),
    "",
    ...promptContextLines(context, lang),
    "",
    field(s.exerciseTitle, block.label),
    "",
    field(s.exercisePrompt, block.prompt),
    "",
    field(s.whyHere, block.whyHere),
    "",
    t.myOrder,
    order,
    "",
    `${s.localResult}:\n- ${result.passed ? s.pass : s.fail}: ${result.message}`,
    "",
    field(s.userGoal, block.copyPurpose || defaultOrderPurpose(block, lang)),
    "",
    readFilesLine(context, lang, t.orderFocus),
    t.orderPedagogy,
  ].join("\n");
}
