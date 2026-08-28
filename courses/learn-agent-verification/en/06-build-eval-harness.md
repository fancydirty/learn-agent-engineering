# Lesson 6: Hands-On: Build an Eval Track for Your Agent

> Learning goals:
> - Wire together eval sets, layered grading, and harness loops into a runnable `eval-runner.mjs` — one eval task per independent loop
> - Have reports capture not just pass rate but also per-task duration, tool call count, token consumption, and tool errors, then use those columns to diagnose issues
> - Use this track to measure the real impact of a system prompt change, and catch an overly strict verifier that rejects correct outputs
>
> Prerequisites: Read lessons 1–5, have course 7's harness loop runnable at hand | Previous: [Lesson 5 <<](./05-eval-sets.md)

The first five lessons were all components: verify end state not step-by-step (lesson 2), deterministic checks first and watch for overly strict verifiers (lesson 3), free-form text only gets LLM judges (lesson 4), eval sets start from twenty-ish real tasks (lesson 5). Each makes sense on its own, but after you change your prompt you still don't have one thing you can run with a single command to let the numbers tell you "better or worse."

This lesson welds the components together. What you get is a three-hundred-line file that runs in under two seconds. The official guidance on "how to run evals" is direct: use programmatic direct LLM API calls; use simple agentic loops — while-loops wrapping alternating LLM calls and tool calls — **one eval task per loop**[^S3]. That's exactly the `stop_reason`-driven loop from course 7 in this series. You can transplant it as-is.

## What it looks like when it runs

Save the full `eval-runner.mjs` from later in this lesson, then `node eval-runner.mjs`:

```text
=== Report · Prompt v1 · Verifier normalized (fixed) ===
Task              Grader       Result   Score  Calls  Errs   Tokens     Duration
-------------------------------------------------------------------------------
t1-total          deterministic pass    1.00      3     0     1,800      124ms
t2-pending        deterministic pass    1.00      1     0       995       81ms
t3-no-orderid     deterministic FAIL    0.00      2     1     1,550      123ms
t4-refund-note    LLM judge     FAIL    0.67      1     0     1,432      124ms
t5-missing-order  deterministic pass    1.00      1     1       966       83ms
-------------------------------------------------------------------------------
Pass rate 3/5 (60%) · Tool calls 8 · Tool errors 2 · Tokens 6,743 · Total 535ms

Failed cases:
  [t3-no-orderid] Criteria: When params incomplete should call zero tools, ask for order ID
  Agent answer: Order SO-1001 status is complete.
  [t4-refund-note] Criteria: Amount matches order, tone appropriate; but refund arrival time missing, customer has no expectation, missing 1 of 3 items.
  Agent answer: Hello, order SO-1003 (amount ¥320.00) cancellation received, refund will be returned to original payment method. Sorry for the inconvenience.

=== Report · Prompt v2 · Verifier normalized (fixed) ===
Task              Grader       Result   Score  Calls  Errs   Tokens     Duration
-------------------------------------------------------------------------------
t1-total          deterministic pass    1.00      3     0     1,800      123ms
t2-pending        deterministic pass    1.00      1     0       995       83ms
t3-no-orderid     deterministic pass    1.00      0     0       487       41ms
t4-refund-note    LLM judge     pass    1.00      1     0     1,518      123ms
t5-missing-order  deterministic pass    1.00      1     1       966       83ms
-------------------------------------------------------------------------------
Pass rate 5/5 (100%) · Tool calls 6 · Tool errors 1 · Tokens 5,766 · Total 453ms

=== Score delta v1 -> v2 ===
Task                   v1     v2  Change
------------------------------------------------
t1-total             1.00   1.00  flat
t2-pending           1.00   1.00  flat
t3-no-orderid        0.00   1.00  fail => pass
t4-refund-note       0.67   1.00  fail => pass
t5-missing-order     1.00   1.00  flat
------------------------------------------------
Pass rate 3/5 -> 5/5
```

This isn't a hand-crafted example — it's copied verbatim from a real run in a temp directory. Copy the full code and run it once; everything except the "Duration" column (real wall-clock time, varies with machine load) will match down to the millisecond. The numbers are the same because the stub client returns canned responses.

This output contains everything this lesson teaches: five tasks each running their own loop, two grading modes mixed in one table, pass rate plus four diagnostic columns, two-version delta collapsed into a comparison table. The rest of this lesson unpacks it.

## The five pieces of a track

1. **System under test**: tool definitions, actual tool implementations, and the data behind them. The eval runs "agent uses your tools to work" — tools are part of what you're testing.
2. **Stub client**: a fake `messages.create` that returns canned responses in a fixed queue, making the whole track reproducible.
3. **Eval set**: a `tasks` array, each entry is `{id, prompt, verify}`. Official requirement: each eval prompt should be paired with a verifiable response or outcome[^S3] — a prompt without a verifier isn't an eval task, it's a demo.
4. **Grading**: what can be graded deterministically goes to a `verify` function; free-form text goes to the judge.
5. **Loop and report**: one task one while-loop, aggregate metrics into a table when done.

One thing to nail down first: **tasks don't share `messages`**. Each task's `messages` starts with only that task's user prompt, runs its own loop, then gets discarded[^S3]. Why this matters so much — the quiz in the middle will ask directly.

## Piece one: tools and the data behind them

The system under test is an order assistant, four orders, two tools: `search_orders` (search by customer name or status, returns order ID list) and `get_order` (query single order detail by order ID). Two details are deliberate: `search_orders` only returns order IDs without amounts, forcing the agent to call `get_order` again for each order — the "calls" column in the report will expose this design flaw. The other: it throws an error when both filter conditions are empty:

```javascript
search_orders({ customer, status }) {
  if (!customer && !status) {
    throw new Error("Invalid params: must provide at least one of customer or status");
  }
  // ...filter by conditions, return { order_ids: [...] }
}
```

This is "invalid parameter" tool error. Official guidance says these errors clustering together usually means tool descriptions should be clearer or need examples[^S3]. We'll see it in the report in a moment. Tool errors aren't crashes — the tool-execution block catches the exception, wraps it into a `tool_result` with `is_error: true`, returns it to the model, and increments a counter. `tool_use` and `tool_result` pair via `tool_use_id` — this is the foundation laid in course 7, here we just add two counters.

## Piece two: stub client and the verification interlude

Need to pause here, otherwise all the numbers below won't hold.

Real Claude is nondeterministic: same prompt run twice, paths can differ completely[^S2]. That's good for production, disastrous for demo lessons — you run today and get 3/5, tomorrow 4/5, can't tell if the difference is prompt change or model mood. So courses 8 and 9's hands-on lessons all use the same method: **swap the model for a stub that returns canned responses in a fixed queue**, making tested behavior a controlled variable. This verifies the control logic you wrote, not the model's daily performance.

```javascript
function stubClient(script, label) {
  if (!script) throw new Error(`[stub] No response queue for ${label}`);
  let cursor = 0;
  return {
    messages: {
      async create() {
        if (cursor >= script.length) {
          throw new Error(`[stub] ${label} response queue exhausted (${cursor} requests issued)`);
        }
        const res = script[cursor++];
        await sleep(res.latency_ms);
        return res;
      },
    },
  };
}
```

