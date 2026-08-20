import type { MentorActionContext } from "./mentor-actions";
import type { Lang } from "./i18n";
import { promptScaffold, promptContextLines, field } from "./prompt-copy";

export type LearningInteractionLanguage =
  | "agentmentor-predict"
  | "agentmentor-trace"
  | "agentmentor-diff"
  | "agentmentor-hotspot";
export type SnippetLanguage =
  | "css"
  | "javascript"
  | "typescript"
  | "jsx"
  | "tsx"
  | "html"
  | "python"
  | "text";
export type PredictMatchMode = "exact" | "normalized" | "contains" | "regex" | "";

export interface PredictBlock {
  type: "predict";
  id: string;
  label: string;
  prompt: string;
  whyHere: string;
  language: SnippetLanguage | "";
  snippet: string;
  match: PredictMatchMode;
  expected: string;
  pattern: string;
  feedbackCorrect: string;
  feedbackWrong: string;
  copyPurpose: string;
}

export interface PredictResult {
  passed: boolean;
  message: string;
}

export interface TraceColumn {
  id: string;
  label: string;
}

export interface TraceCell {
  columnId: string;
  answer: string;
  given: boolean;
}

export interface TraceRow {
  id: string;
  label: string;
  cells: TraceCell[];
}

export interface TraceBlock {
  type: "trace";
  id: string;
  label: string;
  prompt: string;
  whyHere: string;
  language: SnippetLanguage | "";
  snippet: string;
  columns: TraceColumn[];
  rows: TraceRow[];
  feedbackCorrect: string;
  feedbackWrong: string;
  copyPurpose: string;
}

export interface TraceCellResult {
  rowId: string;
  columnId: string;
  passed: boolean;
  given: boolean;
  expected: string;
  actual: string;
}

export interface DiffChoice {
  id: string;
  text: string;
  correct: boolean;
  feedback: string;
}

export interface DiffBlock {
  type: "diff";
  id: string;
  label: string;
  prompt: string;
  whyHere: string;
  language: SnippetLanguage | "";
  focus: string;
  diff: string;
  choices: DiffChoice[];
  copyPurpose: string;
}

export interface DiffLine {
  kind: "added" | "removed" | "meta" | "context";
  text: string;
}

export interface DiffChoiceResult {
  passed: boolean;
  message: string;
  choice?: DiffChoice;
}

export type HotspotLayout = "flow" | "stack" | "map" | "";

