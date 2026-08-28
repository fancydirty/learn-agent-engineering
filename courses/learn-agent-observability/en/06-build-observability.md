# Lesson 6: Hands-On: Wiring an Observability Layer onto the Harness

> Learning goals:
> - Wire a working observability layer into your own harness: JSON Lines structured logs, trace tree reconstructed from logs, one-line metrics summary
> - Walk through a real error task from symptom → filter → first divergence point → fix → re-run comparison (stub-pinned model side for full re-runs; real APIs return to resume-from-error), and explain which absurdities are causes vs. which are contagion
> - Draw the boundaries of this observability layer: covers one process, one run; content defaults to off; thresholds not invented
>
> Prerequisites: Complete Lessons 1–5, have the harness loop from Course 7 (Agent Harness Fundamentals: Loops and Control) runnable on hand | Previous: [Lesson 5 <<](./05-hooks-and-debugging.md)

## The symptom: an extra region in summary.md that doesn't exist

Let's start with a concrete, smell-it-at-the-desk scenario.

You wrote a small agent to handle weekly reports: `data/` directory holds three quarterly sales CSVs, it reads them, aggregates by region, writes out `summary.md`. Three tools: `list_files`, `read_file`, `write_file`. Ran fine for weeks.

Monday morning, a colleague asks in chat: "Where did this 'Central China' region come from? We don't have a Central China region."

You open `summary.md`, and sure enough:

```text
# 2026 Q1 Regional Sales Summary

| Region | Total (¥) |
| --- | --- |
| East China | 548550 |
| Central China | 208000 |
| North China | 432600 |
| Grand Total | 1189150 |

Data source: CSV files in the data/ directory
```

You open `data/`, three files inside: `2026-q1-east.csv`, `2026-q1-south.csv`, `2026-q1-north.csv`, content has region names East China, South China, North China. Full-text search the entire directory for "Central China" — zero matches. South China vanished entirely, Central China appeared out of nowhere, and the number 208000 came from who-knows-where.

The question now is: **where did this step go wrong?**

Without an observability layer, you have two things: a wrongly-written `summary.md`, and the phrase "the model made it up." That phrase solves nothing — you don't know if it failed to read the file in the first place, or read it but calculated wrong, or read all three but mixed up rows when writing. And you can't "just reproduce it with a breakpoint" to force it out: agents are non-deterministic between runs, same prompts and same tools might take a completely different but equally valid path[^S1]. You re-run three times, all three might succeed, or the fourth might fail in a new way.

Worse, errors compound. One step failing can make the agent veer into a completely different trajectory, and the final result looks unrelated to the original small glitch[^S1]. So you can't just stare at the endpoint — the absurdity at the endpoint is often just **contagion** (Lesson 1 called this trajectory diversion, same thing), the actual lesion is upstream at some step.

This lesson's job is to turn "can't say" into "can be checked": solder an observability layer onto the harness, then walk through this real bug once to locate it. Everything from the previous five lessons lands in a single runnable file.

## The three-piece observability kit: what to record

When running agents in production, you need visibility into four things: which tools they called, how long each model request took, how many tokens were spent, where failures occurred[^S6]. The official approach is to export these as OpenTelemetry traces, metrics, and log events; this lesson doesn't pull in any OTel library, we hand-roll a minimal version, three pieces:

1. **Structured logs**: one JSON Lines entry per model request, one per tool call, written to `run.log.jsonl`.
2. **Trace tree**: after the run finishes, reconstruct parent-child relationships from that JSONL, print indented.
3. **Metrics summary**: one line outputting total rounds, tool call count, tokens, error count, total duration.

### Span model: who's whose parent

With enhanced telemetry enabled officially, each step of the agent loop becomes an inspectable span: one interaction is the root span, model requests and tool executions are its child spans[^S6]. Note that in the official tree, model requests and tool calls are **peer siblings** under the root — the tree you rebuilt in Lesson 4 has this shape. Our minimal version deliberately uses a different attachment: we hang tool calls under **the model request that triggered them**, so the tree's shape directly shows "what did the model want to do this round," parallel tools under the same parent visible at a glance. The parent-child mechanism is exactly the same, we just picked a different parent for tools — both attachments are valid, which one you pick depends on what question you want the tree to answer first. Our three layers look like this:

```text
agent_run                 ← One run, root record
├─ model_call turn-1      ← One messages.create
│  └─ tool_call ...       ← Tool call from this model request
├─ model_call turn-2
│  ├─ tool_call ...       ← Multiple tools requested in parallel in the same round are siblings
│  ├─ tool_call ...
│  └─ tool_call ...
└─ model_call turn-3
```

Parent-child relationships don't rely on an in-memory call stack, they rely on two fields in the logs: each record carries a `span_id`, plus a `parent_id` pointing to its parent. The tree is **reconstructed from the on-disk JSONL after the run finishes**, not printed as you go. This point matters: anything visible in the tree must first be recorded in the logs. If you find something missing from the tree, it's not a printing-code problem, it's a recording-code problem.

### Field table

The field design below is this lesson's engineering approach, not an official spec — officially it's OTel span attribute names, when you write your own harness the field names are up to you. Four names differ from Lessons 3 and 4, let's map them first so you don't think they're typos: Lesson 3's `type` is called `kind` here (back then only two record kinds, now we have `agent_run`, a semantically broader term fits better); `input_tokens`/`output_tokens` are folded into a `tokens:{input,output}` object (model-call-specific stuff packed together); `tool_response` is called `tool_result` here (hook payload calls it response, the return value here comes directly from tool implementation, following the API content block's naming); Lesson 4's `parent_span_id` shortened to `parent_id`. The cost is also stated: Lesson 3's `stats.mjs` needs two field name changes to read this log — this is a live demonstration of "vocabulary alignment matters more than pretty naming." The field **vocabulary** is still worth aligning with official materials, so when you eventually hook up a backend you don't have to swap concepts, just swap spelling:

| Field | Contains | Why you need it |
| --- | --- | --- |
| `ts` | ISO timestamp | Sorting, time alignment, the only thing that can align across processes |
| `trace_id` | One per run | Ties scattered lines back to the same run |
| `span_id` / `parent_id` | This record's / parent record's id | Rebuilds the tree, relies on it to recognize "who's under whom" |
| `kind` | `model_call` / `tool_call` / `agent_run` | First field you use when filtering |
| `name` | `turn-2` / `read_file` | First thing human eyes look at |
| `duration_ms` | Time spent on this step | Find performance bottlenecks, also used to see "is it stuck" |
| `tokens` | Model call's in / out | Token usage by itself is the strongest single explanatory variable in official data[^S1] |
| `tool_input` / `tool_result` | Shape + length + truncated snippet | Judge "are params correct" "is return empty" |
| `error` | Error message snippet, `null` if none | First field to filter when locating |

The `trace_id` trick is learned from official: one user prompt triggers several API calls and several tools, official uses a `prompt.id` attribute to tie them all back to the triggering prompt; official's tracing approach is also direct — to trace all activity triggered by a single prompt, filter events by a specific `prompt.id` value[^S4]. We use `trace_id` here, one run is one task, so use `trace_id`, does exactly the same thing. By the way there's no `session_id` here: this script's one run is one session, keeping this field would be meaningless; multi-round multi-session scenarios add it back, vocabulary reference in Lesson 3.

The metrics line isn't randomly picked either. Besides top-level accuracy, official recommends collecting: total runtime of individual tool calls and tasks, total number of tool calls, total token consumption, tool errors[^S3] — these four things have landing spots in the summary line and each record's `duration_ms`. `rounds` is the fifth number I added, handy to see at a glance how many loop iterations. You've already used the official set in Course 10 (Verification and Quality Assurance: Don't Let 'Looks Right' Slip Through) — there for grading, here for diagnosis with the same ruler.

### How much content to record: the only line this lesson asks you to draw yourself

`tool_input` and `tool_result` might be an entire CSV, entire user input, entire document written out. Recording everything is technically a one-liner, but by default you shouldn't.

Official telemetry's default stance is clear: **structural things always recorded, content never recorded** — every span has duration, model name, tool name, token count recorded when API returns usage, while agent-read and agent-written content defaults to not collected[^S6]. User prompts same, default only records length, recording content requires a separate environment variable[^S4]. And official pairs this kind of switch with a hard statement: unless your observability pipeline is approved to store the data your agent handles, leave these unset[^S6].