When queue exhausts it throws an error, no fallback response — if the loop spins one extra time you immediately see `Error: [stub] v1/t2-pending response queue exhausted (1 requests issued)` (that's the actual error text after I deleted the last response from t2's queue), not a fake `end_turn` slipping through. Each response carries its own `latency_ms`; the stub actually sleeps that long so the "Duration" column measures how many turns the loop took. Each task gets a fresh client with its own script; cursors don't cross tasks.

**The difference between two prompt versions is pinned in the stub's two response queues.** In a real scenario you change the system prompt and model behavior follows; here I don't have a model, so I pre-wrote `SCRIPT_V1` and `SCRIPT_V2`, letting v2 return different responses on two tasks — "assume v2 prompt takes effect and model answers this way" is encoded as data:

```javascript
// v2 only swaps two tasks' responses — the version delta is pinned here
const SCRIPT_V2 = {
  ...SCRIPT_V1,
  "t3-no-orderid": [
    finish("Which order are you referring to? Send me the order ID (format SO-1001).", [455, 32]),
  ],
  "t4-refund-note": [/* version with arrival time added */],
};
```

Use spread syntax to inherit from v1, only list the changed entries — code readers see the delta scope at a glance. This track **verifies the track itself**: whether verifiers grade correctly, whether metrics record accurately, whether reports compute right, whether two runs can be compared. When you swap in a real client, the track doesn't change — only the numbers start jumping.

## Piece three: eval set — four regular plus one edge case

Lesson 5 said eval sets should match real distribution and cover edge cases[^S5]; official also warned against overly simplistic sandbox environments that don't stress tools with sufficient complexity[^S3]. Here we only fit five tasks for space, but the structure follows real eval sets:

| Task | What it tests | Grading |
| --- | --- | --- |
| `t1-total` | Multi-step aggregation: search list then fetch amount for each | Deterministic |
| `t2-pending` | Set filtering: order IDs should be exactly these, no more no less | Deterministic |
| `t3-no-orderid` | **Edge case**: user didn't provide order ID | Deterministic |
| `t4-refund-note` | Free-form text: refund notice to customer | LLM judge |
| `t5-missing-order` | After tool error, report truthfully, don't fabricate data | Deterministic |

`t3-no-orderid` deserves special mention. The prompt is "Help me check the status of that order" — which one? Not specified. Ideal behavior is to ask for the order ID instead of guessing one to query. Official docs are careful about this behavior: if the user prompt doesn't provide enough info to fill all required params, Claude Opus is much more likely to recognize the missing parameter and ask for it, but this behavior is not guaranteed, especially for more ambiguous prompts and less capable models[^S6]. **"Not guaranteed" behaviors are exactly what eval sets should cover** — guaranteed things don't need testing.

```javascript
{
  id: "t3-no-orderid",
  grader: "deterministic",
  prompt: "Help me check the status of that order.",
  verify: (r) => ({
    pass: r.toolCalls === 0 && r.answer.includes("?") && r.answer.includes("order ID"),
    note: "When params incomplete should call zero tools, ask for order ID",
  }),
},
```

The `r` that `verify` receives contains not just `answer` but also `toolCalls`, `toolErrors`, `tokens`, so the verifier can check "end state plus key metrics" not just text: `t3` actually checks "called zero tools," `t5` checks "reported exactly one error and truthfully said not found" — lesson 2's end-state-first is realized through these fields. `note` is for humans; when a task fails, the report prints the criteria alongside the agent's actual response.

If your lesson 5 homework used the `{id, prompt, expected, verifier, rubricRef, tags, split}` field set, map it now to avoid confusion: lesson 5's `verifier` is called `grader` here and is only for display — actual grading type is determined by whether this task has a `verify` function or `judge: true`. The declarative assertions in `expected` are written directly into the `verify` function body here (each task's assertions look different; writing them as functions is simpler than designing a universal assertion format). `rubricRef` is inlined as `JUDGE_PROMPT` since the whole suite has only one judge case. `tags` and `split` are omitted for brevity; the hold-out discipline gets repeated in the "Scope" section as usual. Your lesson 5 JSON isn't obsolete — it's the declarative version of this `TASKS` array. Moving forward means translating each assertion into a function.

## Piece four: layered grading, deterministic first

Grading methods have an ordering: code-based grading is fastest, most reliable, scales extremely well but lacks nuance for complex judgments; LLM-based grading is fast and flexible, can handle complex judgment, but test reliability first then scale; human grading is most flexible and highest quality but slow and expensive, avoid if possible[^S5].

So the rule is: **anything that can be graded by code never goes to a judge**. Four of five tasks here use `verify`; only `t4-refund-note`, that piece of free-form text, goes to the judge — "can this paragraph be sent to a customer" can't be answered by string matching. The judge's shape follows lesson 4: rubric locked to three items, output format locked to JSON, reason first then score:

```javascript
const JUDGE_PROMPT = `You are a grader. Score this customer service reply by the rubric below, reason first then score.
Rubric (each item 0 or 1, average for total score):
- Amount accurate: refund amount stated and matches order amount
- Arrival time: refund arrival time stated
- Tone appropriate: wording suitable for direct customer communication
Output JSON only: {"reasoning": "...", "score": 0.0-1.0, "grade": "pass" | "fail"}
score >= 0.8 counts as pass.`;
```

Each point has a source: have the judge reason first then score, then discard the reasoning — improves grading quality, especially for tasks requiring complex judgment[^S5]; output should be empirical or specific, not purely qualitative evaluation[^S5]; and "single LLM call, single prompt, output 0.0–1.0 score plus a pass/fail" is the combination official found most consistent and aligned with human judgments after trying multiple judge schemes in their multi-agent research system[^S2].

The judge here is also a stub: v1's reply is missing arrival time, two of three items give 0.67 graded fail; v2 added it, all three hit giving 1.00 graded pass. The score is self-consistent with the rubric — three binary items averaged can only land on 0, 0.33, 0.67, 1.00; a score of 0.85 would mean the judge didn't follow the rubric's math. The judge itself burns tokens; its consumption gets added to that task's tokens, which is why `t4` only calls one tool but tokens aren't low.

One more lesson 4 discipline: the working model shouldn't grade itself. Official says have a fresh model instance try to refute the result — the one doing the work isn't the one grading it[^S4]. In code: the judge uses its own client, its own system prompt, its own messages array, only sees the task prompt and the reply to grade, doesn't see the agent's tool call transcript.

## Piece five: loop and report

The loop is course 7's loop verbatim, skeleton unchanged — just added the real API's required `model` and `max_tokens` (stub ignores them), then wrapped with counters:

```javascript
let response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools: TOOLS, messages });
metrics.tokens += response.usage.input_tokens + response.usage.output_tokens;
while (response.stop_reason === "tool_use") {
  messages.push({ role: "assistant", content: response.content });
  const toolResults = await runToolUses(response.content, metrics);
  messages.push({ role: "user", content: toolResults });
  response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools: TOOLS, messages });
  metrics.tokens += response.usage.input_tokens + response.usage.output_tokens;
}
```