export interface HotspotNode {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface HotspotEdge {
  from: string;
  to: string;
  label: string;
}

export interface HotspotTarget {
  nodeId: string;
  correct: boolean;
  feedback: string;
}

export interface HotspotBlock {
  type: "hotspot";
  id: string;
  label: string;
  prompt: string;
  whyHere: string;
  layout: HotspotLayout;
  nodes: HotspotNode[];
  edges: HotspotEdge[];
  hotspots: HotspotTarget[];
  copyPurpose: string;
}

export interface HotspotResult {
  passed: boolean;
  message: string;
  node?: HotspotNode;
  hotspot?: HotspotTarget;
}

export type LearningInteractionBlock = PredictBlock | TraceBlock | DiffBlock | HotspotBlock;

export type LearningInteractionParseResult =
  | { ok: true; block: LearningInteractionBlock }
  | { ok: false; error: string };

const LANGUAGES = new Set<SnippetLanguage>([
  "css",
  "javascript",
  "typescript",
  "jsx",
  "tsx",
  "html",
  "python",
  "text",
]);

const MATCH_MODES = new Set<PredictMatchMode>(["exact", "normalized", "contains", "regex"]);
const HOTSPOT_LAYOUTS = new Set<HotspotLayout>(["flow", "stack", "map"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function trimmed(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function rawString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function parseLanguage(value: unknown): SnippetLanguage | "" {
  const language = trimmed(value).toLowerCase();
  return LANGUAGES.has(language as SnippetLanguage) ? language as SnippetLanguage : "";
}

function normalizeOutput(value: string) {
  return value.trim().replace(/\r\n/g, "\n");
}

function normalizeCell(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

const HAN_CHARACTER_RE = /[\u3400-\u9FFF\uF900-\uFAFF]/u;
const ASCII_ALNUM_RE = /[A-Za-z0-9]/;

function isHanOrAsciiAlnum(value: string) {
  return HAN_CHARACTER_RE.test(value) || ASCII_ALNUM_RE.test(value);
}

function isCjkTextBoundary(before: string, after: string) {
  return (HAN_CHARACTER_RE.test(before) || HAN_CHARACTER_RE.test(after))
    && isHanOrAsciiAlnum(before)
    && isHanOrAsciiAlnum(after);
}

function normalizePredictOutput(value: string) {
  const normalized = normalizeCell(value);
  return normalized.replace(/\s+/g, (space, offset, source) => {
    const before = source[offset - 1] ?? "";
    const after = source[offset + space.length] ?? "";
    return isCjkTextBoundary(before, after) ? "" : " ";
  });
}

function parseMatch(value: unknown): PredictMatchMode {
  const mode = trimmed(value);
  return MATCH_MODES.has(mode as PredictMatchMode) ? mode as PredictMatchMode : "";
}

function parseColumns(value: unknown): TraceColumn[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const item = isObject(raw) ? raw : {};
    return { id: trimmed(item.id), label: trimmed(item.label) };
  });
}

function parseCell(value: unknown, columnId: string): TraceCell {
  if (isObject(value)) {
    return {
      columnId,
      answer: rawString(value.answer ?? value.value),
      given: value.given === true,
    };
  }
  return { columnId, answer: rawString(value), given: false };
}

function parseRows(value: unknown, columns: TraceColumn[]): TraceRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const item = isObject(raw) ? raw : {};
    const cellSource = isObject(item.cells) ? item.cells : {};
    return {
      id: trimmed(item.id),
      label: trimmed(item.label),
      cells: columns.map((column) => parseCell(cellSource[column.id], column.id)),
    };
  });
}

function parseDiffChoices(value: unknown): DiffChoice[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const item = isObject(raw) ? raw : {};
    return {
      id: trimmed(item.id),
      text: trimmed(item.text),
      correct: item.correct === true,
      feedback: trimmed(item.feedback),
    };
  });
}

function parseHotspotLayout(value: unknown): HotspotLayout {
  const layout = trimmed(value).toLowerCase();
  return HOTSPOT_LAYOUTS.has(layout as HotspotLayout) ? layout as HotspotLayout : "";
}

function parsePercent(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}

function parseHotspotNodes(value: unknown): HotspotNode[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const item = isObject(raw) ? raw : {};
    return {
      id: trimmed(item.id),
      label: trimmed(item.label),
      x: parsePercent(item.x),
      y: parsePercent(item.y),
    };
  });
}

function parseHotspotEdges(value: unknown): HotspotEdge[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const item = isObject(raw) ? raw : {};
    return {
      from: trimmed(item.from),
      to: trimmed(item.to),
      label: trimmed(item.label),
    };
  });
}

function parseHotspots(value: unknown): HotspotTarget[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const item = isObject(raw) ? raw : {};
    return {
      nodeId: trimmed(item.nodeId),
      correct: item.correct === true,
      feedback: trimmed(item.feedback),
    };
  });
}