Our layer leaves a compromise: default records `shape` (is it string or object, how long, what keys), `chars` (character count), plus a snippet of the first 60 characters as a head summary. The snippet is so you can recognize "which file did it read this time" at a glance during your own debug, without re-running repeatedly. The `HEAD_CHARS = 60` in the code is where this line sits, set to `0` and not a single word of content hits disk. Where you draw this line in your own project depends on where the logs land, who can see them, whether data approval was passed — this is a compliance question, not a technical one.

## The verification setup: where the three versions' differences are nailed down

This lesson runs three times: one normal, one buggy, one fixed. The three outputs must be line-by-line comparable, so **model responses can't be real** — real model responses differ every time, you can't use them to teach locating. Following the old approach from Courses 8 through 10 of this series: **stub client with fixed response queue**. `client.messages.create()` doesn't send a network request, returns pre-written response objects from an array in sequence, each object carries complete `stop_reason`, `content`, `usage`. The harness loop doesn't change a single word — what it gets is shape-identical to what a real client returns.

All three versions' differences are nailed down in the code's `VERSIONS` table, each version has two things:

| Version | Response queue | `read_file` error message | Result |
| --- | --- | --- | --- |
| `v-good` | All three CSVs read correctly | Opaque version | `summary.md` correct |
| `v-bug` | Second filename typo'd as `sourth` | Opaque version | Fabricated a Central China region |
| `v-fixed` | Same `sourth` typo | Actionable advice version | Correct |

Aside from this table, **every other line of code is shared across all three versions**. The tools genuinely read/write disk: `list_files` genuinely `readdirSync`, `read_file` genuinely reads files, genuinely throws because file doesn't exist, `write_file` genuinely writes `summary.md` to disk. So that error in `v-bug` isn't a forged error object, it's the filesystem genuinely not finding that file.

To be clear: stubs solve "the model side is reproducible," not "the agent is deterministic." When actually running, the same prompt twice might choose different tools, take different paths[^S1]. This observability layer's value is exactly here — paths differ each time, but each time there's a record to review.

What needs stating clearly: stubs pin the model side so full re-runs work; real APIs return to resume-from-error. This lesson dares to do full re-runs exactly because the model side is stub-pinned — re-runs introduce no new variables, line-by-line comparison holds. When you hook up real APIs, stubs are gone, return to Lesson 5's approach: resume from error.

## Complete code: observed-agent.mjs

One entire file, zero dependencies, bare `node` runs. Save as `observed-agent.mjs`, then `node observed-agent.mjs --version v-bug` runs it.

```javascript
#!/usr/bin/env node
// observed-agent.mjs —— Wire an observability layer onto the harness (structured logs + trace tree + metrics summary)
// Usage: node observed-agent.mjs --version v-good|v-bug|v-fixed
// Zero dependencies, bare node runs. Model calls driven by stub client with fixed response queue, all three versions' differences in the VERSIONS table below.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 4096;
const MAX_ROUNDS = 12;      // Loop ceiling: exceeding means runaway, non-zero exit
const HEAD_CHARS = 60;      // Max chars per content snippet in logs; set to 0 to record zero words

// ============ 1. Task under test: read several sales CSVs from data/, aggregate by region, write summary.md ============

const CSV_FILES = {
  "2026-q1-east.csv":
    "region,month,amount\nEast China,2026-01,182400\nEast China,2026-02,161250\nEast China,2026-03,204900\n",
  "2026-q1-south.csv":
    "region,month,amount\nSouth China,2026-01,97300\nSouth China,2026-02,88600\nSouth China,2026-03,120450\n",
  "2026-q1-north.csv":
    "region,month,amount\nNorth China,2026-01,143000\nNorth China,2026-02,150700\nNorth China,2026-03,138900\n",
};

function setupWorkspace(root) {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  for (const [name, body] of Object.entries(CSV_FILES)) {
    fs.writeFileSync(path.join(root, "data", name), body);
  }
}

// ============ 2. Three tools (genuinely read/write disk, errors are genuine errors) ============

const tools = [
  {
    name: "list_files",
    description: "List filenames in a directory, return sorted dictionary order, one per line.",
    input_schema: {
      type: "object",
      properties: { dir: { type: "string", description: "Path relative to working directory, e.g. data" } },
      required: ["dir"],
    },
  },
  {
    name: "read_file",
    description: "Read a text file by path, return full text. Path must use original filename as returned by list_files.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "File path relative to working directory" } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write text to specified path, overwrites same-named file.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to working directory" },
        content: { type: "string", description: "Complete text to write" },
      },
      required: ["path", "content"],
    },
  },
];

function resolveInRoot(root, p) {
  const abs = path.resolve(root, p);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`Path escapes boundary, refusing access: ${p}`);
  }
  return abs;
}

const impls = {
  list_files({ dir }, ctx) {
    const abs = resolveInRoot(ctx.root, dir);
    return fs.readdirSync(abs).sort().join("\n");
  },
  read_file({ path: p }, ctx) {
    const abs = resolveInRoot(ctx.root, p);
    if (fs.existsSync(abs)) return fs.readFileSync(abs, "utf8");
    // Same "file not found," two message sets. v-fixed uses the actionable-advice set.
    if (ctx.errorStyle === "actionable") {
      const available = fs
        .readdirSync(path.join(ctx.root, "data"))
        .sort()
        .map((f) => `data/${f}`)
        .join(", ");
      throw new Error(
        `File ${p} not found. Currently in data/: ${available}. ` +
          `Retry with original filename as returned by list_files; if the data you need truly isn't there, ` +
          `stop and tell the user which file is missing, don't estimate missing numbers yourself.`
      );
    }
    throw new Error(`ENOENT: no such file or directory, open '${p}'`);
  },
  write_file({ path: p, content }, ctx) {
    const abs = resolveInRoot(ctx.root, p);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    return `Wrote ${p} (${content.length} chars)`;
  },
};

// ============ 3. Stub client: fixed response queue ============

const SUMMARY_CORRECT = `# 2026 Q1 Regional Sales Summary

| Region | Total (¥) |
| --- | --- |
| East China | 548550 |
| South China | 306350 |
| North China | 432600 |
| Grand Total | 1287500 |

Data source: data/2026-q1-east.csv, data/2026-q1-south.csv, data/2026-q1-north.csv
`;

const SUMMARY_FABRICATED = `# 2026 Q1 Regional Sales Summary

| Region | Total (¥) |
| --- | --- |
| East China | 548550 |
| Central China | 208000 |
| North China | 432600 |
| Grand Total | 1189150 |

Data source: CSV files in the data/ directory
`;

const say = (text) => ({ type: "text", text });
const call = (id, name, input) => ({ type: "tool_use", id, name, input });
const turn = (stop_reason, content, input_tokens, output_tokens) => ({
  id: `msg_stub_${crypto.randomBytes(3).toString("hex")}`,
  model: MODEL,
  stop_reason,
  content,
  usage: { input_tokens, output_tokens },
});

const READ_EAST = call("toolu_e", "read_file", { path: "data/2026-q1-east.csv" });
const READ_NORTH = call("toolu_n", "read_file", { path: "data/2026-q1-north.csv" });
const READ_SOUTH = call("toolu_s", "read_file", { path: "data/2026-q1-south.csv" });
const READ_TYPO = call("toolu_x", "read_file", { path: "data/2026-q1-sourth.csv" });