`messages` is a local variable inside `runTask`; function returns and it's gone. That's the entire implementation of "tasks don't share context" — no extra mechanism needed, just don't hoist it out.

For metrics, official's checklist is: beyond top-level accuracy, also collect total runtime of individual tool calls and tasks, total number of tool calls, total token consumption, and tool errors[^S3]. The report table columns follow this exact checklist. Pass rate only tells you "did it pass," these columns tell you "how it passed" — a task passes but calls twelve tools versus passes with two calls are two quality levels. These columns also self-document: lots of redundant tool calls usually suggest pagination or token limit parameters need rightsizing; lots of tool errors for invalid parameters usually suggest tool descriptions could be clearer or need better examples[^S3]. The exercises will use this directly.

That the report is human-readable has intrinsic value. Official's suggestion is: have Claude show evidence rather than assertions of success — test output, what command it ran and what it returned, or a screenshot of the result; reviewing evidence is faster than re-running verification yourself, and works for sessions you weren't watching[^S4]. This report table is that evidence — paste it in a PR description or send to a colleague, they can judge without re-running. (The only gotcha with printing is CJK full-width characters count as width 2, raw `padEnd` will misalign — code has a width-aware `pad`.)

```agentmentor-check
{
  "id": "vq-zh-06-shared-session",
  "label": "All eval tasks share one long session — does it work?",
  "prompt": "A colleague looked at eval-runner.mjs and suggested an optimization: right now each task creates a new messages array and runs an independent loop — wasteful. Why not have all five tasks share one long session and run sequentially? Two reasons given — previously queried order data can be reused later (saves tokens), and the model 'warms up' so later tasks get better answers. What's the fundamental problem with this proposal?",
  "whyHere": "In this track's structure, the thing most likely to be 'optimized' away is task isolation. It looks like duplicate work but is actually the precondition for comparing results.",
  "mode": "single",
  "choices": [
    {
      "id": "a",
      "text": "Problem is it fundamentally doesn't save tokens: with a shared session every request re-sends all previous tasks' messages, input tokens climb linearly.",
      "correct": false,
      "feedback": "This half-sentence is correct — shared long sessions do accumulate input tokens, the token-saving calculation doesn't work out. But that's just the reason being invalid, not the reason the approach itself is unusable. Even if tokens actually saved, the scores from running this way still can't be used. See choice c."
    },
    {
      "id": "b",
      "text": "Problem is metrics can't be split by task: with a shared session, tool call counts, duration, tokens mix together, can't fill out the report table.",
      "correct": false,
      "feedback": "Metrics are harder to split, true, but that's an accounting problem: mark boundaries at each task's edge, reset counters, still feasible to split and count. Solvable by engineering means isn't the root cause. Root cause is in c."
    },
    {
      "id": "c",
      "text": "Problem is tasks contaminate each other: an eval task should run an independent loop; with a shared session, context left by the previous task carries into the next — model might directly use order data already queried in the last task to answer, testing no longer measures this task's own ability; and switching task order changes results, two runs no longer comparable.",
      "correct": true,
      "feedback": "Correct. Official guidance is 'one eval task per loop'; isolation isn't waste, it's precondition. Contamination has two layers: one is what you're testing changes — data queried back by the previous task still sits in context, if the next task touches related content it might answer directly from prior context without calling tools, or get misled by irrelevant old context into wrong answers; then you're testing 'can it flip through prior context' not 'can it use tools.' The other layer is tasks become order-dependent; swap order or delete a middle task, remaining tasks' scores all shift, and the track loses its only purpose — making two runs comparable."
    }
  ]
}
```

## The complete eval-runner.mjs

Copy and save as `eval-runner.mjs`, `node eval-runner.mjs` runs directly. No deps, no `package.json`, Node 18+ (uses top-level `await` so extension must be `.mjs`).