export function parseLearningInteractionBlock(language: string, code: string): LearningInteractionParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(code);
  } catch (error) {
    return { ok: false, error: `interaction block JSON parse failed: ${error instanceof Error ? error.message : String(error)}` };
  }

  if (!isObject(raw)) return { ok: false, error: "interaction block must be a JSON object" };

  if (language === "agentmentor-predict") {
    return {
      ok: true,
      block: {
        type: "predict",
        id: trimmed(raw.id),
        label: trimmed(raw.label),
        prompt: trimmed(raw.prompt),
        whyHere: trimmed(raw.whyHere),
        language: parseLanguage(raw.language),
        snippet: rawString(raw.snippet),
        match: parseMatch(raw.match),
        expected: rawString(raw.expected),
        pattern: rawString(raw.pattern),
        feedbackCorrect: trimmed(raw.feedbackCorrect),
        feedbackWrong: trimmed(raw.feedbackWrong),
        copyPurpose: trimmed(raw.copyPurpose),
      },
    };
  }

  if (language === "agentmentor-trace") {
    const columns = parseColumns(raw.columns);
    return {
      ok: true,
      block: {
        type: "trace",
        id: trimmed(raw.id),
        label: trimmed(raw.label),
        prompt: trimmed(raw.prompt),
        whyHere: trimmed(raw.whyHere),
        language: parseLanguage(raw.language),
        snippet: rawString(raw.snippet),
        columns,
        rows: parseRows(raw.rows, columns),
        feedbackCorrect: trimmed(raw.feedbackCorrect),
        feedbackWrong: trimmed(raw.feedbackWrong),
        copyPurpose: trimmed(raw.copyPurpose),
      },
    };
  }

  if (language === "agentmentor-diff") {
    return {
      ok: true,
      block: {
        type: "diff",
        id: trimmed(raw.id),
        label: trimmed(raw.label),
        prompt: trimmed(raw.prompt),
        whyHere: trimmed(raw.whyHere),
        language: parseLanguage(raw.language),
        focus: trimmed(raw.focus),
        diff: rawString(raw.diff),
        choices: parseDiffChoices(raw.choices),
        copyPurpose: trimmed(raw.copyPurpose),
      },
    };
  }

  if (language === "agentmentor-hotspot") {
    return {
      ok: true,
      block: {
        type: "hotspot",
        id: trimmed(raw.id),
        label: trimmed(raw.label),
        prompt: trimmed(raw.prompt),
        whyHere: trimmed(raw.whyHere),
        layout: parseHotspotLayout(raw.layout),
        nodes: parseHotspotNodes(raw.nodes),
        edges: parseHotspotEdges(raw.edges),
        hotspots: parseHotspots(raw.hotspots),
        copyPurpose: trimmed(raw.copyPurpose),
      },
    };
  }

  return { ok: false, error: `unknown interaction block language: ${language}` };
}