const VERSIONS = {
  // Smooth sailing: all three CSVs read, aggregate correct.
  "v-good": {
    errorStyle: "opaque",
    queue: [
      turn("tool_use", [say("First see what files are in data/."), call("toolu_l", "list_files", { dir: "data" })], 812, 96),
      turn("tool_use", [say("Three regional CSVs, read them together."), READ_EAST, READ_SOUTH, READ_NORTH], 946, 218),
      turn("tool_use", [say("Got all three regions, write aggregate."), call("toolu_w", "write_file", { path: "summary.md", content: SUMMARY_CORRECT })], 1584, 342),
      turn("end_turn", [say("Wrote summary.md: East China 548550, South China 306350, North China 432600, total 1287500.")], 1961, 74),
    ],
  },
  // Bug version: second CSV filename typo'd, tool returns opaque error, model doesn't stop, fabricates a region and continues writing.
  "v-bug": {
    errorStyle: "opaque",
    queue: [
      turn("tool_use", [say("First see what files are in data/."), call("toolu_l", "list_files", { dir: "data" })], 812, 96),
      turn("tool_use", [say("Three regional CSVs, read them together."), READ_EAST, READ_TYPO, READ_NORTH], 946, 218),
      turn("tool_use", [say("Data's complete, write aggregate."), call("toolu_w", "write_file", { path: "summary.md", content: SUMMARY_FABRICATED })], 1602, 355),
      turn("end_turn", [say("Wrote summary.md: East China 548550, Central China 208000, North China 432600, total 1189150.")], 1990, 81),
    ],
  },
  // Fixed version: same typo, but error message swapped to actionable-advice version, model changes to retry instead of fabricate.
  "v-fixed": {
    errorStyle: "actionable",
    queue: [
      turn("tool_use", [say("First see what files are in data/."), call("toolu_l", "list_files", { dir: "data" })], 812, 96),
      turn("tool_use", [say("Three regional CSVs, read them together."), READ_EAST, READ_TYPO, READ_NORTH], 946, 218),
      turn("tool_use", [say("I typo'd filename as sourth, re-read with original filename from error message."), READ_SOUTH], 1688, 64),
      turn("tool_use", [say("Got all three regions, write aggregate."), call("toolu_w", "write_file", { path: "summary.md", content: SUMMARY_CORRECT })], 1849, 342),
      turn("end_turn", [say("Wrote summary.md: East China 548550, South China 306350, North China 432600, total 1287500. Side note: I initially typo'd filename as data/2026-q1-sourth.csv, retried with original name from list_files. If there are other regions' data outside data/, tell me where the file is, I won't fill in numbers myself.")], 2226, 118),
    ],
  },
};

function makeStubClient(queue) {
  let i = 0;
  return {
    messages: {
      async create(req) {
        if (!req.model || !req.max_tokens) {
          throw new Error("Stub client: create must carry model and max_tokens");
        }
        if (i >= queue.length) {
          const err = new Error(`Stub queue exhausted: request ${i + 1} has no preset response`);
          err.code = "STUB_QUEUE_EXHAUSTED";
          throw err;
        }
        return queue[i++];
      },
    },
  };
}

// ============ 4. Observability layer part one: structured logs (JSON Lines) ============

const newId = (prefix) => `${prefix}-${crypto.randomBytes(4).toString("hex")}`;

function shapeOf(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === "string") return `string(${value.length})`;
  if (typeof value === "object") return `object{${Object.keys(value).join(",")}}`;
  return typeof value;
}

// Default only records shape + length + first HEAD_CHARS chars snippet, not full text.
function summarize(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  const out = { shape: shapeOf(value), chars: text.length };
  if (HEAD_CHARS > 0) {
    const flat = text.replace(/\s+/g, " ").trim();
    out.head = flat.length > HEAD_CHARS ? `${flat.slice(0, HEAD_CHARS)}…` : flat;
  }
  return out;
}

function createLogger(logPath, traceId) {
  fs.writeFileSync(logPath, "");
  return {
    record(fields) {
      const line = { ts: new Date().toISOString(), trace_id: traceId, ...fields };
      fs.appendFileSync(logPath, `${JSON.stringify(line)}\n`);
    },
  };
}

// ============ 5. Observability layer part two: rebuild trace tree from JSONL ============