```javascript
// eval-runner.mjs — eval track with one harness loop per task
//
// Usage:
//   node eval-runner.mjs                  use fixed (normalized) verifier
//   node eval-runner.mjs --strict-verify  use old non-normalized verifier, see false negatives

const STRICT = process.argv.includes("--strict-verify");
const MODEL = "claude-opus-5"; // stub ignores it; when swapping real client model and max_tokens are required params

// ============ 1. System under test: tools and data ============

const ORDERS = {
  "SO-1001": { customer: "Qiming Tech", status: "complete", month: "2026-08", amount: 780.0 },
  "SO-1002": { customer: "Qiming Tech", status: "complete", month: "2026-08", amount: 500.0 },
  "SO-1003": { customer: "Qiming Tech", status: "pending", month: "2026-08", amount: 320.0 },
  "SO-1004": { customer: "Yuanshan Logistics", status: "pending", month: "2026-08", amount: 96.5 },
};

const TOOLS = [
  {
    name: "search_orders",
    description: "Search orders by customer name or order status, returns order ID list. Must provide at least one of customer or status.",
    input_schema: {
      type: "object",
      properties: { customer: { type: "string" }, status: { type: "string" } },
    },
  },
  {
    name: "get_order",
    description: "Query single order's customer, status, amount by order ID.",
    input_schema: {
      type: "object",
      properties: { order_id: { type: "string" } },
      required: ["order_id"],
    },
  },
];

const TOOL_IMPL = {
  search_orders({ customer, status }) {
    if (!customer && !status) {
      throw new Error("Invalid params: must provide at least one of customer or status");
    }
    const ids = Object.keys(ORDERS).filter(
      (id) =>
        (!customer || ORDERS[id].customer === customer) &&
        (!status || ORDERS[id].status === status)
    );
    return { order_ids: ids };
  },
  get_order({ order_id }) {
    const o = ORDERS[order_id];
    if (!o) throw new Error(`Order ${order_id} does not exist`);
    return { order_id, ...o };
  },
};

// ============ 2. Stub client: fixed response queue ============

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (s) => ({ type: "text", text: s });
const toolUse = (id, name, input) => ({ type: "tool_use", id, name, input });
const useTools = (blocks, [i, o]) => ({
  stop_reason: "tool_use",
  content: blocks,
  usage: { input_tokens: i, output_tokens: o },
  latency_ms: 40,
});
const finish = (s, [i, o]) => ({
  stop_reason: "end_turn",
  content: [text(s)],
  usage: { input_tokens: i, output_tokens: o },
  latency_ms: 40,
});

function stubClient(script, label) {
  if (!script) throw new Error(`[stub] No response queue for ${label}`);
  let cursor = 0;
  return {
    messages: {
      async create() {
        if (cursor >= script.length) {
          throw new Error(`[stub] ${label} response queue exhausted (${cursor} requests issued)`);
        }
        const res = script[cursor++];
        await sleep(res.latency_ms);
        return res;
      },
    },
  };
}

// ============ 3. Two system prompts and their response queues ============

const SYSTEM_PROMPTS = {
  v1: "You are an order assistant. Use tools to query orders, then answer user.",
  v2:
    "You are an order assistant. Use tools to query orders, then answer user.\n" +
    "Two hard rules:\n" +
    "1. When user hasn't provided order ID, ask for order ID first, don't guess one to query.\n" +
    "2. Refund notices to customers must state refund amount and arrival time.",
};

const SCRIPT_V1 = {
  "t1-total": [
    useTools([toolUse("tu_1", "search_orders", { customer: "Qiming Tech", status: "complete" })], [420, 60]),
    useTools(
      [
        toolUse("tu_2", "get_order", { order_id: "SO-1001" }),
        toolUse("tu_3", "get_order", { order_id: "SO-1002" }),
      ],
      [520, 88]
    ),
    finish("Customer Qiming Tech has 2 complete orders in Aug 2026 (SO-1001, SO-1002), total ¥1,280.00.", [660, 52]),
  ],
  "t2-pending": [
    useTools([toolUse("tu_1", "search_orders", { status: "pending" })], [415, 46]),
    finish("Currently pending orders are SO-1003 and SO-1004.", [500, 34]),
  ],
  "t3-no-orderid": [
    useTools([toolUse("tu_1", "search_orders", {})], [408, 38]),
    useTools([toolUse("tu_2", "get_order", { order_id: "SO-1001" })], [470, 44]),
    finish("Order SO-1001 status is complete.", [560, 30]),
  ],
  "t4-refund-note": [
    useTools([toolUse("tu_1", "get_order", { order_id: "SO-1003" })], [430, 42]),
    finish(
      "Hello, order SO-1003 (amount ¥320.00) cancellation received, refund will be returned to original payment method. Sorry for the inconvenience.",
      [540, 76]
    ),
  ],
  "t5-missing-order": [
    useTools([toolUse("tu_1", "get_order", { order_id: "SO-9999" })], [412, 40]),
    finish("System didn't find order SO-9999, please confirm the order ID is correct.", [478, 36]),
  ],
};

// v2 only swaps two tasks' responses — version delta pinned here
const SCRIPT_V2 = {
  ...SCRIPT_V1,
  "t3-no-orderid": [
    finish("Which order are you referring to? Send me the order ID (format SO-1001).", [455, 32]),
  ],
  "t4-refund-note": [
    useTools([toolUse("tu_1", "get_order", { order_id: "SO-1003" })], [462, 42]),
    finish(
      "Hello, cancellation request for order SO-1003 (amount ¥320.00) has been received, refund will be returned to original payment method, usually arrives in 3-5 business days. Sorry for the inconvenience.",
      [572, 94]
    ),
  ],
};

const SCRIPTS = { v1: SCRIPT_V1, v2: SCRIPT_V2 };

// ============ 4. Judge: also a stub, outputs 0.0-1.0 plus pass/fail ============

const JUDGE_PROMPT = `You are a grader. Score this customer service reply by the rubric below, reason first then score.
Rubric (each item 0 or 1, average for total score):
- Amount accurate: refund amount stated and matches order amount
- Arrival time: refund arrival time stated
- Tone appropriate: wording suitable for direct customer communication
Output JSON only: {"reasoning": "...", "score": 0.0-1.0, "grade": "pass" | "fail"}
score >= 0.8 counts as pass.`;

const JUDGE_SCRIPTS = {
  v1: {
    "t4-refund-note": [
      finish(
        JSON.stringify({
          reasoning: "Amount matches order, tone appropriate; but refund arrival time missing, customer has no expectation, missing 1 of 3 items.",
          score: 0.67,
          grade: "fail",
        }),
        [286, 58]
      ),
    ],
  },
  v2: {
    "t4-refund-note": [
      finish(
        JSON.stringify({
          reasoning: "Amount, arrival time, tone all three items satisfied, can be sent directly to customer.",
          score: 1.0,
          grade: "pass",
        }),
        [302, 46]
      ),
    ],
  },
};

async function judgeAnswer(task, answer, version, metrics) {
  const client = stubClient(JUDGE_SCRIPTS[version][task.id], `judge/${version}/${task.id}`);
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: JUDGE_PROMPT,
    messages: [{ role: "user", content: `【Task】${task.prompt}\n【Reply to grade】${answer}` }],
  });
  metrics.tokens += res.usage.input_tokens + res.usage.output_tokens;
  const verdict = JSON.parse(res.content.map((b) => b.text).join(""));
  return { pass: verdict.grade === "pass", score: verdict.score, note: verdict.reasoning };
}

// ============ 5. Eval set: 4 regular + 1 edge case ============

function amountsIn(s) {
  return [...s.replace(/[,，\s¥￥]/g, "").matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}
function orderIdsIn(s) {
  return [...new Set(s.match(/SO-\d+/g) ?? [])].sort();
}

const TASKS = [
  {
    id: "t1-total",
    grader: "deterministic",
    prompt: "Customer Qiming Tech's complete orders in Aug 2026, what's the total amount?",
    verify: (r) => ({
      pass: amountsIn(r.answer).some((n) => Math.abs(n - 1280) < 0.005),
      note: "Answer must contain 1280 (allows currency symbol, thousand separator, unit)",
    }),
    strictVerify: (r) => ({
      pass: r.answer.includes("1280.00"),
      note: "Answer must contain literal string 1280.00",
    }),
  },
  {
    id: "t2-pending",
    grader: "deterministic",
    prompt: "Which orders are still unshipped? List the order IDs.",
    verify: (r) => ({
      pass: JSON.stringify(orderIdsIn(r.answer)) === JSON.stringify(["SO-1003", "SO-1004"]),
      note: "Order ID set in answer must exactly equal SO-1003 + SO-1004",
    }),
  },
  {
    id: "t3-no-orderid",
    grader: "deterministic",
    prompt: "Help me check the status of that order.",
    verify: (r) => ({
      pass: r.toolCalls === 0 && r.answer.includes("?") && r.answer.includes("order ID"),
      note: "When params incomplete should call zero tools, ask for order ID",
    }),
  },
  {
    id: "t4-refund-note",
    grader: "LLM judge",
    judge: true,
    prompt: "Customer applies to cancel and refund order SO-1003, write them a reply.",
  },
  {
    id: "t5-missing-order",
    grader: "deterministic",
    prompt: "Check the status of order SO-9999.",
    verify: (r) => ({
      pass: r.toolErrors === 1 && /not found|doesn't exist|does not exist/.test(r.answer) && !/[¥￥]|yuan|dollar/.test(r.answer),
      note: "After tool error must truthfully say not found, can't fabricate an amount",
    }),
  },
];

// ============ 6. One task one harness loop ============

async function runToolUses(content, metrics) {
  const results = [];
  for (const block of content) {
    if (block.type !== "tool_use") continue;
    metrics.toolCalls += 1;
    try {
      const out = TOOL_IMPL[block.name](block.input);
      results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out) });
    } catch (err) {
      metrics.toolErrors += 1;
      results.push({ type: "tool_result", tool_use_id: block.id, content: err.message, is_error: true });
    }
  }
  return results;
}

async function runTask(task, version) {
  const metrics = { toolCalls: 0, toolErrors: 0, tokens: 0 };
  const client = stubClient(SCRIPTS[version][task.id], `${version}/${task.id}`);
  const system = SYSTEM_PROMPTS[version];
  const messages = [{ role: "user", content: task.prompt }];
  const startedAt = Date.now();

  let response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools: TOOLS, messages });
  metrics.tokens += response.usage.input_tokens + response.usage.output_tokens;
  while (response.stop_reason === "tool_use") {
    messages.push({ role: "assistant", content: response.content });
    const toolResults = await runToolUses(response.content, metrics);
    messages.push({ role: "user", content: toolResults });
    response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools: TOOLS, messages });
    metrics.tokens += response.usage.input_tokens + response.usage.output_tokens;
  }

  const answer = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  let verdict;
  if (task.judge) {
    verdict = await judgeAnswer(task, answer, version, metrics);
  } else {
    const fn = STRICT && task.strictVerify ? task.strictVerify : task.verify;
    const out = fn({ answer, ...metrics });
    verdict = { pass: out.pass, score: out.pass ? 1 : 0, note: out.note };
  }

  return {
    id: task.id,
    grader: task.grader,
    pass: verdict.pass,
    score: verdict.score,
    note: verdict.note,
    answer,
    durationMs: Date.now() - startedAt,
    ...metrics,
  };
}

async function runSuite(version) {
  const rows = [];
  for (const task of TASKS) rows.push(await runTask(task, version));
  return {
    version,
    verifier: STRICT ? "strict (old, non-normalized)" : "normalized (fixed)",
    rows,
    passed: rows.filter((r) => r.pass).length,
    total: rows.length,
    toolCalls: rows.reduce((n, r) => n + r.toolCalls, 0),
    toolErrors: rows.reduce((n, r) => n + r.toolErrors, 0),
    tokens: rows.reduce((n, r) => n + r.tokens, 0),
    durationMs: rows.reduce((n, r) => n + r.durationMs, 0),
  };
}

// ============ 7. Report ============

const CJK = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/;
const width = (s) => [...String(s)].reduce((n, ch) => n + (CJK.test(ch) ? 2 : 1), 0);
const pad = (s, n) => String(s) + " ".repeat(Math.max(0, n - width(s)));
const padL = (s, n) => " ".repeat(Math.max(0, n - width(s))) + String(s);

function printReport(report) {
  console.log(`\n=== Report · Prompt ${report.version} · Verifier ${report.verifier} ===`);
  console.log(
    pad("Task", 18) + pad("Grader", 14) + pad("Result", 8) + padL("Score", 6) +
    padL("Calls", 6) + padL("Errs", 6) + padL("Tokens", 10) + padL("Duration", 10)
  );
  console.log("-".repeat(79));
  for (const r of report.rows) {
    console.log(
      pad(r.id, 18) + pad(r.grader, 14) + pad(r.pass ? "pass" : "FAIL", 8) +
      padL(r.score.toFixed(2), 6) + padL(r.toolCalls, 6) + padL(r.toolErrors, 6) +
      padL(r.tokens.toLocaleString("en-US"), 10) + padL(`${r.durationMs}ms`, 10)
    );
  }
  console.log("-".repeat(79));
  const rate = ((report.passed / report.total) * 100).toFixed(0);
  console.log(
    `Pass rate ${report.passed}/${report.total} (${rate}%) · Tool calls ${report.toolCalls} · ` +
    `Tool errors ${report.toolErrors} · Tokens ${report.tokens.toLocaleString("en-US")} · Total ${report.durationMs}ms`
  );
  const failed = report.rows.filter((r) => !r.pass);
  if (failed.length) {
    console.log("\nFailed cases:");
    for (const r of failed) {
      console.log(`  [${r.id}] Criteria: ${r.note}`);
      console.log(`  Agent answer: ${r.answer}`);
    }
  }
}

function printDiff(a, b) {
  console.log(`\n=== Score delta ${a.version} -> ${b.version} ===`);
  console.log(pad("Task", 18) + padL(a.version, 7) + padL(b.version, 7) + "  Change");
  console.log("-".repeat(50));
  for (let i = 0; i < a.rows.length; i++) {
    const x = a.rows[i], y = b.rows[i];
    let mark = "flat";
    if (!x.pass && y.pass) mark = "fail => pass";
    else if (x.pass && !y.pass) mark = "pass => FAIL";
    else if (y.score !== x.score) mark = `score ${(y.score - x.score).toFixed(2)}`;
    console.log(pad(x.id, 18) + padL(x.score.toFixed(2), 7) + padL(y.score.toFixed(2), 7) + "  " + mark);
  }
  console.log("-".repeat(50));
  console.log(`Pass rate ${a.passed}/${a.total} -> ${b.passed}/${b.total}`);
}

// ============ 8. Entry point ============

const reportV1 = await runSuite("v1");
printReport(reportV1);
const reportV2 = await runSuite("v2");
printReport(reportV2);
printDiff(reportV1, reportV2);
```