export function validateLearningInteractionBlock(block: LearningInteractionBlock): string[] {
  const errors: string[] = [];
  const label = block.type === "predict"
    ? "agentmentor-predict"
    : block.type === "trace"
      ? "agentmentor-trace"
      : block.type === "diff"
        ? "agentmentor-diff"
        : "agentmentor-hotspot";

  for (const key of ["id", "label", "prompt", "whyHere", "copyPurpose"] as const) {
    if (!block[key]) errors.push(`${label} missing/empty ${key}`);
  }

  if ("language" in block && block.language && !LANGUAGES.has(block.language)) errors.push(`${label} language not supported`);

  if (block.type === "predict") {
    for (const key of ["snippet", "feedbackCorrect", "feedbackWrong"] as const) {
      if (!block[key].trim()) errors.push(`${label} missing/empty ${key}`);
    }
    if (!block.match) errors.push("agentmentor-predict match must be exact/normalized/contains/regex");
    if (block.match === "regex") {
      if (!block.pattern.trim()) errors.push("agentmentor-predict regex missing/empty pattern");
      else {
        try {
          new RegExp(block.pattern);
        } catch (error) {
          errors.push(`agentmentor-predict pattern does not compile: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } else if (!block.expected.trim()) {
      errors.push("agentmentor-predict missing/empty expected");
    }
  } else if (block.type === "trace") {
    for (const key of ["snippet", "feedbackCorrect", "feedbackWrong"] as const) {
      if (!block[key].trim()) errors.push(`${label} missing/empty ${key}`);
    }
    if (block.columns.length < 2 || block.columns.length > 6) errors.push("agentmentor-trace columns must be 2-6");
    if (block.rows.length < 2 || block.rows.length > 8) errors.push("agentmentor-trace rows must be 2-8");

    const columnIds = new Set<string>();
    for (const column of block.columns) {
      if (!column.id || !column.label) errors.push("agentmentor-trace column missing id/label");
      else if (columnIds.has(column.id)) errors.push(`agentmentor-trace column id duplicate: ${column.id}`);
      else columnIds.add(column.id);
    }

    const rowIds = new Set<string>();
    let editableCells = 0;
    for (const row of block.rows) {
      if (!row.id || !row.label) errors.push("agentmentor-trace row missing id/label");
      else if (rowIds.has(row.id)) errors.push(`agentmentor-trace row id duplicate: ${row.id}`);
      else rowIds.add(row.id);

      if (row.cells.length !== block.columns.length) errors.push(`agentmentor-trace row ${row.id || "(unknown)"} cells must cover all columns`);
      for (const cell of row.cells) {
        if (!columnIds.has(cell.columnId)) errors.push(`agentmentor-trace cell has unknown columnId: ${cell.columnId}`);
        if (!cell.answer.trim()) errors.push(`agentmentor-trace ${row.id || "(unknown)"}.${cell.columnId} missing/empty answer`);
        if (!cell.given) editableCells++;
      }
    }
    if (block.rows.length && editableCells === 0) errors.push("agentmentor-trace needs at least one editable cell");
  } else if (block.type === "diff") {
    if (!block.language) errors.push("agentmentor-diff language must be css/javascript/typescript/jsx/tsx/html/python/text");
    if (!block.focus) errors.push("agentmentor-diff missing/empty focus");
    if (!block.diff.trim()) errors.push("agentmentor-diff missing/empty diff");
    if (!/^\+(?!\+\+)/m.test(block.diff)) errors.push("agentmentor-diff diff needs at least one real added line");
    if (!/^-(?!--)/m.test(block.diff)) errors.push("agentmentor-diff diff needs at least one real removed line");
    if (block.choices.length < 2 || block.choices.length > 5) errors.push("agentmentor-diff choices must be 2-5");

    const choiceIds = new Set<string>();
    let correct = 0;
    for (const choice of block.choices) {
      if (!choice.id) errors.push("agentmentor-diff choice missing/empty id");
      else if (choiceIds.has(choice.id)) errors.push(`agentmentor-diff choice id duplicate: ${choice.id}`);
      else choiceIds.add(choice.id);
      if (!choice.text) errors.push(`agentmentor-diff ${choice.id || "(unknown)"} missing/empty text`);
      if (!choice.feedback) errors.push(`agentmentor-diff ${choice.id || "(unknown)"} missing/empty feedback`);
      if (choice.correct) correct++;
    }
    if (correct !== 1) errors.push("agentmentor-diff must have exactly one correct choice");
  } else {
    if (!block.layout) errors.push("agentmentor-hotspot layout must be flow/stack/map");
    if (block.nodes.length < 3 || block.nodes.length > 8) errors.push("agentmentor-hotspot nodes must be 3-8");
    if (block.edges.length > 10) errors.push("agentmentor-hotspot edges at most 10");
    if (block.hotspots.length < 2 || block.hotspots.length > 6) errors.push("agentmentor-hotspot hotspots must be 2-6");

    const nodeIds = new Set<string>();
    for (const node of block.nodes) {
      if (!node.id || !node.label) errors.push("agentmentor-hotspot node missing id/label");
      else if (nodeIds.has(node.id)) errors.push(`agentmentor-hotspot node id duplicate: ${node.id}`);
      else nodeIds.add(node.id);
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y) || node.x < 0 || node.x > 100 || node.y < 0 || node.y > 100) {
        errors.push(`agentmentor-hotspot ${node.id || "(unknown)"} coordinates must be 0-100`);
      }
    }

    for (const edge of block.edges) {
      if (!edge.from || !edge.to) {
        errors.push("agentmentor-hotspot edge missing from/to");
      } else {
        if (!nodeIds.has(edge.from)) errors.push(`agentmentor-hotspot edge references unknown node: ${edge.from}`);
        if (!nodeIds.has(edge.to)) errors.push(`agentmentor-hotspot edge references unknown node: ${edge.to}`);
      }
    }

    let correct = 0;
    const hotspotNodes = new Set<string>();
    for (const hotspot of block.hotspots) {
      if (!hotspot.nodeId) errors.push("agentmentor-hotspot hotspot missing nodeId");
      else if (!nodeIds.has(hotspot.nodeId)) errors.push(`agentmentor-hotspot hotspot references unknown node: ${hotspot.nodeId}`);
      else if (hotspotNodes.has(hotspot.nodeId)) errors.push(`agentmentor-hotspot hotspot nodeId duplicate: ${hotspot.nodeId}`);
      else hotspotNodes.add(hotspot.nodeId);
      if (!hotspot.feedback) errors.push(`agentmentor-hotspot ${hotspot.nodeId || "(unknown)"} missing/empty feedback`);
      if (hotspot.correct) correct++;
    }
    if (correct !== 1) errors.push("agentmentor-hotspot must have exactly one correct hotspot");
  }

  return errors;
}

export function parseDiffLines(diff: string): DiffLine[] {
  return diff.replace(/\r\n/g, "\n").split("\n").map((text) => {
    if (text.startsWith("+++") || text.startsWith("---") || text.startsWith("@@")) {
      return { kind: "meta", text };
    }
    if (text.startsWith("+")) return { kind: "added", text };
    if (text.startsWith("-")) return { kind: "removed", text };
    return { kind: "context", text };
  });
}

export function runDiffChoiceCheck(block: DiffBlock, choiceId: string): DiffChoiceResult {
  const choice = block.choices.find((item) => item.id === choiceId);
  return {
    passed: choice?.correct === true,
    message: choice?.feedback || "先选择一个解释,再检查。",
    choice,
  };
}

export function runHotspotCheck(block: HotspotBlock, selectedNodeId: string): HotspotResult {
  const node = block.nodes.find((item) => item.id === selectedNodeId);
  const hotspot = block.hotspots.find((item) => item.nodeId === selectedNodeId);
  if (!selectedNodeId) return { passed: false, message: "先选择一个图中节点,再检查。" };
  if (!node) return { passed: false, message: "这个节点不在图里。" };
  if (!hotspot) {
    return {
      passed: false,
      message: "这个节点不是本题判定点。回到题目问的是哪个结构责任。",
      node,
    };
  }
  return {
    passed: hotspot.correct,
    message: hotspot.feedback,
    node,
    hotspot,
  };
}

export function runPredictCheck(block: PredictBlock, answer: string): PredictResult {
  let passed = false;
  if (block.match === "exact") {
    passed = normalizeOutput(answer) === normalizeOutput(block.expected);
  } else if (block.match === "normalized") {
    passed = normalizePredictOutput(answer) === normalizePredictOutput(block.expected);
  } else if (block.match === "contains") {
    // Case-insensitive: mobile keyboards auto-capitalize; "Sixth" must not fail.
    passed = answer.toLowerCase().includes(block.expected.toLowerCase());
  } else if (block.match === "regex") {
    try {
      passed = new RegExp(block.pattern).test(answer);
    } catch {
      passed = false;
    }
  }
  return { passed, message: passed ? block.feedbackCorrect : block.feedbackWrong };
}

export function traceCellKey(rowId: string, columnId: string) {
  return `${rowId}::${columnId}`;
}

export function initialTraceValues(block: TraceBlock): Record<string, string> {
  const values: Record<string, string> = {};
  for (const row of block.rows) {
    for (const cell of row.cells) {
      values[traceCellKey(row.id, cell.columnId)] = cell.given ? cell.answer : "";
    }
  }
  return values;
}

export function runTraceChecks(block: TraceBlock, values: Record<string, string>): TraceCellResult[] {
  return block.rows.flatMap((row) => row.cells.map((cell) => {
    const actual = values[traceCellKey(row.id, cell.columnId)] ?? "";
    return {
      rowId: row.id,
      columnId: cell.columnId,
      passed: cell.given || normalizeCell(actual) === normalizeCell(cell.answer),
      given: cell.given,
      expected: cell.answer,
      actual,
    };
  }));
}

// Builder-specific copy. Shared context/field/mode scaffolding lives in prompt-copy.ts;
// only the phrasing unique to predict/trace/diff/hotspot lives here, double-keyed like site-copy.ts.
const COPY: Record<Lang, {
  exerciseMaterial: string;
  changeLanguage: string;
  changeSource: string;
  readDiffHint: string;
  diagramType: string;
  diagramNodes: string;
  diagramEdges: string;
  none: string;
  emptyCell: string;
  myPrediction: string;
  noPrediction: string;
  myTrace: string;
  allCellsPassedTail: string;
  wrongCellsHeader: string;
  mySelection: string;
  noSelection: string;
  myClick: string;
  predictClose: string;
  traceClose: string;
  diffClose: string;
  hotspotClose: string;
}> = {
  zh: {
    exerciseMaterial: "题目材料",
    changeLanguage: "改动语言",
    changeSource: "改动原文",
    readDiffHint: "读 diff 提示",
    diagramType: "图类型",
    diagramNodes: "图中节点",
    diagramEdges: "图中连线",
    none: "(无)",
    emptyCell: "(空)",
    myPrediction: "我的预测:",
    noPrediction: "(我还没有填写预测)",
    myTrace: "我的追踪表:",
    allCellsPassedTail: "全部可填写格子通过。",
    wrongCellsHeader: "本地检查未通过的格子:",
    mySelection: "我的选择:",
    noSelection: "(未选择)",
    myClick: "我的点击:",
    predictClose: "请先读取课程上下文,再围绕我的预测追问。不要直接给标准答案;先让我说明每一步为什么会得到这个输出。",
    traceClose: "请先读取课程上下文,再围绕我的追踪表追问。不要直接给整张标准表;先让我解释第一个错误格子的变量变化原因。",
    diffClose: "请先读取课程文件和当前课节,再追问我解释关键改动为什么解决问题。不要直接给标准答案或完整重写;先让我说出哪一行改变了机制。",
    hotspotClose: "请先读取课程文件和当前课节,再围绕我点击的节点追问。不要直接重画整张图;先让我解释这个节点承担什么责任,以及为什么其他相邻节点不承担这个责任。",
  },
  en: {
    exerciseMaterial: "Exercise material",
    changeLanguage: "Change language",
    changeSource: "Change source",
    readDiffHint: "Reading the diff",
    diagramType: "Diagram type",
    diagramNodes: "Diagram nodes",
    diagramEdges: "Diagram edges",
    none: "(none)",
    emptyCell: "(empty)",
    myPrediction: "My prediction:",
    noPrediction: "(I haven't filled in a prediction yet)",
    myTrace: "My trace table:",
    allCellsPassedTail: "All fillable cells passed.",
    wrongCellsHeader: "Cells that failed the local check:",
    mySelection: "My selection:",
    noSelection: "(no selection)",
    myClick: "My click:",
    predictClose: "First read the course context, then probe my prediction. Do not give the standard answer outright; first make me explain why each step produces this output.",
    traceClose: "First read the course context, then probe my trace table. Do not give the whole correct table outright; first make me explain the variable change in the first wrong cell.",
    diffClose: "First read the course files and the current lesson, then ask me to explain why the key change fixes the problem. Do not give the standard answer or a full rewrite outright; first make me say which line changed the mechanism.",
    hotspotClose: "First read the course files and the current lesson, then probe the node I clicked. Do not redraw the whole diagram outright; first make me explain what this node is responsible for, and why the other adjacent nodes are not.",
  },
};

function snippetLines(block: { language: SnippetLanguage | ""; snippet: string }, lang: Lang) {
  return [
    `${COPY[lang].exerciseMaterial}:`,
    `\`\`\`${block.language || "text"}`,
    block.snippet,
    "```",
  ];
}

function diffLines(block: DiffBlock, lang: Lang) {
  const t = COPY[lang];
  return [
    field(t.changeLanguage, block.language || "text"),
    "",
    `${t.changeSource}:`,
    "```diff",
    block.diff,
    "```",
  ];
}

function hotspotNodeLines(block: HotspotBlock, lang: Lang) {
  return [
    `${COPY[lang].diagramNodes}:`,
    ...block.nodes.map((node) => `- ${node.id}: ${node.label} (${node.x}, ${node.y})`),
  ];
}

function hotspotEdgeLines(block: HotspotBlock, lang: Lang) {
  const t = COPY[lang];
  if (!block.edges.length) return [`${t.diagramEdges}:\n${t.none}`];
  return [
    `${t.diagramEdges}:`,
    ...block.edges.map((edge) => `- ${edge.from} -> ${edge.to}${edge.label ? `: ${edge.label}` : ""}`),
  ];
}

export function buildPredictPrompt(block: PredictBlock, answer: string, result: PredictResult, lang: Lang, context?: MentorActionContext) {
  const s = promptScaffold(lang);
  const t = COPY[lang];
  return [
    s.enterMode("predict_output_coach"),
    "",
    ...promptContextLines(context, lang),
    "",
    field(s.exerciseTitle, block.label),
    "",
    field(s.exercisePrompt, block.prompt),
    "",
    field(s.whyHere, block.whyHere),
    "",
    ...snippetLines(block, lang),
    "",
    t.myPrediction,
    answer.trim() ? answer : t.noPrediction,
    "",
    `${s.localResult}:\n- ${result.passed ? s.pass : s.fail}: ${result.message}`,
    "",
    field(s.userGoal, block.copyPurpose),
    "",
    t.predictClose,
  ].join("\n");
}

export function buildTracePrompt(
  block: TraceBlock,
  values: Record<string, string>,
  results: TraceCellResult[],
  lang: Lang,
  context?: MentorActionContext,
) {
  const s = promptScaffold(lang);
  const t = COPY[lang];
  const rows = block.rows.map((row) => {
    const cells = block.columns.map((column) => {
      const key = traceCellKey(row.id, column.id);
      return `${column.label}=${values[key] || t.emptyCell}`;
    }).join(", ");
    return `- ${row.label}: ${cells}`;
  }).join("\n");
  const wrong = results.filter((result) => !result.given && !result.passed);

  return [
    s.enterMode("trace_table_coach"),
    "",
    ...promptContextLines(context, lang),
    "",
    field(s.exerciseTitle, block.label),
    "",
    field(s.exercisePrompt, block.prompt),
    "",
    field(s.whyHere, block.whyHere),
    "",
    ...snippetLines(block, lang),
    "",
    t.myTrace,
    rows,
    "",
    wrong.length
      ? [t.wrongCellsHeader, ...wrong.map((result) => `- row=${result.rowId}, column=${result.columnId}, mine=${result.actual || t.emptyCell}`)].join("\n")
      : `${s.localResult}:\n- ${t.allCellsPassedTail}`,
    "",
    field(s.userGoal, block.copyPurpose),
    "",
    t.traceClose,
  ].join("\n");
}

export function buildDiffPrompt(
  block: DiffBlock,
  selectedChoiceId: string,
  result: DiffChoiceResult,
  lang: Lang,
  context?: MentorActionContext,
) {
  const s = promptScaffold(lang);
  const t = COPY[lang];
  const selected = result.choice || block.choices.find((choice) => choice.id === selectedChoiceId);
  return [
    s.enterMode("diff_patch_coach"),
    "",
    ...promptContextLines(context, lang),
    "",
    field(s.exerciseTitle, block.label),
    "",
    field(s.exercisePrompt, block.prompt),
    "",
    field(s.whyHere, block.whyHere),
    "",
    field(t.readDiffHint, block.focus),
    "",
    ...diffLines(block, lang),
    "",
    t.mySelection,
    selected ? `${selected.id}: ${selected.text}` : t.noSelection,
    "",
    `${s.localResult}:\n- ${result.passed ? s.pass : s.fail}: ${result.message}`,
    "",
    field(s.userGoal, block.copyPurpose),
    "",
    t.diffClose,
  ].join("\n");
}

export function buildHotspotPrompt(
  block: HotspotBlock,
  selectedNodeId: string,
  result: HotspotResult,
  lang: Lang,
  context?: MentorActionContext,
) {
  const s = promptScaffold(lang);
  const t = COPY[lang];
  const selected = result.node || block.nodes.find((node) => node.id === selectedNodeId);
  return [
    s.enterMode("hotspot_diagram_coach"),
    "",
    ...promptContextLines(context, lang),
    "",
    field(s.exerciseTitle, block.label),
    "",
    field(s.exercisePrompt, block.prompt),
    "",
    field(s.whyHere, block.whyHere),
    "",
    field(t.diagramType, block.layout || "flow"),
    "",
    ...hotspotNodeLines(block, lang),
    "",
    ...hotspotEdgeLines(block, lang),
    "",
    t.myClick,
    selected ? `${selected.id}: ${selected.label}` : t.noSelection,
    "",
    `${s.localResult}:\n- ${result.passed ? s.pass : s.fail}: ${result.message}`,
    "",
    field(s.userGoal, block.copyPurpose),
    "",
    t.hotspotClose,
  ].join("\n");
}