function buildTree(records) {
  const byId = new Map(records.map((r) => [r.span_id, { ...r, children: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

function labelOf(n) {
  const name = n.name.padEnd(13);
  const dur = `${String(n.duration_ms).padStart(3)}ms`;
  if (n.kind === "agent_run") return `agent_run  ${name}${dur}  trace_id=${n.trace_id}`;
  if (n.kind === "model_call") {
    const t = n.tokens;
    return `model_call ${name}${dur}  in=${t.input} out=${t.output}  stop=${n.stop_reason}`;
  }
  if (n.kind === "harness_error") return `harness_err ${name}${dur}  ${n.error.head ?? n.error.shape}`;
  const inHead = clip(n.tool_input.head ?? n.tool_input.shape, 34);
  const out = n.error ? `ERROR ${clip(n.error.head ?? n.error.shape, 44)}` : `ok ${n.tool_result.shape}`;
  return `tool_call  ${name}${dur}  in=${inHead}  ${out}`;
}

function renderTree(nodes, prefix, lines) {
  nodes.forEach((node, idx) => {
    const last = idx === nodes.length - 1;
    lines.push(prefix === null ? labelOf(node) : `${prefix}${last ? "└─ " : "├─ "}${labelOf(node)}`);
    const childPrefix = prefix === null ? "" : `${prefix}${last ? "   " : "│  "}`;
    renderTree(node.children, childPrefix, lines);
  });
  return lines;
}

// ============ 6. Observability layer part three: metrics summary ============

function metricsOf(records) {
  const model = records.filter((r) => r.kind === "model_call");
  const tool = records.filter((r) => r.kind === "tool_call");
  const root = records.find((r) => r.kind === "agent_run");
  return {
    // In this harness one round equals one model request, so rounds directly takes model_calls;
    // when stub queue exhausts and throws harness_error, the last round has no corresponding model_call — in that run these two numbers differ by 1
    rounds: model.length,
    model_calls: model.length,
    tool_calls: tool.length,
    errors: records.filter((r) => r.error).length,
    tokens_in: model.reduce((s, r) => s + r.tokens.input, 0),
    tokens_out: model.reduce((s, r) => s + r.tokens.output, 0),
    wall_ms: root ? root.duration_ms : 0,
  };
}

// ============ 7. The observed harness loop ============

async function runToolUses(content, ctx) {
  const results = [];
  for (const block of content) {
    if (block.type !== "tool_use") continue;
    const spanId = newId("span");
    const startedAt = Date.now();
    const base = {
      span_id: spanId,
      parent_id: ctx.parentId,
      kind: "tool_call",
      name: block.name,
      tool_input: summarize(block.input),
    };
    try {
      const impl = impls[block.name];
      if (!impl) throw new Error(`Unknown tool: ${block.name}`);
      const result = impl(block.input, ctx);
      ctx.log.record({ ...base, duration_ms: Date.now() - startedAt, tool_result: summarize(result), error: null });
      results.push({ type: "tool_result", tool_use_id: block.id, content: result });
    } catch (e) {
      ctx.log.record({ ...base, duration_ms: Date.now() - startedAt, tool_result: null, error: summarize(e.message) });
      results.push({ type: "tool_result", tool_use_id: block.id, content: e.message, is_error: true });
    }
  }
  return results;
}

async function main() {
  const argv = process.argv.slice(2);
  const version = argv[argv.indexOf("--version") + 1];
  if (!argv.includes("--version") || !VERSIONS[version]) {
    console.error("Usage: node observed-agent.mjs --version v-good|v-bug|v-fixed");
    process.exit(2);
  }

  const root = path.resolve(process.cwd(), "runs", version);
  setupWorkspace(root);

  const traceId = newId("tr");
  const log = createLogger(path.join(root, "run.log.jsonl"), traceId);
  const rootSpan = newId("span");
  const runStartedAt = Date.now();

  const { queue, errorStyle } = VERSIONS[version];
  const client = makeStubClient(queue);
  const ctx = { root, errorStyle, log, parentId: rootSpan };
  const messages = [
    {
      role: "user",
      content: "Aggregate the sales CSVs in data/ directory into regional totals, write to summary.md. Only use data that genuinely exists in the files.",
    },
  ];

  let rounds = 0;
  let exitCode = 0;
  const callModel = async () => {
    const spanId = newId("span");
    const startedAt = Date.now();
    rounds += 1;
    const response = await client.messages.create({ model: MODEL, max_tokens: MAX_TOKENS, tools, messages });
    log.record({
      span_id: spanId,
      parent_id: rootSpan,
      kind: "model_call",
      name: `turn-${rounds}`,
      duration_ms: Date.now() - startedAt,
      stop_reason: response.stop_reason,
      tokens: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      error: null,
    });
    ctx.parentId = spanId;
    return response;
  };

  try {
    let response = await callModel();
    while (response.stop_reason === "tool_use") {
      if (rounds >= MAX_ROUNDS) throw new Error(`Exceeded MAX_ROUNDS=${MAX_ROUNDS}, judged as runaway`);
      messages.push({ role: "assistant", content: response.content });
      const toolResults = await runToolUses(response.content, ctx);
      messages.push({ role: "user", content: toolResults });
      response = await callModel();
    }
  } catch (e) {
    log.record({
      span_id: newId("span"),
      parent_id: rootSpan,
      kind: "harness_error",
      name: e.code ?? "harness_error",
      duration_ms: 0,
      error: summarize(e.message),
    });
    console.error(`Harness interrupted: ${e.message}`);
    exitCode = 2;
  }

  log.record({
    span_id: rootSpan,
    parent_id: null,
    kind: "agent_run",
    name: "sales-summary",
    duration_ms: Date.now() - runStartedAt,
    error: null,
  });

  // After run finishes, rebuild views only from on-disk JSONL — the in-memory copy doesn't count.
  const records = fs
    .readFileSync(path.join(root, "run.log.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  const m = metricsOf(records);
  console.log(`\n=== Trace tree (${version}, rebuilt from run.log.jsonl) ===`);
  console.log(renderTree(buildTree(records), null, []).join("\n"));
  console.log(
    `\n=== Metrics summary (${version}) ===\n` +
      `rounds=${m.rounds} model_calls=${m.model_calls} tool_calls=${m.tool_calls} ` +
      `errors=${m.errors} tokens_in=${m.tokens_in} tokens_out=${m.tokens_out} ` +
      `tokens_total=${m.tokens_in + m.tokens_out} wall=${m.wall_ms}ms`
  );
  console.log(`Log: runs/${version}/run.log.jsonl　Artifact: runs/${version}/summary.md`);
  process.exit(exitCode);
}

main();
```

A few points worth calling out separately:

- **The loop itself hasn't changed.** That `while (response.stop_reason === "tool_use")` from Course 7 (Agent Harness Fundamentals: Loops and Control) didn't move a single word, observability wraps around the outside: `callModel()` records a timestamp before and after the request, `runToolUses()` wrapped a try/catch plus timer around each tool block. Strip off those two wrappers, what's left is the original loop.
- **`MAX_ROUNDS` is a hard gate.** Agents need stopping conditions, such as maximum iteration count, this is part of control[^S2]. Exceeding it throws an error, records a `harness_error`, exit code 2.
- **Exit code division of labor.** This script only handles running and recording, run finishes means 0; wrong params or runaway means non-zero. "Is the output correct" is the job of the verifier suite from Course 10 (Verification and Quality Assurance: Don't Let 'Looks Right' Slip Through) — note `v-bug` also exits 0, the harness thinks it finished smoothly. Verification tells you if it broke, this layer tells you why.
- **Tool errors don't break the loop.** Errors get wrapped into an `is_error: true` `tool_result` and stuffed back to the model, loop continues. This is correct — agents need to gain ground truth from the environment at each step to assess progress[^S2], errors are feedback too. This lesson's entire bug happens in the second half of that sentence: feedback was given, but given too poorly.

## First run smooth sailing: v-good

See what normal looks like first. The terminal output below and all subsequent terminal outputs **are genuinely run, not hand-written examples**.

```text
$ node observed-agent.mjs --version v-good

=== Trace tree (v-good, rebuilt from run.log.jsonl) ===
agent_run  sales-summary 16ms  trace_id=tr-0f4f0551
├─ model_call turn-1         0ms  in=812 out=96  stop=tool_use
│  └─ tool_call  list_files     4ms  in={"dir":"data"}  ok string(52)
├─ model_call turn-2         0ms  in=946 out=218  stop=tool_use
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-east.csv"}  ok string(74)
│  ├─ tool_call  read_file      1ms  in={"path":"data/2026-q1-south.csv"}  ok string(72)
│  └─ tool_call  read_file      0ms  in={"path":"data/2026-q1-north.csv"}  ok string(74)
├─ model_call turn-3         0ms  in=1584 out=342  stop=tool_use
│  └─ tool_call  write_file     1ms  in={"path":"summary.md","content":"# …  ok string(22)
└─ model_call turn-4         0ms  in=1961 out=74  stop=end_turn

=== Metrics summary (v-good) ===
rounds=4 model_calls=4 tool_calls=5 errors=0 tokens_in=5303 tokens_out=730 tokens_total=6033 wall=16ms
Log: runs/v-good/run.log.jsonl　Artifact: runs/v-good/summary.md
```

Your `trace_id`, `span_id`, `ts` and millisecond counts will differ from mine — ids are randomly generated each run, milliseconds are genuine duration. Besides those, every line should match word-for-word.

Reading this tree down is one complete sentence: first list directory (`turn-1`), then **in one round parallel-read three files** (`turn-2` with three sibling nodes below), then write file (`turn-3`), finally wrap up (`turn-4`, `stop=end_turn`). Those three parallel lines are three `tool_use` blocks in the same model response, so their `parent_id` points to the same `model_call` — the tree's shape directly shows "what did the model want to do this round."

Don't take that `0ms` column in `model_call` seriously: stub client has no network round-trip, so model request duration is all 0. After hooking up real APIs this column gains diagnostic value — tracking API request durations and tool execution times is exactly for finding performance bottlenecks[^S4].

The log file looks like this, one complete JSON per line, can `grep` directly:

```text
$ head -3 runs/v-good/run.log.jsonl
{"ts":"2026-08-26T09:01:32.516Z","trace_id":"tr-0f4f0551","span_id":"span-c72deaec","parent_id":"span-69103346","kind":"model_call","name":"turn-1","duration_ms":0,"stop_reason":"tool_use","tokens":{"input":812,"output":96},"error":null}
{"ts":"2026-08-26T09:01:32.528Z","trace_id":"tr-0f4f0551","span_id":"span-8fb2e82a","parent_id":"span-c72deaec","kind":"tool_call","name":"list_files","tool_input":{"shape":"object{dir}","chars":14,"head":"{\"dir\":\"data\"}"},"duration_ms":4,"tool_result":{"shape":"string(52)","chars":52,"head":"2026-q1-east.csv 2026-q1-north.csv 2026-q1-south.csv"},"error":null}
{"ts":"2026-08-26T09:01:32.528Z","trace_id":"tr-0f4f0551","span_id":"span-833bd890","parent_id":"span-69103346","kind":"model_call","name":"turn-2","duration_ms":0,"stop_reason":"tool_use","tokens":{"input":946,"output":218},"error":null}
```

Line two is that `list_files`: `parent_id` points to line one's `span_id` (so it hangs under `turn-1`), inside `tool_input` only has shape, length, and a small snippet, `tool_result` same — `shape` is `string(52)`, `head` has the three filenames. Not a single byte in this line is "file contents," but you can already answer "what did this step call, what shape of thing did it get, did it error."

Look again at the metrics summary line: 4 rounds, 5 tool calls, 0 errors, 6033 tokens, line end also has total duration. This line of numbers is worth a glance every time a run finishes — tool call count can expose fixed routines the agent repeatedly walks, a pile of redundant calls often suggests pagination or token limit params should be tuned; while a pile of invalid-parameter errors might say tool descriptions should be written clearer, examples should be given more fully[^S3]. Tokens especially worth watching: when analyzing eval performance, official found that token usage by itself explains 80% of the variance, the other two explanatory factors are tool call count and model choice[^S1].

```agentmentor-check
{
  "id": "obs-zh-06-log-everything",
  "label": "How much of tool input/output should be recorded",
  "prompt": "You just wired this observability layer into your project. A colleague looks at the log, says the tool_input and tool_result with only the first 60 chars snippet is too stingy, suggests changing it to record complete input/output full text for every tool call: 'Disk's cheap anyway, record everything can't hurt, when something really breaks everything's there.' How do you respond?",
  "whyHere": "The reader just saw real run.log.jsonl, where the head field is indeed truncated — this is the only design decision in this lesson's observability layer where you draw the line yourself, and it's also the easiest place to be misled by the 'record everything can't hurt' intuition, a good spot to check if they understand the default stance and the preconditions for enabling full text",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Agree, disk really is cheap, recording full text is most reliable, when something breaks you don't need to re-run to restore the scene",
      "correct": false,
      "feedback": "'Record everything can't hurt' only holds on the disk dimension. What's sitting in the logs is business content the agent read and wrote — user input, file contents, written-out documents, once these land in a place that was only approved as 'operational logs,' they become an unmanaged copy of sensitive data. And files bloat fast: one run dozens of records, each stuffing a few KB of full text, after running thousands of times even one grep takes forever, actually harder to search. When you genuinely need full text, the correct approach is to read the session transcript itself, not hoard a copy in telemetry logs."
    },
    {
      "id": "b",
      "text": "Default still records structure and snippet — shape, length, first few dozen chars, this is enough to locate 'which step, which param, is the return empty'; to record full text first confirm the log landing spot is approved to store this type of data, when spot-checking needs full text go read the session transcript",
      "correct": true,
      "feedback": "Right. Official telemetry's default stance is exactly this: structural things like duration, model name, tool name recorded on every span, token count recorded when API returns usage, while agent-read and agent-written content defaults to not collected; user prompts same, default only records length, recording content requires a separate switch to be flipped. And official's statement for this kind of switch is 'unless your observability pipeline is approved to store the data your agent handles, leave these unset' — this is a compliance constraint, not a performance suggestion. What genuinely relies on for locating is structure: which step, what params, what shape return, did it error. Full text is something only needed during spot-checks, go read the transcript for that."
    },
    {
      "id": "c",
      "text": "Flip it around, don't record a single word of content, only count how many times each tool was called is enough, rest rely on re-run to reproduce",
      "correct": false,
      "feedback": "Overcorrecting, and 'rely on re-run to reproduce' is a road that doesn't work for agents — same prompt two runs will take different but equally valid paths, you re-run ten times might get ten correct results. With only call-count stats, you can't even answer 'what path did that errored read_file pass,' this lesson's entire locating process breaks at step one. The real dividing line isn't 'record or not,' it's 'record structure or record content': shape, length, param names, error messages belong to structure, can locate; file contents and user's original words belong to content, default don't write to disk."
    }
  ]
}
```

## Reproduce the symptom: v-bug

Now run the buggy one. The stub queue has the real divergence from the lesson's opening buried in it, don't peek first, find it yourself from the output.

```text
$ node observed-agent.mjs --version v-bug

=== Trace tree (v-bug, rebuilt from run.log.jsonl) ===
agent_run  sales-summary 16ms  trace_id=tr-b8934bdd
├─ model_call turn-1         0ms  in=812 out=96  stop=tool_use
│  └─ tool_call  list_files     1ms  in={"dir":"data"}  ok string(52)
├─ model_call turn-2         0ms  in=946 out=218  stop=tool_use
│  ├─ tool_call  read_file      1ms  in={"path":"data/2026-q1-east.csv"}  ok string(74)
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-sourth.csv"}  ERROR ENOENT: no such file or directory, open 'dat…
│  └─ tool_call  read_file      1ms  in={"path":"data/2026-q1-north.csv"}  ok string(74)
├─ model_call turn-3         0ms  in=1602 out=355  stop=tool_use
│  └─ tool_call  write_file     1ms  in={"path":"summary.md","content":"# …  ok string(22)
└─ model_call turn-4         0ms  in=1990 out=81  stop=end_turn

=== Metrics summary (v-bug) ===
rounds=4 model_calls=4 tool_calls=5 errors=1 tokens_in=5350 tokens_out=750 tokens_total=6100 wall=16ms
Log: runs/v-bug/run.log.jsonl　Artifact: runs/v-bug/summary.md
```

The artifact is indeed wrong:

```text
$ cat runs/v-bug/summary.md
# 2026 Q1 Regional Sales Summary

| Region | Total (¥) |
| --- | --- |
| East China | 548550 |
| Central China | 208000 |
| North China | 432600 |
| Grand Total | 1189150 |

Data source: CSV files in the data/ directory
```

First notice a few things invisible from the outside:

- Round count, tool call count identical to `v-good`: 4 rounds, 5 calls. Just looking at these two numbers, the two runs look identical.
- Tokens only up 67 (6100 vs 6033). If your alert is "tokens exceed threshold," this one wouldn't even ring.
- Only `errors=1`, this one number changed. This is why tool errors must be a first-class citizen in metrics[^S3] — it's the only signal at the summary level that this run looks wrong.
- That last `model_call` is `stop=end_turn`, the agent thinks it **successfully completed the task**. It didn't error, didn't ask for help, didn't mention missing a piece of data. What it omits in feedback can often be more important than what it includes[^S3].

## Five-step locating: from symptom tracing to first divergence point

Lesson 5's five-step locating is general orchestration; this round's materials are special — three line-by-line comparable logs in hand — so three of the five steps changed form, written out side-by-side:

| Lesson 5's general steps | This round's form | Why it changes |
| --- | --- | --- |
| 1 Narrow down | Pin down this one run | Same, filter by id |
| 2 Find first divergence point | Identify in tree | Same, just evidence became tree |
| 3 Replay observation | Recognize downstream as contagion | Stubs themselves are pinned replay, this step's slot given to contagion analysis |
| 4 Repeatedly hammer same component | Determine cause | Three logs can compare line-by-line, don't need repeated hammering to force out probabilistic glitches |
| 5 After fix resume from error | Re-run comparison | See below — both don't conflict, applicable conditions differ |

Step five needs separate explanation. Lesson 5 advocates "after fix resume from error, don't re-run from scratch," reason being full re-runs reintroduce non-determinism, you can't tell "fixed correctly" from "got lucky this time." This lesson dares to do full re-runs exactly because the model side is stub-pinned — re-runs introduce no new variables, line-by-line comparison holds. When you hook up real APIs, stubs are gone, return to Lesson 5's approach: resume from error.

Landing on this round's materials is five steps below. Pretend you don't know the answer yet, walk through once.

### Step one: pin down this one run

Production environment all runs' logs mix into one stream. First simulate this situation, merge three runs' logs:

```text
$ cat runs/v-good/run.log.jsonl runs/v-bug/run.log.jsonl runs/v-fixed/run.log.jsonl > all-runs.log.jsonl
$ wc -l < all-runs.log.jsonl
      32
$ grep -c 'tr-b8934bdd' all-runs.log.jsonl
10
```

Of 32 lines, only 10 belong to the buggy run. This step uses official's given tracing approach: to trace all activity triggered by one prompt, filter events by that specific id[^S4]. Whether it's called `prompt.id` or `trace_id` doesn't matter, what matters is this id exists, and every record carries it.

While we're here can check how many errors are in the entire stream:

```text
$ grep -c '"error":{"shape"' all-runs.log.jsonl
2
```

Two: `v-bug` one, `v-fixed` one. `v-good` squeaky clean.

### Step two: identify first divergence point in tree

Tree's already printed, scan top to bottom, find **first record that doesn't match expectation**:

```text
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-sourth.csv"}  ERROR ENOENT: no such file or directory, open 'dat…
```

Under `turn-2` three parallel reads, middle one broke. The reason it broke is written in `tool_input`: path is `data/2026-q1-sourth.csv` — `south` typo'd as `sourth`. That `list_files` line in the tree only shows `ok string(52)`, correct filenames need to dig back into logs: pull out that record (you already saw it in the `head -3` above), `tool_result.head` says `2026-q1-east.csv 2026-q1-north.csv 2026-q1-south.csv` — the model did receive the correct name. Tree handles locating, logs handle details, two layers cooperate exactly like this.

To see that complete record, fish it out of the stream:

```text
$ node -e '
const fs = require("node:fs");
const TRACE = "tr-b8934bdd";
for (const line of fs.readFileSync("all-runs.log.jsonl", "utf8").split("\n").filter(Boolean)) {
  const r = JSON.parse(line);
  if (r.trace_id === TRACE && r.error) console.log(r.kind, r.name, r.tool_input.head, "->", r.error.head);
}'
tool_call read_file {"path":"data/2026-q1-sourth.csv"} -> ENOENT: no such file or directory, open 'data/2026-q1-sourth…
```

This is the divergence point. Note **how it was recognized**: not by guessing, by three fields — `trace_id` locks scope to this one run, `error` being non-null picks it out from ten records, `tool_input.head` tells you where params went wrong. Three fields, not one dispensable.

### Step three: recognize downstream absurdities as contagion, don't fix separately

After the divergence point, `turn-3` has the model write an aggregate with a Central China region, `turn-4` reports "task complete." Both steps look quite absurd, but they're both downstream:

| Record | Behavior | Cause or contagion |
| --- | --- | --- |
| `turn-2`'s `read_file` error | Param typo'd, tool returns one line of ENOENT | **Cause** |
| `turn-3`'s `write_file` | Wrote in a non-existent Central China region | Contagion |
| `turn-4`'s `end_turn` | Claims successful completion | Contagion |

In agent systems, one step failing is enough to make it veer into a completely different trajectory, final result unpredictable[^S1] — this is the cleanest example. If you only got the final `summary.md`, where would you go fix? Probably go change the prompt: "don't fabricate data" "must note data sources." All these changes hit contagion, don't hit the lesion. Next time swap the typo method, it'll still fabricate.

By the way why this symptom grew into "Central China" instead of "South China missing": it did receive the filename (`2026-q1-south.csv` is right there in `list_files`'s return), the east-to-East China, north-to-North China correspondence is already in the first two successful read contents — what it lacks is just those three months' specific numbers. But that opaque ENOENT error told it neither "retry with correct filename" nor "stop and explain clearly," so it picked the easiest road: disguise the gap as complete, fill in both region name and numbers. Fabrication isn't because it knows nothing, it's because the error gave it no better exit.

### Step four: determine cause — the feedback it got was terrible

At this step don't rush to blame the model. Look what that error actually gave it:

```text
ENOENT: no such file or directory, open 'data/2026-q1-sourth.csv'
```

This line has enough information for a human engineer, for an agent deciding "what to do next" it's nearly empty. It can't read out "which files in this directory are readable," can't read out "did I typo or does this data genuinely not exist," even less can it read out "when encountering this situation I should stop and ask, not fill in myself." Agents need to rely on ground truth feedback from the environment at each step to judge progress[^S2], this ENOENT is all the feedback it got.

Official's suggestion on tool engineering is exactly for this gap: when tool calls raise errors, the error responses themselves should be well-written, explaining specific, actionable improvements clearly, instead of throwing an opaque error code or stack trace[^S3]. So what needs changing this time isn't the prompt, it's `read_file`'s error message.

### Step five: re-run comparison (stubs pinned the model side, can do full re-run here)

Fix method in next section, after running come back to see if the numbers changed. Locating doesn't end at "I know the cause," it ends at "after fixing, that step on the same trace really is different."

## Fix and re-run: v-fixed

What's changed is the code's `read_file` section, only the error message:

```javascript
if (ctx.errorStyle === "actionable") {
  const available = fs
    .readdirSync(path.join(ctx.root, "data"))
    .sort()
    .map((f) => `data/${f}`)
    .join(", ");
  throw new Error(
    `File ${p} not found. Currently in data/: ${available}. ` +
      `Retry with original filename as returned by list_files; if the data you need truly isn't there, ` +
      `stop and tell the user which file is missing, don't estimate missing numbers yourself.`
  );
}
```

This message stuffs in three things: **current state** (what's actually in the directory), **what to do next** (retry with original filename), **when to stop** (if data genuinely isn't there ask a person, don't estimate). First two give the model a road to walk, the third blocks the fabrication road.

The `v-fixed` response queue demonstrates the model's reaction after receiving this error: no longer fabricating downward, but turning back to seek verification from environment — re-read once with the original filename listed in the error, finally in the wrap-up sentence also asks the user back "if there's other regions' data outside data/, tell me where the file is, I won't fill in numbers myself."

```text
$ node observed-agent.mjs --version v-fixed

=== Trace tree (v-fixed, rebuilt from run.log.jsonl) ===
agent_run  sales-summary  7ms  trace_id=tr-80892fc3
├─ model_call turn-1         0ms  in=812 out=96  stop=tool_use
│  └─ tool_call  list_files     1ms  in={"dir":"data"}  ok string(52)
├─ model_call turn-2         0ms  in=946 out=218  stop=tool_use
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-east.csv"}  ok string(74)
│  ├─ tool_call  read_file      1ms  in={"path":"data/2026-q1-sourth.csv"}  ERROR File data/2026-q1-sourth.csv not found. Curre…
│  └─ tool_call  read_file      0ms  in={"path":"data/2026-q1-north.csv"}  ok string(74)
├─ model_call turn-3         0ms  in=1688 out=64  stop=tool_use
│  └─ tool_call  read_file      1ms  in={"path":"data/2026-q1-south.csv"}  ok string(72)
├─ model_call turn-4         0ms  in=1849 out=342  stop=tool_use
│  └─ tool_call  write_file     0ms  in={"path":"summary.md","content":"# …  ok string(22)
└─ model_call turn-5         0ms  in=2226 out=118  stop=end_turn

=== Metrics summary (v-fixed) ===
rounds=5 model_calls=5 tool_calls=6 errors=1 tokens_in=7521 tokens_out=838 tokens_total=8359 wall=7ms
Log: runs/v-fixed/run.log.jsonl　Artifact: runs/v-fixed/summary.md
```

Tree's shape changed: that ERROR in `turn-2` still sits in its original spot, but below it grew a `turn-3`, inside is one re-read with the correct filename. Artifact's correct:

```text
$ diff runs/v-good/summary.md runs/v-fixed/summary.md
$ echo $?
0
```

Two `summary.md` byte-identical, Central China region gone.

Three runs side-by-side:

| | `v-good` | `v-bug` | `v-fixed` |
| --- | --- | --- | --- |
| rounds | 4 | 4 | 5 |
| tool_calls | 5 | 5 | 6 |
| errors | 0 | 1 | 1 |
| tokens_total | 6033 | 6100 | 8359 |
| `summary.md` | Correct | Has Central China region | Correct |

Two things must be stated clearly, or this fix is easy to misunderstand:

**First, `errors` didn't return to zero, nor should it.** That typo'd read still errored, we just swapped the error message, let the model climb out of the error. The fix that genuinely returns `errors` to zero is in another direction — write tool descriptions more explicitly, give examples, so the model doesn't typo in the first place. Official's diagnostic reading corresponds exactly like this: large amounts of invalid-parameter errors say tool descriptions should be clearer, examples should be fuller[^S3]. The `read_file` description in this script already says "Path must use original filename as returned by list_files," clearly still not enough, next round should give it a positive example.

**Second, the fix isn't free.** Tokens went from 6033 to 8359, up 2326, a 38% increase, the extra came from that round of re-read's round-trip. Not a blowout, but not zero cost either. Fix's cost must be put on the table and calculated, can't just look at "result's correct" and call it done.

## Where this observability layer's boundaries are

This thing is small, boundaries need stating clearly, lest you think wiring it up means you have production observability.

**It covers one process, one run.** Logs are `appendFileSync` writing local file directly, process gets killed also doesn't lose — this is deliberate. Hook up real backend and it's not this treatment: on the OTLP road, export failure defaults to silent, endpoint unreachable or rejects, agent still runs, telemetry directly dropped, not even an error shows in your application; and telemetry batches before exporting on an interval, process gets killed before export, whatever's in the batch buffer is gone[^S6]. Lesson 4's "observability pipeline will silently lie to you" talks about this segment. Local file sidesteps this pit, cost is it's only on local machine.

**Hooking up real backends and multi-process aggregation not in this lesson.** To connect this layer to Honeycomb, Datadog, Grafana, Langfuse, or self-hosted collector, takes the OTLP protocol suite[^S6], fields need re-mapping, that's another topic. How multiple agent process logs aggregate together, how to distinguish by service name, same deal.

**Alert thresholds this lesson doesn't give numbers.** "Tool error rate exceeding what should alert" "one run exceeding how many tokens counts as anomaly" — official docs only mentioned alerts should be done by your backend, didn't give any numbers[^S4]. I won't invent either. Your own thresholds can only grow from your own baseline: first run a while, see what normal run distribution looks like, then draw the line.

**Content recording defaults to off.** That `HEAD_CHARS = 60` above only left a very short snippet. To genuinely turn on full text, prerequisite is your observability pipeline is approved to store the data your agent handles[^S6] — pass data approval first, then change code, not the other way around.

**Sampling rate, log retention window also not expanding.** One run dozens of JSONL lines, locally run a few hundred times no need to manage; when you need to consider these, it's already a backend problem.

Final word: this observability layer's value isn't in how much it recorded, it's in **it lets you ask a specific question**. "Why did it fabricate a Central China region" is an unanswerable question; "in this run with `trace_id=tr-b8934bdd`, which record is the first one with `error` non-null, what are the params" is an answerable question. After wiring up complete production tracing, only then can you systematically diagnose why agents failed, systematically fix[^S1].

## 💻 Exercises

<!-- exercises -->

### Level 1: Read this tree yourself without the explanation

The trace tree below is genuinely run from `v-bug` (same as the one in the main text, `trace_id` and millisecond counts vary by run). Pretend you're seeing it for the first time, colleague only threw you one line "summary.md has a Central China region our company doesn't have."

```text
agent_run  sales-summary 16ms  trace_id=tr-b8934bdd
├─ model_call turn-1         0ms  in=812 out=96  stop=tool_use
│  └─ tool_call  list_files     1ms  in={"dir":"data"}  ok string(52)
├─ model_call turn-2         0ms  in=946 out=218  stop=tool_use
│  ├─ tool_call  read_file      1ms  in={"path":"data/2026-q1-east.csv"}  ok string(74)
│  ├─ tool_call  read_file      0ms  in={"path":"data/2026-q1-sourth.csv"}  ERROR ENOENT: no such file or directory, open 'dat…
│  └─ tool_call  read_file      1ms  in={"path":"data/2026-q1-north.csv"}  ok string(74)
├─ model_call turn-3         0ms  in=1602 out=355  stop=tool_use
│  └─ tool_call  write_file     1ms  in={"path":"summary.md","content":"# …  ok string(22)
└─ model_call turn-4         0ms  in=1990 out=81  stop=end_turn
```

Colleague also pulled out that `list_files` log record for you — on the tree it only shows `ok string(52)`, details in the log (id and milliseconds as usual vary by run):

```json
{"trace_id":"tr-b8934bdd","span_id":"span-3d81c04a","parent_id":"span-71f2ce09","kind":"tool_call","name":"list_files","tool_input":{"shape":"object{dir}","chars":14,"head":"{\"dir\":\"data\"}"},"duration_ms":1,"tool_result":{"shape":"string(52)","chars":52,"head":"2026-q1-east.csv 2026-q1-north.csv 2026-q1-south.csv"},"error":null}
```

Without writing code, answer four questions in text:

1. First divergence point is **which line**?
2. Your **basis** for judging it as the divergence point is which fields on the tree and in this log record? Name field names and what possibilities each one rules out.
3. After divergence which lines are **contagion**, not independent glitches? Say line-by-line.
4. If you only had that final `summary.md`, without this tree, you'd probably **wrongly blame whom**? Why can't that direction fix this bug?

<!-- rubric -->

- Q1 points to that `read_file` with ERROR under `turn-2`, and states param is `data/2026-q1-sourth.csv` (the typo'd one)
- Q2 names at least three fields and each one's role: `error` (non-null, picks this one out from other records), `tool_input` (exposes param typo, rules out "file genuinely doesn't exist"), that `list_files` log record's `tool_result.head` (proves model did receive correct filename, rules out "it doesn't know which files exist")
- Q3 judges `turn-3`'s `write_file` and `turn-4`'s `end_turn` both as contagion, and explains their absurdities all stem from that upstream failed read
- Q4 points out would wrongly blame the model's "hallucination" or the prompt, and explains why adding "no fabrication" to the prompt can't fix — because the lesion is tool feedback too poor, not instruction not strict enough

<!-- answer -->

1. First divergence point is the **middle of three parallel `read_file`s** under `turn-2`: `in={"path":"data/2026-q1-sourth.csv"}`, result is ERROR. Two lines above and one below are all `ok`, only it broke.

2. Three fields together recognize it:

   - `error` field non-null — this is the only ERROR-bearing record in the entire tree, other nine all normal. It compresses candidate range from ten to one.
   - `tool_input`'s snippet — path says `sourth`, not `south`. This rules out "that data genuinely doesn't exist": what's wrong is the param, not the data.
   - That `list_files` log record's `tool_result.head` has `2026-q1-south.csv` — the model clearly did receive the correct filename. This rules out "it doesn't know what's in the directory."

   Missing any one of the three fields, the conclusion can't stand: only `error` you know something happened but don't know where it went wrong; only `tool_input` you can't tell if this call succeeded or failed; without that `list_files` return, you can't judge whether the model even had a chance to know the correct name.

3. Both lines after divergence are contagion:

   - `turn-3`'s `write_file`: the Central China region it wrote is fabricated, but when the model fabricated it it genuinely lacked one piece of data, and the error it received didn't tell it what's missing. This step is a decision made on the previous step's wreckage.
   - `turn-4`'s `end_turn`: it reports task complete, doesn't mention missing a piece of data at all. This likewise is the wreckage's continuation — it thinks what should be done is done.

   One step failing is enough to make the agent veer into a completely different trajectory, these two lines are two points on that trajectory, not two independent bugs. Fix any one separately, swap the failure method and new ones still grow.

4. Only looking at `summary.md`, easiest to blame **the model**: say it produced hallucinations, fabricated data, so add "no fabricating data" "must note where each number comes from" to the prompt. This direction can't fix, reason has two layers:

   - Lesion isn't in instructions, it's in feedback. At that step all the information the model received is one line `ENOENT: no such file or directory`, inside has neither "which files are in the directory" nor "should you retry or stop and ask a person." You shout louder in the prompt, at that step the material in its hand is still that line.
   - Prompt is global, divergence is local. Adding one line "no fabrication" affects its behavior every round, while the point genuinely needing behavior change is only "the next step after tool error" this one point. Changing error message hits the point, changing prompt sprinkles on the surface.

   Side note: if you don't even have `trace_id`, logs mixed in one stream, you can't even circle "which ten lines belong to this run," these four questions can't start a single one.

<!-- hint -->

Scan top to bottom, don't infer backward from `summary.md`. Which layer does the first expectation-violating record appear in? "Violates expectation" has a very obvious visual marker on this tree.

<!-- hint -->

Q2 wants not "because it says ERROR," but **three** fields each ruling out one possibility. Try asking separately: did this call succeed or fail (which field)? What's wrong is param or data itself (which field)? Did the model know the correct filename at that time (which field — on the tree, or in that log record)?

### Level 2: Add a "run comparison" to the observability layer

Looking only at single-run metrics makes it hard to judge if a change is good or bad. Write a `compare-runs.mjs`, read two `run.log.jsonl`, aggregate by `kind` then compare side-by-side. Requirements:

- Command line takes two log file paths: `node compare-runs.mjs <A> <B>`, missing params print usage and end with exit code 2.
- Compare at least these: model call count, tool call count, error count, `tokens_in` / `tokens_out` / `tokens_total`, total duration; token lines also give percentage change.
- Then group by tool name, compare how many times each tool was called.
- **Any side error count greater than zero means non-zero exit**, and print which side, how many times.
- After writing use it to compare `v-good` vs `v-fixed`, answer: did the fix introduce new errors? How much did tokens increase?

<!-- rubric -->

- Script zero dependencies, bare `node` runs, both params missing print usage and `process.exit(2)`
- Aggregation method is filter by `kind` (`model_call` / `tool_call` / `agent_run`) then count, not hardcoded line numbers
- Token three lines have percentage change, count lines give increase/decrease numbers
- By-tool-name grouped comparison covers all tool names appearing on both sides (when one side has and other doesn't, pad 0)
- Error gate genuinely works: both sides 0 means exit code 0, any side greater than 0 means exit code non-zero, and print each side's error count
- Conclusion section states clearly `v-fixed`'s error count still is 1 (that typo'd read is still there), and token increase's specific number

<!-- answer -->

Below is complete implementation, place same directory as `observed-agent.mjs`:

```javascript
#!/usr/bin/env node
// compare-runs.mjs —— Compare two runs' run.log.jsonl
// Usage: node compare-runs.mjs <A's run.log.jsonl> <B's run.log.jsonl>
// Any side has tool error means non-zero exit.
import fs from "node:fs";

function load(file) {
  const records = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const model = records.filter((r) => r.kind === "model_call");
  const tool = records.filter((r) => r.kind === "tool_call");
  const root = records.find((r) => r.kind === "agent_run");
  const byTool = new Map();
  for (const r of tool) byTool.set(r.name, (byTool.get(r.name) ?? 0) + 1);
  return {
    file,
    trace_id: records[0]?.trace_id ?? "(empty log)",
    model_calls: model.length,
    tool_calls: tool.length,
    errors: records.filter((r) => r.error).length,
    tokens_in: model.reduce((s, r) => s + r.tokens.input, 0),
    tokens_out: model.reduce((s, r) => s + r.tokens.output, 0),
    wall_ms: root?.duration_ms ?? 0,
    byTool,
  };
}

const pad = (v, w) => String(v).padStart(w);

function deltaOf(a, b, asPercent) {
  const d = b - a;
  const sign = d > 0 ? "+" : d < 0 ? "" : "±";
  if (!asPercent || a === 0) return `${sign}${d === 0 ? 0 : d}`;
  return `${sign}${d}（${sign}${((d / a) * 100).toFixed(1)}%）`;
}

function main() {
  const [fileA, fileB] = process.argv.slice(2);
  if (!fileA || !fileB) {
    console.error("Usage: node compare-runs.mjs <A's run.log.jsonl> <B's run.log.jsonl>");
    process.exit(2);
  }
  const a = load(fileA);
  const b = load(fileB);

  console.log(`A: ${a.file}  trace_id=${a.trace_id}`);
  console.log(`B: ${b.file}  trace_id=${b.trace_id}`);
  console.log(`\n${"Metric".padEnd(13)}${pad("A", 7)}${pad("B", 8)}   Change`);
  const rows = [
    ["model_calls", a.model_calls, b.model_calls, false],
    ["tool_calls", a.tool_calls, b.tool_calls, false],
    ["errors", a.errors, b.errors, false],
    ["tokens_in", a.tokens_in, b.tokens_in, true],
    ["tokens_out", a.tokens_out, b.tokens_out, true],
    ["tokens_total", a.tokens_in + a.tokens_out, b.tokens_in + b.tokens_out, true],
    ["wall_ms", a.wall_ms, b.wall_ms, false],
  ];
  for (const [name, va, vb, pct] of rows) {
    console.log(`${name.padEnd(13)}${pad(va, 7)}${pad(vb, 8)}   ${deltaOf(va, vb, pct)}`);
  }

  console.log("\nBy tool name:");
  for (const name of [...new Set([...a.byTool.keys(), ...b.byTool.keys()])].sort()) {
    const va = a.byTool.get(name) ?? 0;
    const vb = b.byTool.get(name) ?? 0;
    console.log(`${name.padEnd(13)}${pad(va, 7)}${pad(vb, 8)}   ${deltaOf(va, vb, false)}`);
  }

  if (a.errors > 0 || b.errors > 0) {
    console.log(`\nGate FAILS: A side ${a.errors} errors, B side ${b.errors} errors.`);
    process.exit(1);
  }
  console.log("\nGate passes: both sides have no error records.");
  process.exit(0);
}

main();
```

**First verify the gate itself.** This is Lesson 4's rule's direct application: newly-wired detector, first confirm it genuinely lets through in "should pass" situations, otherwise every exit code you read afterward is untrustworthy. Take `v-good` compare to itself:

```text
$ node compare-runs.mjs runs/v-good/run.log.jsonl runs/v-good/run.log.jsonl
A: runs/v-good/run.log.jsonl  trace_id=tr-0f4f0551
B: runs/v-good/run.log.jsonl  trace_id=tr-0f4f0551

Metric               A       B   Change
model_calls          4       4   ±0
tool_calls           5       5   ±0
errors               0       0   ±0
tokens_in         5303    5303   ±0（±0.0%）
tokens_out         730     730   ±0（±0.0%）
tokens_total      6033    6033   ±0（±0.0%）
wall_ms             16      16   ±0

By tool name:
list_files           1       1   ±0
read_file            3       3   ±0
write_file           1       1   ±0

Gate passes: both sides have no error records.
$ echo $?
0
```

All `±0`, exit code 0. Gate can let through, ready to use.

**Then compare `v-good` vs `v-fixed`:**

```text
$ node compare-runs.mjs runs/v-good/run.log.jsonl runs/v-fixed/run.log.jsonl
A: runs/v-good/run.log.jsonl  trace_id=tr-0f4f0551
B: runs/v-fixed/run.log.jsonl  trace_id=tr-80892fc3

Metric               A       B   Change
model_calls          4       5   +1
tool_calls           5       6   +1
errors               0       1   +1
tokens_in         5303    7521   +2218（+41.8%）
tokens_out         730     838   +108（+14.8%）
tokens_total      6033    8359   +2326（+38.6%）
wall_ms             16       7   -9

By tool name:
list_files           1       1   ±0
read_file            3       4   +1
write_file           1       1   ±0

Gate FAILS: A side 0 errors, B side 1 errors.
$ echo $?
1
```

Answer those two questions:

- **Did it introduce new errors?** No new ones, but the old one is still there. `v-fixed`'s `errors=1` is exactly that read that typo'd `south` as `sourth` — changing error message changed "what does model do after error," didn't change "will model typo." So gate judges fail, exit code 1, this result is correct: this gate asks "does this run still have tool errors," not "is the final artifact correct." Whether artifact's correct needs separate verification (`diff runs/v-good/summary.md runs/v-fixed/summary.md` is empty). To genuinely return `errors` to zero, next step what should move is `read_file`'s description, give it a positive example, so model doesn't typo in the first place.
- **How much did tokens increase?** Total from 6033 up to 8359, up 2326, increase 38.6%; the extra all on that round of re-read's round-trip (`read_file` from 3 times became 4 times, model calls from 4 times became 5 times). 38% not a blowout, but not free either — fix's cost must acknowledge on this table, can't just see result correct and call it done.

Also that `-9` on the `wall_ms` line don't take seriously: stub client doesn't send network requests, two runs' wall-clock time is basically file I/O noise, each run different. After hooking up real APIs this line gains meaning.

<!-- hint -->

`load()` only needs one `readFileSync` plus `split("\n")`, then all stats are `filter` and `reduce` on the same array. `byTool` using `Map` to accumulate is easiest; when finding union of both sides' tool names remember to use `new Set([...a.keys(), ...b.keys()])`, otherwise tools unique to one side will leak.

<!-- hint -->

Exit code needs explicit `process.exit()`, don't expect script finishing normally auto-becomes 0 — after `console.log` process default exit code indeed is 0, but gate-fails road must write `process.exit(1)` yourself. When verifying use `echo $?` in shell to see previous command's exit code.

<!-- /exercises -->

## Recap

- Observability three-piece each handles one segment: JSON Lines logs handle "record it down," trace tree handles "see order and belonging clearly," metrics summary handles "see at a glance if this run looks normal"; tree and summary both rebuild from on-disk JSONL, what's not recorded in logs will never appear in the tree
- Every record must carry `trace_id` and `parent_id`: former circles scattered records back to same run, latter lets them rebuild into tree — this is exactly the same technique official uses to tie all events triggered by one prompt with `prompt.id`, filter by it to locate[^S4]
- Content defaults to not writing full text: official telemetry's default stance is structural things all recorded, agent-read/written content not collected, user prompts only record length; to enable content recording, prerequisite is your observability pipeline is approved to store this type of data[^S6]
- Those five metrics numbers (duration, call count, tokens, error count, total duration) are the same set used for grading in Course 10 (Verification and Quality Assurance: Don't Let 'Looks Right' Slip Through)[^S3], here swapped to diagnostic use; in this round's comparison, `v-good` and `v-bug`'s round count, call count, tokens all nearly identical, only thing that changed is error count
- Locating's key action is to identify **first** divergence point in the tree, then treat all absurdities downstream uniformly as contagion: one step failing is enough to make the agent veer into a completely different trajectory[^S1], going to fix that final artifact layer equals fixing a shadow
- Fixing tool error message is a fix hitting the lesion: error responses should explain specific, actionable improvements clearly, instead of throwing an opaque error code or stack trace[^S3]; after this fix the model changed from "fabricate a Central China region" to "re-read once with original filename, and turn back to ask user if there's other data"
- After fixing must re-run compare, and must acknowledge the bill: `errors` didn't return to zero (typo still there), tokens up 38% (added one round-trip); "result correct" doesn't equal "cost zero"

Six lessons' main line finishes here. Lesson 1 stated clearly why you can't say — agent two runs take different roads, one symptom underneath presses several causes that look identical from outside. Lesson 2 pinned first-hand evidence on the raw transcript, not its self-report. Lesson 3 turned every step into data with fields. Lesson 4 threaded scattered data into a tree, by the way telling you this pipeline itself will silently lie. Lesson 5 installed probes at the loop's gates, gave locating's walking method. This lesson soldered the previous five lessons into a ~400-line, zero-dependency file, and used it to genuinely trace "where did Central China region come from" to that typo'd-path read in `turn-2`.

This is also Course 11 of this series. Next time your agent can't say where it went wrong, you no longer only have one phrase "the model made it up" in hand — you have a grep-able log, a tree where you can point at a certain line and speak, a summary table that can calculate cost, and a set of walking methods from symptom tracing to first divergence point. What remains is to entirely move the three observability segments from `observed-agent.mjs` (logger, trace tree, metrics summary) into your own harness, following section 7's pattern wrap those two layers around your loop — fixtures and stubs are this lesson's teaching scaffolding, don't take them — then run the first real task, see what's in that first `run.log.jsonl` that you originally had no idea about.