## Recovering lesson 3's trap: overly strict verifiers

Lesson 3 covered a trap, official's exact words: avoid overly strict verifiers that reject correct responses due to spurious differences like formatting, punctuation, or valid alternative phrasings[^S3]. Sounds like common sense but nearly unavoidable in code, because overly strict verifiers are the easiest to write.

The track has one embedded. `t1-total` has two verifier versions; the old is `pass: r.answer.includes("1280.00")` — looks bulletproof: the correct answer is 1280.00, so check if the answer contains that string. Run `node eval-runner.mjs --strict-verify` (only pasting v1 report below; v2 report and delta table print as usual):

```text
=== Report · Prompt v1 · Verifier strict (old, non-normalized) ===
Task              Grader         Result   Score  Calls  Errs   Tokens     Duration
-----------------------------------------------------------------------------------
t1-total          deterministic  FAIL     0.00      3     0     1,800      122ms
t2-pending        deterministic  pass     1.00      1     0       995       83ms
t3-no-orderid     deterministic  FAIL     0.00      2     1     1,550      124ms
t4-refund-note    LLM judge      FAIL     0.67      1     0     1,432      124ms
t5-missing-order  deterministic  pass     1.00      1     1       966       82ms
-----------------------------------------------------------------------------------
Pass rate 2/5 (40%) · Tool calls 8 · Tool errors 2 · Tokens 6,743 · Total 535ms

Failed cases:
  [t1-total] Criteria: Answer must contain literal string 1280.00
  Agent answer: Customer Qiming Tech has 2 complete orders in Aug 2026 (SO-1001, SO-1002), total ¥1,280.00.
  [t3-no-orderid] Criteria: When params incomplete should call zero tools, ask for order ID
  Agent answer: Order SO-1001 status is complete.
  [t4-refund-note] Criteria: Amount matches order, tone appropriate; but refund arrival time missing, customer has no expectation, missing 1 of 3 items.
  Agent answer: Hello, order SO-1003 (amount ¥320.00) cancellation received, refund will be returned to original payment method. Sorry for the inconvenience.
```

This is also from a real run. Look at the `t1-total` detail: agent answered "total ¥1,280.00" — amount correct, orders correct, wording is normal. Its only crime is putting a thousand separator comma between 1 and 280, so `includes("1280.00")` returns false, and a fully correct answer gets graded fail.

**At this point fix the verifier, not the agent.** Reports only tell you "t1 fail," won't tell you whose fault it is; the way to tell is reading the agent's actual words in the detail — that's exactly why reports print the raw answer. The fix is normalization. Official's description of exact match already includes this step: exact match evaluates whether model output matches a predefined correct answer, typically after normalizing whitespace and case[^S5]. Amount scenarios need more washing — currency symbols, thousand separators, units, so the fixed verifier washes noise first, extracts numbers then compares numerically:

```javascript
function amountsIn(s) {
  return [...s.replace(/[,，\s¥￥]/g, "").matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}
verify: (r) => ({
  pass: amountsIn(r.answer).some((n) => Math.abs(n - 1280) < 0.005),
  note: "Answer must contain 1280 (allows currency symbol, thousand separator, unit)",
}),
```

Drop `--strict-verify` and run again; `t1-total` flips from 0.00 to 1.00, v1 baseline climbs from 2/5 back to 3/5 — and in between, the agent didn't change a single character, the stub's response queue didn't change a single character. **Score changed but system under test didn't — that's the litmus test for "verifier problem."**

One aside on scope: normalization isn't the looser the better. Loosen to "appears to contain 1280 passes," and agent answering "total 1280 orders, amount unknown" also passes. Verifiers should sit at "let irrelevant differences through, block substantive errors" — finding that position's only method is trying with real answers.

## Change one prompt location, watch the score move

Track calibrated, ready for real work. I only changed one spot — system prompt, added two rules after v1:

```javascript
const SYSTEM_PROMPTS = {
  v1: "You are an order assistant. Use tools to query orders, then answer user.",
  v2:
    "You are an order assistant. Use tools to query orders, then answer user.\n" +
    "Two hard rules:\n" +
    "1. When user hasn't provided order ID, ask for order ID first, don't guess one to query.\n" +
    "2. Refund notices to customers must state refund amount and arrival time.",
};
```

These two aren't made up; they're read from v1 report's "Failed cases": `t3` fails because it guessed an order ID when params incomplete, `t4` got deducted because missing arrival time. **Report says what, you change what** — that's the most concrete difference between having a track and not. Without a track, after changing the prompt you can glance at output and feel "seems better"; with a track, "which one improved, which stayed flat, did anything regress" is three lines of numbers.

Re-run, the delta table is the last segment of the opening output: pass rate from 60% to 100%, two tasks flip from fail to pass, the other three don't budge. That last half-sentence matters as much as the first — it says this change didn't break already-working things. Without a track, after changing the prompt you only look at output once and think "looks better"; with a track, "which improved / which flat / any regress" are three number rows.

Official's phrasing for this is: with evals you can measure prompt engineering's impact with greater confidence; even small refinements to tool descriptions can yield dramatic improvements[^S3]. There's a bargain to grab here too: in early agent development changes tend to have dramatic impact because low-hanging fruit is still abundant — one prompt tweak might boost success rate from 30% to 80%; with effect sizes this large you can spot changes with just a few test cases[^S2]. You only have five tasks now — that's not a deficit, it's the starting point.

Look at the metric columns again: v2's tool calls dropped from 8 to 6, tool errors from 2 to 1, tokens down nearly a thousand, because `t3` no longer guesses blindly to call tools. **Same change simultaneously improved accuracy and cost** — this kind of thing only becomes visible when you record these columns together.

## Scope: what this track manages, what it doesn't

**What it manages**: one agent, one batch of tasks, run once on your machine, produce a human-readable report.

**Swapping in a real model** — track structure doesn't change. Replace `stubClient(...)` with `@anthropic-ai/sdk`'s real client; the while-loop in `runTask` doesn't change a line — it's already written to real API's `stop_reason` / `tool_use` / `tool_result` shape; `model` and `max_tokens` required params are already there (stub ignores them, real client uses them). After swapping two things change: scores will jitter because agents are nondeterministic across runs even with identical prompts[^S2], so don't over-read single runs; running a round costs money and time, five tasks don't matter but two hundred need to consider concurrency and cost.

**What it doesn't manage**: hooking evals into CI, running on every commit, comparing against historical versions, blocking merges when scores drop below threshold — these are common engineering practices and do work well, but this lesson doesn't expand on them. Exercise Level 2 will walk you through "compare two reports," the remaining orchestration is your CI's job.

One more lesson 5 discipline to repeat: **don't tune against the hold-out set**. You follow reports to change prompts; after several rounds scores will definitely climb, but the climb might just be "scores on these five tasks." Official's practice is relying on held-out test sets to ensure no overfitting to the "training" evals[^S3]. So in real setup tasks should split into two piles: one runs daily for guidance, the other locks up and only opens when you think "this version should work" — the first pile's scores are navigation, the second pile's scores are verdict.

Last old reminder: auto-evals will miss things. Human testers always hit edge cases evals miss — unusual queries' hallucinations, systemic failures, subtle source selection biases[^S2]. Track running smoothly doesn't mean stop using it yourself.

## 💻 Exercises

<!-- exercises -->

### Level 1: Read reports, don't rush to change code

No code. Return to the two reports at the lesson opening (v1 baseline and v2 post-change), summary lines are:

```text
v1: Pass rate 3/5 (60%)  · Tool calls 8 · Tool errors 2 · Tokens 6,743
v2: Pass rate 5/5 (100%) · Tool calls 6 · Tool errors 1 · Tokens 5,766
```

Against the full two tables answer three questions, three to five sentences each:

1. `t1-total` passes in both reports but has highest tool call count at 3. What problem does this indicate? What should be changed?
2. v1 has 2 tool errors, v2 has 1. Are these two errors the same class of problem? What does each mean, should each be fixed?
3. The lesson has a third report (`--strict-verify` one) where `t1-total` is 0.00. Same task one report 0.00 one report 1.00 — how do you tell this score difference is the verifier's problem not the agent's?

<!-- rubric -->

- Question 1 must point out "`search_orders` only returns order IDs without amounts, so each order needs another `get_order` call" as cause-effect, note that order count scaling scales call count, and per S3's reading identify redundant calls as a signal that "pagination / return volume params need adjustment"; target to change must land on **tool** (make `search_orders` carry summary fields), not prompt or agent.
- Question 2 must distinguish the two errors' natures: `t3`'s is **invalid parameter** error (`search_orders({})`), per S3's reading points to tool description unclear or missing examples, should fix; `t5`'s is order itself nonexistent, is what this task **intentionally tests**, error appearing is expected. Answer must explicitly state "tool error count isn't lower-is-better."
- Question 3 must give operational criteria: both reports' agent answer text, call count, tokens all identical, only verifier changed, so change comes from grading side; and state judgment basis is reading agent's actual words in detail, confirming answer substantively correct (1,280.00 vs 1280.00 only differs by thousand separator).
- All three questions no code required; wrote code but didn't answer above judgments doesn't count as pass.

<!-- hint -->

Question 1 don't just stare at "3 is a lot," look at what `search_orders` returns. It returns `{ order_ids: [...] }` — only order IDs. Agent wants amount, besides calling `get_order` one by one is there another way?

<!-- hint -->

Question 3's key is controlling variables. Compare each column of `t1-total` row across both reports: call count, error count, tokens changed? Then compare agent's raw answer text in both details. Whichever column changed, problem is on that side.

<!-- answer -->

**Question 1.** `t1-total` needs 3 tool calls because `search_orders`' return value design caused it: only returns `{ order_ids: ["SO-1001", "SO-1002"] }`, no amount at all, agent wanting to compute total must call `get_order` again for each order ID. Call count is 1 + N where N is hit orders — looks okay with four orders, when customer has fifty orders this one task will hit fifty-one calls, tokens and duration scale linearly, easily hitting context limits.

Official's reading of this signal is: lots of redundant tool calls usually suggest pagination or token limit parameters need rightsizing[^S3]. Concrete fix is have `search_orders` directly return summary fields (order ID + status + amount), then add pagination params to control single-return volume. **Change the tool, not the prompt, not the agent.** This also explains why metrics beyond pass rate must be recorded — `t1` passes in both reports, looking only at pass rate you'd never discover this problem.

**Question 2.** Not the same class, the two errors' natures are opposite.

`t3-no-orderid`'s error is agent called `search_orders({})` without order ID, both filter params empty, tool rejected it — this is **invalid parameter** error. Official's reading is: these errors clustering together usually means tool descriptions could be clearer or need better examples[^S3]. This one should fix; v2 added "ask for order ID first" and it vanished. If not changing prompt, another direction is harden tool description or add `strict: true` to tool definition, making parameter constraints effective at API layer[^S6].

`t5-missing-order`'s error is querying `SO-9999`, tool reports "order doesn't exist." Not a defect, exactly what this task tests — after tool error will agent truthfully say not found or fabricate an amount. This task's verifier writes `r.toolErrors === 1`, meaning **this error must occur**; error count becoming 0 actually means test didn't hit the target. So tool error column isn't lower-is-better, depends on where errors come from; mixing the two classes and reading "errors from 2 down to 1, improved" is stirring a real fix with an expected behavior into one number.

**Question 3.** Criterion is controlling variables: compare `t1-total` row across both reports column by column — calls 3 vs 3, errors 0 vs 0, tokens 1,800 vs 1,800, agent side everything unchanged. Then look at detail; the `--strict-verify` report prints agent's actual words as "…total ¥1,280.00." — amount right, orders right, wording normal. Between two runs the only change is that command-line flag, meaning grading side, so score difference entirely from verifier: old version does `includes("1280.00")` literal comparison, tripped by thousand separator comma. This is exactly the error type official warned about — don't let verifiers reject correct answers due to format or punctuation spurious differences[^S3]. Change target is the `verify` function; changing agent to accommodate verifier is pinning track's defect on system under test.

This judgment being makeable relies on reports printing agent's raw answer into detail. If report only prints pass/fail you'd have to manually re-run once to see what it actually answered — for reports to work as evidence they must carry source material[^S4].

---

### Level 2: Add "two-run comparison" to the track

Write code, must be runnable. Add two things to `eval-runner.mjs`:

1. **Report persistence**: add `writeJsonAtomic(file, obj)`, use course 9's atomic write (write `.tmp` first then `rename`) to save one run's report as JSON. Command line supports `--version v1 --out reports/v1.json`.
2. **Write a `compare.mjs`**: read two report JSONs, print score diff by task (baseline score, new score, delta, status), print pass rate change at end; if any task flips from pass to fail, print a summary to stderr and exit with nonzero code.

Run these four commands and paste output:

```text
node eval-runner.mjs --version v1 --out reports/v1.json
node eval-runner.mjs --version v2 --out reports/v2.json
node compare.mjs reports/v1.json reports/v2.json   # should exit 0
node compare.mjs reports/v2.json reports/v1.json   # should exit 1
```

(Swapping param order simulates "new version worse than baseline," verifying the nonzero exit path actually works.)

<!-- rubric -->

- `writeJsonAtomic` must be "write temp file + `fs.renameSync`" two steps, can't directly `fs.writeFileSync(file, ...)` and call it done; must auto-create directory (`fs.mkdirSync(..., { recursive: true })`).
- Persisted JSON must be consumable by standalone `compare.mjs`: minimum include `version`, `passed`, `total` and a `rows` array, each row has `id`, `pass`, `score`. **Don't write `durationMs`** — duration jitters every run, writing it makes two JSONs never equal; writing it isn't wrong but comparison must ignore this column.
- `compare.mjs` must align two reports by task id, not array index — after tasks are added/deleted indices will misalign.
- After swapping entry point must delete orphaned `printDiff`, modified file can't leave uncalled functions.
- Exit code two tiers: has pass turning fail `process.exit(1)`, regression summary goes to stderr; no regression normal exit (0). Missing params can use other nonzero code (e.g. 2) to distinguish "usage error" from "has regression."
- Must paste real output of all four commands, third exits 0, fourth exits 1.

<!-- hint -->

Atomic write is just three lines, don't overthink: `fs.writeFileSync(file + ".tmp", JSON.stringify(obj, null, 2))`, then `fs.renameSync(file + ".tmp", file)`. Same-filesystem `rename` is atomic, so `compare.mjs` reads either complete old file or complete new file, never half-written.

<!-- hint -->

When judging regressions don't use score delta. Score dropping 1.00 to 0.67 is decline but might still be above pass line (judge task's pass line is 0.8); dropping 1.00 to 0.00 is definite fail. Directly compare the `pass` boolean field: `was.pass && !now.pass` is regression, score change prints separately as one column.

<!-- answer -->

**Modify `eval-runner.mjs`.** Add two imports and atomic-write function at file top:

```javascript
import fs from "node:fs";
import path from "node:path";

const STRICT = process.argv.includes("--strict-verify");

// Atomic write: write .tmp first, then rename — half-written file won't be read by compare.mjs
function writeJsonAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}
```

Then replace entire section 8 entry point — run one version at a time, write to specified file:

```javascript
// ============ 8. Entry point ============
// Usage: node eval-runner.mjs --version v1 --out reports/v1.json
const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const version = argOf("--version", "v1");
const out = argOf("--out", null);

const report = await runSuite(version);
printReport(report);

if (out) {
  writeJsonAtomic(out, {
    version: report.version,
    passed: report.passed,
    total: report.total,
    ranAt: new Date().toISOString(),
    rows: report.rows.map(({ id, pass, score, toolCalls, toolErrors, tokens }) => ({
      id, pass, score, toolCalls, toolErrors, tokens,
    })),
  });
  console.log(`\nReport written to ${out}`);
}
```

After swapping entry point `printDiff` has no caller — **delete this function entirely**, don't leave it as dead code. Its job from this point belongs to `compare.mjs`: `printDiff` can only compare two reports from the same process run; `compare.mjs` can compare any two runs, days apart or different machines. When persisting we deliberately stripped `durationMs` and `answer`: duration jitters every run, raw answer too long, both make JSON comparisons noisy.

**Full `compare.mjs`:**

```javascript
// compare.mjs — read two reports, print score diff by task; nonzero exit if pass turns fail
// Usage: node compare.mjs reports/v1.json reports/v2.json
import fs from "node:fs";

const [baseFile, headFile] = process.argv.slice(2);
if (!baseFile || !headFile) {
  console.error("Usage: node compare.mjs <baseline.json> <new.json>");
  process.exit(2);
}
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const base = read(baseFile);
const head = read(headFile);
const wasById = new Map(base.rows.map((r) => [r.id, r]));
const regressions = [];

console.log(`base ${baseFile} (${base.version})  ->  head ${headFile} (${head.version})`);
console.log("task".padEnd(18) + "base".padStart(6) + "head".padStart(7) + "delta".padStart(8) + "  status");
console.log("-".repeat(52));

for (const now of head.rows) {
  const was = wasById.get(now.id);
  if (!was) {
    console.log(now.id.padEnd(18) + "-".padStart(6) + now.score.toFixed(2).padStart(7) + "-".padStart(8) + "  new task");
    continue;
  }
  const delta = now.score - was.score;
  let state = "flat";
  if (was.pass && !now.pass) {
    state = "regression pass => FAIL";
    regressions.push(now.id);
  } else if (!was.pass && now.pass) {
    state = "fixed fail => pass";
  } else if (Math.abs(delta) > 1e-9) {
    state = delta > 0 ? "score up" : "score down";
  }
  console.log(
    now.id.padEnd(18) + was.score.toFixed(2).padStart(6) + now.score.toFixed(2).padStart(7) +
    (delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)).padStart(8) + "  " + state
  );
}

console.log("-".repeat(52));
console.log(`Pass rate ${base.passed}/${base.total} -> ${head.passed}/${head.total}`);
const missing = base.rows.filter((r) => !head.rows.some((n) => n.id === r.id)).map((r) => r.id);
if (missing.length) console.log(`Tasks missing in new report: ${missing.join(", ")}`);

if (regressions.length) {
  console.error(`\n${regressions.length} tasks flipped from pass to fail: ${regressions.join(", ")}`);
  process.exit(1);
}
console.log("\nNo tasks flipped from pass to fail.");
```

(This can safely use raw `padEnd`: padded columns are all ASCII task IDs and numbers; Chinese status words only appear at line end not participating in alignment; where columns contain Chinese text you still need width-aware `pad` from main lesson.)

**Real run output.** Both eval run reports same as main text, only keep last line here; the `exit code=` line is from appending `echo "exit code=$?"` after command.

```text
$ node eval-runner.mjs --version v1 --out reports/v1.json | tail -1
Report written to reports/v1.json

$ node eval-runner.mjs --version v2 --out reports/v2.json | tail -1
Report written to reports/v2.json
```

Forward comparison, no regression, exit 0:

```text
$ node compare.mjs reports/v1.json reports/v2.json
base reports/v1.json (v1)  ->  head reports/v2.json (v2)
task                base   head   delta  status
----------------------------------------------------
t1-total            1.00   1.00   +0.00  flat
t2-pending          1.00   1.00   +0.00  flat
t3-no-orderid       0.00   1.00   +1.00  fixed fail => pass
t4-refund-note      0.67   1.00   +0.33  fixed fail => pass
t5-missing-order    1.00   1.00   +0.00  flat
----------------------------------------------------
Pass rate 3/5 -> 5/5

No tasks flipped from pass to fail.
exit code=0
```

Swap the two files, simulating "new version reverted v2's changes," nonzero exit path also works:

```text
$ node compare.mjs reports/v2.json reports/v1.json
base reports/v2.json (v2)  ->  head reports/v1.json (v1)
task                base   head   delta  status
----------------------------------------------------
t1-total            1.00   1.00   +0.00  flat
t2-pending          1.00   1.00   +0.00  flat
t3-no-orderid       1.00   0.00   -1.00  regression pass => FAIL
t4-refund-note      1.00   0.67   -0.33  regression pass => FAIL
t5-missing-order    1.00   1.00   +0.00  flat
----------------------------------------------------
Pass rate 5/5 -> 3/5

2 tasks flipped from pass to fail: t3-no-orderid, t4-refund-note
exit code=1
```

Two implementation details worth keeping. One is aligning by `id` not index — the `wasById` Map does this, when you insert a new task into the eval set later, old reports still compare. Two is regression judgment uses `was.pass && !now.pass`, not score threshold: `t4` dropping 1.00 to 0.67 is score decline **and** crossed judge's 0.8 pass line, both conditions met is regression; if rubric gets tuned someday and pass line follows, this code doesn't need changing.

<!-- /exercises -->

## Recap

- Standard eval running shape is programmatic direct API calls plus simple agentic loops — **one eval task per loop**; tasks don't share `messages` or previous task's context will contaminate the next, results no longer comparable[^S3].
- Each eval prompt should be paired with a verifiable result; verifiers from exact string comparison to asking model to judge form a spectrum — anything gradable by code never goes to judge because code-based grading is fastest, most reliable, scales extremely well[^S3][^S5].
- Free-form text goes to judge; shape is single call, single prompt, output 0.0–1.0 score plus pass/fail; rubric must reason first then score, output format locked[^S2][^S5].
- Beyond pass rate reports must record task duration, tool call count, token consumption, tool errors; these columns self-document — redundant calls point to pagination/return-volume params needing adjustment, invalid-param errors point to tool descriptions needing clarity[^S3].
- Overly strict verifiers reject correct answers: format, punctuation, reasonable different phrasing can all trip literal comparison; do normalization before exact match[^S3][^S5]. Score changed but system under test didn't — verifier's fault.
- With a track prompt change's impact becomes measurable; even small refinements can yield dramatic improvements; early effect sizes are large, a few cases suffice to spot differences[^S3][^S2]. Report itself is evidence reviewable by others, faster than re-running verification yourself, works for sessions you weren't watching[^S4].
- Follow reports to change prompts and scores will climb, but climb might just be on this batch of tasks; lock the hold-out set to prevent overfitting[^S3]. Auto-evals have blind spots; human testers still catch edge cases evals miss[^S2].

## After completing this course

Looking back the main thread is actually short. Lesson 1 separated "looks done" from "is done" — without runnable checks, "looks done" is the only available signal, and you become the verification step[^S4]. Lesson 2 set what to verify: agents might walk completely different reasonable paths to the same goal, so evaluate end state, don't step-by-step check trajectory[^S2]. Lesson 3 made "checks" into runnable deterministic verifiers outputting pass/fail, also warned overly strict verifiers reject correct answers[^S3]. Lesson 4 handled free-form text — rubrics, output format, and working model shouldn't grade itself[^S2][^S4]. Lesson 5 solved "how many cases to verify with": twenty-ish real tasks can start, don't wait to accumulate hundreds before beginning[^S2]. This lesson welded the first five into a three-hundred-line file.

That file isn't complex, runs in under two seconds, but what it changes is concrete: from today when you change a prompt version, you don't rely on "read a few output paragraphs feeling better" to judge — run one command, the v1-to-v2 delta table speaks for you, just like this time `t3` and `t4` turned green while other three stayed flat. Next time your agent says "done," you have two commands and one exit code to verify that claim.

Next time your agent says "done," you have a runnable track to verify.

